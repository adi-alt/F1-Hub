"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Calendar, Clock, Compass, Flag, MapPin, Search, Settings, Sparkles, User, Users, Zap, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog, Sheet } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { EYEBROW } from "@/components/ui/panel";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { EntityAvatar } from "@/components/EntityAvatar";
import { PersonAvatar } from "@/components/avatar/PersonAvatar";
import { continueInApex } from "@/components/apex/askApex";
import { useApexScope } from "@/components/apex/ApexScopeProvider";
import { groupResults, parseQuery, type SearchKind, type SearchResult } from "@/lib/searchQuery";
import { readRecent, rememberRecent } from "./recentSearches";

const KIND_ICON: Record<SearchKind, LucideIcon> = { action: Zap, section: Compass, driver: User, team: Flag, circuit: MapPin, race: Calendar, season: Calendar, community: Users, person: User };
const DEBOUNCE_MS = 100;
/** A question asks Apex by itself once the typing has settled this long; Tab or Enter on the row asks at once. */
const AUTO_ASK_MS = 800;
const INTENT_MS = 350;

// Per page session: a query typed again, or Backspace back to one, answers from here at once.
const resultCache = new Map<string, SearchResult[]>();
const intentCache = new Map<string, SearchResult[]>();
// The Ask Apex request in flight. One palette exists, so one slot: typing, a new question or closing aborts it.
let askController: AbortController | null = null;

type Answer =
  | { status: "loading"; question: string }
  | { status: "done"; question: string; answer: string; sources: SearchResult[] }
  | { status: "unavailable"; question: string; message: string };

type Row = { type: "result"; result: SearchResult } | { type: "ask" };

/** Why Apex can't answer, in words; the route's guard reasons, else the generic capacity notice. */
function unavailableMessage(reason: string | undefined): string {
  if (reason === "AI_DISABLED") return "Apex is switched off right now. Here's what search found.";
  if (reason === "USER_RATE_LIMITED") return "You've asked Apex a lot just now. Try again in a minute.";
  return "Apex is at capacity right now. Try again in a moment.";
}

