"use client";

import { Button } from "@/components/ui/Button";
import { useCallback, useEffect, useRef, useState } from "react";
import { fieldControlClass } from "@/components/ui/Field";
import { Picker } from "@/components/ui/Picker";
import { Dialog } from "@/components/ui/Dialog";
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
 * Discover, in the house Dialog (focus trap, Escape, focus return), focused on its search field.
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
  const searchRef = useRef<HTMLInputElement>(null);
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
  // Bumped by Retry: the same query again (setting the query to itself wouldn't re-run anything).
  const [attempt, setAttempt] = useState(0);
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
  }, [buildUrl, attempt]);

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

  const activeFilters = topics.length > 0 || query.trim().length > 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Discover communities"
      description="Find people and spaces around what interests you."
      size="xl"
      initialFocusRef={searchRef}
    >
      <div className="relative">
        <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary" fill="none" aria-hidden>
          <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="m13.5 13.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search communities..."
          aria-label="Search communities"
          ref={searchRef}
          className={`${fieldControlClass(false)} pl-10 pr-10`}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-tertiary transition hover:text-white"
          >
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Scrolls horizontally on a narrow screen instead of wrapping into a tall stack. */}
      <div className="mt-3 flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5">
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
            className="shrink-0 text-xs text-tertiary transition hover:text-white"
          >
            Clear all
          </button>
        )}
        {communities !== null && (
          <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-tertiary tabular">
            {total} {total === 1 ? "community" : "communities"}
          </span>
        )}
      </div>

      <div className="mt-5">
        {communities === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <GroupCardSkeleton key={i} />
            ))}
          </div>
        ) : listError ? (
          <ErrorState onRetry={() => setAttempt((n) => n + 1)} />
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
                  <p className="py-3 text-center text-xs text-tertiary">
                    Couldn&apos;t load more.{" "}
                    <button type="button" onClick={() => void loadMore()} className="text-secondary underline-offset-2 hover:text-white hover:underline">
                      Retry
                    </button>
                  </p>
                )}
              </div>
            )}

            {!cursor && communities.length > 6 && <p className="pt-6 text-center text-xs text-tertiary">That&apos;s every community matching this.</p>}
          </>
        )}

        <div className="mt-8 border-t border-subtle pt-5">
          <p className="mb-2 text-xs text-tertiary">Have an invite link to a private community?</p>
          <JoinGroupForm compact />
        </div>
      </div>
    </Dialog>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-10 text-center">
      <p className="text-sm font-semibold text-secondary">Something went wrong loading communities.</p>
      <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function EmptyState({ query, topics, onClearTopics }: { query: string; topics: string[]; onClearTopics: () => void }) {
  const trimmed = query.trim();

  // Three genuinely different dead ends, each with the action that actually gets you out of it -
  // never one generic "no results".
  if (trimmed) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-10 text-center">
        <p className="text-sm font-semibold text-secondary">
          No community matching <span className="text-white">&ldquo;{trimmed}&rdquo;</span>
        </p>
        <div className="mx-auto mt-3 max-w-xs text-left text-xs leading-relaxed text-tertiary">
          <p>Try:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            <li>Different or shorter keywords</li>
            <li>Browsing by topic instead</li>
            {topics.length > 0 && <li>Removing your topic filters</li>}
            <li>Creating it yourself</li>
          </ul>
        </div>
        {topics.length > 0 && (
          <button type="button" onClick={onClearTopics} className="mt-4 text-xs text-secondary underline-offset-2 transition hover:text-white hover:underline">
            Clear topic filters
          </button>
        )}
      </div>
    );
  }

  if (topics.length > 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-10 text-center">
        <p className="text-sm font-semibold text-secondary">No public communities in {topics.length === 1 ? topics[0] : "those topics"} yet.</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={onClearTopics}>
          Show all topics
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-10 text-center">
      <p className="text-sm font-semibold text-secondary">No public communities yet.</p>
      <p className="mt-1 text-xs text-tertiary">Be the first - create one and make it public.</p>
    </div>
  );
}
