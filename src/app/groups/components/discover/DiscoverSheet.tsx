"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Picker } from "@/components/ui/Picker";
import { DISCOVER_SORTS, type DiscoverSort } from "@/lib/communities";
import type { PublicGroupSummary } from "@/lib/supabase/groups";
import { CommunityCard } from "../CommunityCard";
import { GroupCardSkeleton } from "../GroupCardSkeleton";
import { JoinGroupForm } from "../JoinGroupForm";
import { TopicFilter } from "./TopicFilter";

type Facet = { topic: string; count: number };
type Page = { communities: PublicGroupSummary[]; nextCursor: string | null; total: number; facets: Facet[] };

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Discover, as a full-screen sheet on mobile and a large panel on desktop.
 *
 * Request lifecycle is the fiddly part and it's handled explicitly rather than hopefully:
 *
 *  - every filter change starts a fresh first page, and aborts whatever was in flight
 *  - a `requestId` ref guards against a slow earlier response overwriting a newer one even when
 *    the abort lands too late (AbortController alone doesn't close that window - a response can
 *    already be parsing)
 *  - search is debounced, and the abort means typing quickly never queues N requests
 *  - pagination dedupes by id on merge, so a community that shifted page boundaries between
 *    requests can't render twice
 *  - a failed "load more" keeps everything already loaded and offers a retry
 */
export function DiscoverSheet({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [sort, setSort] = useState<DiscoverSort>("recommended");

  const [communities, setCommunities] = useState<PublicGroupSummary[] | null>(null);
  const [facets, setFacets] = useState<Facet[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(false);
  const [listError, setListError] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const buildUrl = useCallback(
    (nextCursor?: string) => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      params.set("sort", sort);
      // Repeated params, not comma-joined - a topic is free text and can contain a comma.
      for (const topic of topics) params.append("topic", topic);
      if (nextCursor) params.set("cursor", nextCursor);
      return `/api/groups?${params.toString()}`;
    },
    [query, sort, topics],
  );

  // First page, refetched whenever the query/topics/sort change. Debounced so typing doesn't fire
  // one request per keystroke.
  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setListError(false);

      fetch(buildUrl(), { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error("failed");
          return res.json() as Promise<Page>;
        })
        .then((body) => {
          // A stale response must never win, even if its abort arrived too late to stop the parse.
          if (id !== requestId.current) return;
          setCommunities(body.communities);
          setFacets(body.facets);
          setTotal(body.total);
          setCursor(body.nextCursor);
        })
        .catch((err: unknown) => {
          if (id !== requestId.current || (err as Error)?.name === "AbortError") return;
          setListError(true);
          setCommunities([]);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [buildUrl]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !cursor) return;
    setLoadingMore(true);
    setPageError(false);
    try {
      const res = await fetch(buildUrl(cursor));
      if (!res.ok) throw new Error("failed");
      const body = (await res.json()) as Page;
      setCommunities((prev) => {
        const seen = new Set((prev ?? []).map((c) => c.id));
        return [...(prev ?? []), ...body.communities.filter((c) => !seen.has(c.id))];
      });
      setCursor(body.nextCursor);
    } catch {
      // Everything already loaded stays on screen - a failed page never destroys the list.
      setPageError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [buildUrl, cursor, loadingMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !cursor) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), { rootMargin: "300px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const activeFilters = topics.length > 0 || query.trim().length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/50 backdrop-blur-[2px] sm:items-start sm:p-6 sm:pt-10" onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Discover communities"
        initial={{ opacity: 0, y: 20, scale: 0.995 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.995 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col overflow-hidden border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl sm:h-auto sm:max-h-[85vh] sm:max-w-5xl sm:rounded-2xl sm:border"
      >
        <header className="shrink-0 border-b border-white/10 px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Discover Communities</h2>
              <p className="mt-0.5 text-xs text-neutral-500">Find people and spaces around what interests you.</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/40 text-white/70 transition hover:bg-black/60 hover:text-white"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
                <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="relative mt-4">
            <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" fill="none" aria-hidden>
              <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="m13.5 13.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search communities..."
              aria-label="Search communities"
              autoFocus
              className="w-full rounded-xl border border-[var(--f1-line)] bg-black/30 py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-500 transition hover:text-white"
              >
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          {/* Scrolls horizontally on a narrow screen instead of wrapping into a tall stack. */}
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5">
            <TopicFilter facets={facets} selected={topics} onChange={setTopics} />
            <Picker
              options={DISCOVER_SORTS}
              value={sort}
              onChange={(next) => setSort(next as DiscoverSort)}
              ariaLabel="Sort communities"
              className="w-44 shrink-0"
            />
            {activeFilters && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setTopics([]);
                }}
                className="shrink-0 text-xs text-neutral-500 transition hover:text-white"
              >
                Clear all
              </button>
            )}
            {communities !== null && (
              <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-neutral-600 tabular-nums">
                {total} {total === 1 ? "community" : "communities"}
              </span>
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {communities === null ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <GroupCardSkeleton key={i} />
              ))}
            </div>
          ) : listError ? (
            <ErrorState onRetry={() => setQuery((q) => q)} />
          ) : communities.length === 0 ? (
            <EmptyState query={query} topics={topics} onClearTopics={() => setTopics([])} />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {communities.map((community, i) => (
                  <CommunityCard
                    key={community.id}
                    community={community}
                    index={i}
                    onJoined={(id) => setCommunities((prev) => (prev ?? []).map((c) => (c.id === id ? { ...c, isMember: true } : c)))}
                  />
                ))}
              </div>

              {cursor && (
                <div ref={sentinelRef} className="pt-4">
                  {loadingMore && (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <GroupCardSkeleton key={i} />
                      ))}
                    </div>
                  )}
                  {pageError && (
                    <p className="py-3 text-center text-xs text-neutral-500">
                      Couldn&apos;t load more.{" "}
                      <button type="button" onClick={() => void loadMore()} className="text-neutral-300 underline-offset-2 hover:text-white hover:underline">
                        Retry
                      </button>
                    </p>
                  )}
                </div>
              )}

              {!cursor && communities.length > 6 && <p className="pt-6 text-center text-xs text-neutral-600">That&apos;s every community matching this.</p>}
            </>
          )}

          <div className="mt-8 border-t border-[var(--f1-line)] pt-5">
            <p className="mb-2 text-xs text-neutral-500">Have an invite link to a private community?</p>
            <JoinGroupForm compact />
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-[var(--f1-line)] bg-black/20 p-10 text-center">
      <p className="text-sm font-semibold text-neutral-300">Something went wrong loading communities.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-full border border-[var(--f1-line)] px-4 py-1.5 text-xs font-semibold text-neutral-200 transition hover:border-white/30"
      >
        Retry
      </button>
    </div>
  );
}