const subscribeMedia = (cb: () => void) => {
  const mq = window.matchMedia("(max-width: 767px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useIsPhone = () =>
  useSyncExternalStore(
    subscribeMedia,
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );

async function getJson<T>(url: string, init: RequestInit): Promise<T | null> {
  const res = await fetch(url, init).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

/** The palette: grouped results with one keyboard path through every group, actions, and Ask Apex. */
export function PaletteDialog({ open, onClose, uid }: { open: boolean; onClose: () => void; uid: string }) {
  const router = useRouter();
  const apexScope = useApexScope();
  const reduceMotion = useReducedMotion();
  const isPhone = useIsPhone();
  const [query, setQuery] = useState("");
  // The last answered query's results, shown while the next one loads, so the list doesn't blink empty.
  const [fetched, setFetched] = useState<{ key: string; results: SearchResult[] }>({ key: "", results: [] });
  const [, setIntentVersion] = useState(0);
  const [active, setActive] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [recent, setRecent] = useState<SearchResult[]>(() => readRecent(uid));
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const parsed = parseQuery(query);
  const key = query.trim().toLowerCase();
  const cachedResults = resultCache.get(key);
  const results = cachedResults ?? fetched.results;
  const loading = !cachedResults && fetched.key !== key;
  const intent = intentCache.get(key) ?? [];

  // Results: from the cache at once, else debounced with the previous request aborted, so only the settled query is answered.
  useEffect(() => {
    if (!open || resultCache.has(key)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const body = await getJson<{ results?: SearchResult[] }>(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const next = body?.results ?? [];
      if (body) resultCache.set(key, next);
      setFetched({ key, results: next });
    }, key ? DEBOUNCE_MS : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, open, query]);

  // Natural-language navigation, only when the cheap parser found nothing to open: a few words, not a question.
  const plainHits = results.some((r) => r.kind !== "action" && r.kind !== "section");
  const wantsIntent = open && parsed.mode === "search" && !parsed.question && !loading && !plainHits && parsed.raw.split(/\s+/).length >= 3;
  useEffect(() => {
    if (!wantsIntent || intentCache.has(key)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const body = await getJson<{ results?: SearchResult[] }>("/api/ai/search-intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: query.trim() }), signal: controller.signal });
      if (controller.signal.aborted) return;
      intentCache.set(key, body?.results ?? []);
      setIntentVersion((v) => v + 1);
    }, INTENT_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [wantsIntent, key, query]);

  async function ask(question: string) {
    const q = question.trim();
    if (q.length < 2) return;
    askController?.abort();
    const controller = new AbortController();
    askController = controller;
    setAnswer({ status: "loading", question: q });
    const body = await getJson<{ answer?: string; isFallback?: boolean; fallbackReason?: string }>("/api/ai/ask-apex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Site-wide, never the page behind the palette: no page context goes up, and the route grounds the
      // answer in the records of whatever the question names.
      body: JSON.stringify({ question: q, history: [], context: { page: "search" } }),
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    if (!body?.answer || body.isFallback) {
      setAnswer({ status: "unavailable", question: q, message: unavailableMessage(body?.fallbackReason) });
      return;
    }
    const text = body.answer;
    setAnswer({ status: "done", question: q, answer: text, sources: [] });
    // The source chips: the real pages the question and answer name.
    const found = await getJson<{ results?: SearchResult[] }>(`/api/search?mentions=${encodeURIComponent(`${q}\n${text}`.slice(0, 1800))}`, { signal: controller.signal });
    if (!controller.signal.aborted && found?.results?.length) setAnswer({ status: "done", question: q, answer: text, sources: found.results });
  }

  // A question asks by itself once typing settles.
  useEffect(() => {
    if (!open || !parsed.question) return;
    const timer = setTimeout(() => void ask(query), AUTO_ASK_MS);
    return () => clearTimeout(timer);
    // `ask` is recreated every render; the query is what decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, parsed.question, key]);

  // Typing a new query drops the old answer and its in-flight request; so does closing.
  const changeQuery = (value: string) => {
    askController?.abort();
    setAnswer(null);
    setActive(0);
    setQuery(value);
  };
  const close = () => {
    askController?.abort();
    setAnswer(null);
    setQuery("");
    setActive(0);
    onClose();
  };

  const showRecent = parsed.mode === "empty" && recent.length > 0;
  const groups = useMemo(() => {
    const g = groupResults(results);
    return [...(showRecent ? [{ kind: "recent", heading: "Recent", items: recent }] : []), ...(intent.length ? [{ kind: "intent", heading: "Closest matches", items: intent }] : []), ...g];
  }, [results, intent, recent, showRecent]);
  const canAsk = parsed.mode === "search" && query.trim().length >= 3;
  const rows: Row[] = [...(canAsk && parsed.question ? [{ type: "ask" } as const] : []), ...groups.flatMap((g) => g.items.map((result) => ({ type: "result", result }) as const)), ...(canAsk && !parsed.question ? [{ type: "ask" } as const] : [])];
  const activeIndex = Math.min(active, Math.max(rows.length - 1, 0));
  // A source chip for a page the list already shows would say the same thing twice.
  const listed = new Set(groups.flatMap((g) => g.items.map((r) => r.href)));

  const choose = (row: Row | undefined) => {
    if (!row) return;
    if (row.type === "ask") return void ask(query);
    rememberRecent(uid, row.result);
    setRecent(readRecent(uid));
    if (row.result.external) {
      window.open(row.result.href, "_blank", "noopener,noreferrer");
      return close();
    }
    close();
    router.push(row.result.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (rows.length ? (Math.min(i, rows.length - 1) + 1) % rows.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (rows.length ? (Math.min(i, rows.length - 1) - 1 + rows.length) % rows.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(rows[activeIndex]);
    } else if (e.key === "Tab" && !e.shiftKey && canAsk) {
      e.preventDefault();
      void ask(query);
    }
  };

  const optionId = (i: number) => `${listId}-${i}`;
  const askFirst = rows[0]?.type === "ask" ? 1 : 0;
  const groupStart = groups.map((_, gi) => askFirst + groups.slice(0, gi).reduce((n, g) => n + g.items.length, 0));
  const renderRow = (row: Row, i: number) => {
    const on = i === activeIndex;
    return (
      <div
        key={row.type === "ask" ? "ask" : `${row.result.kind}:${row.result.href}:${row.result.label}`}
        id={optionId(i)}
        role="option"
        aria-selected={on}
        onMouseMove={() => setActive(i)}
        onClick={() => choose(row)}
        className={`relative flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-3 py-1.5 transition-colors duration-fast ${on ? "bg-white/[0.07]" : ""}`}
      >
        {/* The palette's one red element: where the keyboard is. */}
        {on && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand" />}
        {row.type === "ask" ? <AskRow query={query.trim()} /> : <ResultRow result={row.result} />}
      </div>
    );
  };

  const Overlay = isPhone ? Sheet : Dialog;
  return (
    <Overlay open={open} onClose={close} title="Search Apex F1 Hub" size="lg" initialFocusRef={inputRef}>
      <div className={`flex min-h-0 flex-col gap-3 ${isPhone ? "h-[calc(100dvh-140px)]" : ""}`}>
        <label className="flex h-11 items-center gap-2.5 rounded-control border border-white/[0.08] bg-white/[0.03] px-3 focus-within:border-white/[0.18]">
          <Icon icon={Search} size={16} className="text-tertiary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls={listId}
            aria-activedescendant={rows.length ? optionId(activeIndex) : undefined}
            aria-autocomplete="list"
            aria-label="Search, run a command with >, or ask Apex a question"
            placeholder="Search, > for commands, or ask Apex…"
            maxLength={120}
            className="h-full min-w-0 flex-1 bg-transparent text-body text-primary placeholder:text-tertiary focus-visible:outline-none"
          />
          {loading && <span className="text-caption text-tertiary">Searching…</span>}
        </label>

        <AnimatePresence initial={false}>
          {answer && (
            <motion.section
              key="answer"
              aria-label="Apex's answer"
              initial={reduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="rounded-card border border-white/[0.08] bg-white/[0.025] px-4 py-3"
            >
              <p className={`${EYEBROW} flex items-center gap-1.5`}>
                <Icon icon={Sparkles} size={16} /> Apex
              </p>
              <div aria-live="polite" aria-busy={answer.status === "loading"} className="mt-2 text-body-sm text-secondary">
                {answer.status === "loading" && (
                  <SkeletonGroup label={`Apex is thinking about “${answer.question}”`} delay={false}>
                    <Skeleton />
                    <Skeleton className="w-11/12" />
                    <Skeleton className="w-2/3" />
                  </SkeletonGroup>
                )}
                {answer.status === "unavailable" && <p className="text-tertiary">{answer.message}</p>}
                {answer.status === "done" && <p className="whitespace-pre-line text-primary">{answer.answer}</p>}
              </div>
              {answer.status === "done" && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {answer.sources.filter((s) => !listed.has(s.href)).map((s) => (
                    <Link key={s.href} href={s.href} onClick={close} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/[0.1] px-2.5 text-caption text-secondary transition-colors duration-fast hover:border-white/[0.2] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
                      <Icon icon={KIND_ICON[s.kind]} size={16} />
                      {s.label}
                    </Link>
                  ))}
                  {apexScope && (
                    <Button
                      variant="secondary"
                      size="sm"
                      iconEnd={ArrowRight}
                      onClick={() => {
                        continueInApex([
                          { role: "user", content: answer.question },
                          { role: "assistant", content: answer.answer },
                        ]);
                        close();
                      }}
                    >
                      Continue in Apex
                    </Button>
                  )}
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        <div id={listId} role="listbox" aria-label="Results" className={`-mx-1 overflow-y-auto px-1 ${isPhone ? "min-h-0 flex-1" : "max-h-[min(60vh,520px)]"}`}>
          {askFirst === 1 && renderRow(rows[0], 0)}
          {loading && groups.length === 0 && (
            <SkeletonGroup label="Searching…" className="flex flex-col gap-1 px-3 pt-2">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="flex min-h-11 items-center gap-3">
                  <Skeleton shape="circle" className="size-8 shrink-0" />
                  <Skeleton className="w-1/2" />
                </span>
              ))}
            </SkeletonGroup>
          )}
          {groups.map((g, gi) => (
            <div key={g.kind} role="group" aria-labelledby={`${listId}-h-${g.kind}`} className="pt-2 first:pt-0">
              <div id={`${listId}-h-${g.kind}`} role="presentation" className={`${EYEBROW} flex items-center gap-1.5 px-3 pb-1 pt-2`}>
                {g.kind === "recent" && <Icon icon={Clock} size={16} />}
                {g.heading}
              </div>
              {g.items.map((result, j) => renderRow({ type: "result", result }, groupStart[gi] + j))}
            </div>
          ))}
          {askFirst === 0 && rows.at(-1)?.type === "ask" && renderRow({ type: "ask" }, rows.length - 1)}
          {parsed.mode !== "empty" && !loading && rows.length === 0 && <p className="px-3 py-6 text-center text-body-sm text-tertiary">Nothing found.</p>}
        </div>
      </div>
      <p className="hidden pb-5 pt-3 text-caption text-tertiary md:block">↑ ↓ move · Enter open · Tab ask Apex · &gt; commands · Esc close</p>
      <p className="sr-only" aria-live="polite">
        {parsed.mode !== "empty" && !loading ? `${rows.length} result${rows.length === 1 ? "" : "s"}` : ""}
      </p>
    </Overlay>
  );
}

function AskRow({ query }: { query: string }) {
  return (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-white/[0.05] text-secondary">
        <Icon icon={Sparkles} size={16} />
      </span>
      <span className="min-w-0 flex-1 truncate text-body-sm text-primary">
        Ask Apex about “{query}”
      </span>
      <kbd className="hidden shrink-0 rounded border border-white/[0.1] px-1.5 text-caption text-tertiary md:inline">Tab</kbd>
    </>
  );
}

function ResultRow({ result: r }: { result: SearchResult }) {
  return (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-control bg-white/[0.04] text-secondary">
        {r.person ? (
          <PersonAvatar id={r.person.id} avatar={r.person.avatar} size={32} />
        ) : r.image || r.kind === "driver" ? (
          // A driver with no headshot gets their initials, ringed in their team's colour, not a generic person icon.
          <span className="rounded-full" style={!r.image && r.color ? { boxShadow: `0 0 0 2px ${r.color}` } : undefined}>
            <EntityAvatar imageUrl={r.image ?? null} name={r.label.replace(/ in \d{4}$/, "")} size={r.image ? 32 : 28} shape={r.kind === "team" ? "square" : "circle"} fit={r.kind === "team" ? "contain" : "cover"} />
          </span>
        ) : r.shape ? (
          <svg viewBox={r.shape.viewBox} className="size-6" aria-hidden>
            <path d={r.shape.path} fill="none" stroke="currentColor" strokeWidth={36} strokeLinejoin="round" />
          </svg>
        ) : (
          <Icon icon={r.kind === "section" && r.detail?.startsWith("Settings") ? Settings : KIND_ICON[r.kind]} size={16} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          {r.color && <span aria-hidden className="h-3 w-1 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />}
          <span className="truncate text-body-sm font-medium text-primary">{r.label}</span>
        </span>
        {r.detail && <span className="truncate text-caption text-tertiary">{r.detail}</span>}
      </span>
      {r.meta && <span className="shrink-0 text-caption tabular-nums text-secondary">{r.meta}</span>}
    </>
  );
}