function EmptyState({ query, topics, onClearTopics }: { query: string; topics: string[]; onClearTopics: () => void }) {
  const trimmed = query.trim();

  // Three genuinely different dead ends, each with the action that actually gets you out of it -
  // never one generic "no results".
  if (trimmed) {
    return (
      <div className="rounded-xl border border-[var(--f1-line)] bg-black/20 p-10 text-center">
        <p className="text-sm font-semibold text-neutral-300">
          No community matching <span className="text-white">&ldquo;{trimmed}&rdquo;</span>
        </p>
        <div className="mx-auto mt-3 max-w-xs text-left text-xs leading-relaxed text-neutral-500">
          <p>Try:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            <li>Different or shorter keywords</li>
            <li>Browsing by topic instead</li>
            {topics.length > 0 && <li>Removing your topic filters</li>}
            <li>Creating it yourself</li>
          </ul>
        </div>
        {topics.length > 0 && (
          <button type="button" onClick={onClearTopics} className="mt-4 text-xs text-neutral-400 underline-offset-2 transition hover:text-white hover:underline">
            Clear topic filters
          </button>
        )}
      </div>
    );
  }

  if (topics.length > 0) {
    return (
      <div className="rounded-xl border border-[var(--f1-line)] bg-black/20 p-10 text-center">
        <p className="text-sm font-semibold text-neutral-300">No public communities in {topics.length === 1 ? topics[0] : "those topics"} yet.</p>
        <button
          type="button"
          onClick={onClearTopics}
          className="mt-3 rounded-full border border-[var(--f1-line)] px-4 py-1.5 text-xs font-semibold text-neutral-200 transition hover:border-white/30"
        >
          Show all topics
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--f1-line)] bg-black/20 p-10 text-center">
      <p className="text-sm font-semibold text-neutral-300">No public communities yet.</p>
      <p className="mt-1 text-xs text-neutral-500">Be the first - create one and make it public.</p>
    </div>
  );
}
