"use client";

import { useEffect, useRef, useState } from "react";
import { Popover } from "@/components/ui/Popover";
import { POST_KIND_LABELS, type PostKind } from "@/lib/communities";
import type { PostSort } from "@/lib/supabase/groupPosts";

/**
 * Everything that narrows or reorders a community's feed, in one row.
 *
 * `kind` is null for "everything", or one real `group_posts.kind`. The chips are derived from the
 * kinds this community actually offers - a Photography community has no Race Weekend chip because
 * it can't hold a race_discussion post, and Announcements only appears where someone can write one.
 * Nothing here is a client-side filter over an already-loaded page: every change refetches through
 * `/api/groups/{id}/posts`, so it searches and sorts the community's whole history, not the
 * fifteen posts that happened to be on screen.
 */
export type FeedQuery = {
  sort: PostSort;
  kind: PostKind | null;
  query: string;
  mediaOnly: boolean;
  mineOnly: boolean;
  pendingOnly: boolean;
};

export const DEFAULT_FEED_QUERY: FeedQuery = { sort: "new", kind: null, query: "", mediaOnly: false, mineOnly: false, pendingOnly: false };

/** True when anything beyond the default ordering is applied - drives the "filtered" dot on the
 * filter button and the "clear" affordance on the empty state. */
export function isFiltered(q: FeedQuery): boolean {
  return q.kind !== null || q.query.trim() !== "" || q.mediaOnly || q.mineOnly || q.pendingOnly || q.sort !== "new";
}

const SORT_LABELS: Record<PostSort, string> = {
  new: "Newest first",
  old: "Oldest first",
  top: "Most upvoted",
  discussed: "Most discussed",
};

export function FeedControls({
  kinds,
  value,
  onChange,
  canModerate,
  moderationEnabled,
  pendingCount,
}: {
  /** The post kinds this community really offers, from postKindsFor. */
  kinds: PostKind[];
  value: FeedQuery;
  onChange: (next: FeedQuery) => void;
  canModerate: boolean;
  moderationEnabled: boolean;
  /** Posts currently awaiting approval, for the moderator-only filter's badge. Undefined when the
   * viewer can't moderate, in which case that filter isn't offered at all. */
  pendingCount?: number;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [draft, setDraft] = useState(value.query);
  const [lastAppliedQuery, setLastAppliedQuery] = useState(value.query);
  const searchRef = useRef<HTMLInputElement>(null);

  // The search term can also be cleared from OUTSIDE this row - "Reset to latest" below, and the
  // empty state's "Clear filters" button. Without this the input would keep showing a term that is
  // no longer being searched for. Adjusting state during render (React's own sanctioned pattern for
  // "a prop changed and some local state derived from it must follow") rather than in an effect,
  // which would render the stale text once before correcting itself.
  if (value.query !== lastAppliedQuery) {
    setLastAppliedQuery(value.query);
    if (value.query !== draft) setDraft(value.query);
  }

  // Debounced so typing doesn't fire a request per keystroke, and so a half-typed word never
  // produces a "no results" flash that resolves itself two characters later.
  useEffect(() => {
    if (draft === value.query) return;
    const id = setTimeout(() => onChange({ ...value, query: draft }), 300);
    return () => clearTimeout(id);
    // `value`/`onChange` are stable enough here (the parent recreates onChange each render but it
    // closes over nothing that changes between keystrokes); keying on the draft is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  function set(patch: Partial<FeedQuery>) {
    onChange({ ...value, ...patch });
  }

  // "Latest" and "Top" are orderings; the rest are kind filters. They share a row because to a
  // reader they're all "which posts am I looking at", but they're two independent axes underneath -
  // picking Announcements doesn't throw away a Top ordering.
  const kindChips = kinds.filter((k) => k !== "discussion");

  return (
    <div className="flex items-center gap-2">
      <div className="-mx-1 min-w-0 flex-1 overflow-x-auto px-1 scrollbar-hide">
        <div className="flex min-w-max items-center gap-1.5">
          <Chip active={value.sort === "new" && value.kind === null} onClick={() => set({ sort: "new", kind: null })}>
            Latest
          </Chip>
          <Chip active={value.sort === "top"} onClick={() => set({ sort: value.sort === "top" ? "new" : "top" })}>
            Top
          </Chip>
          {kindChips.map((k) => (
            <Chip key={k} active={value.kind === k} onClick={() => set({ kind: value.kind === k ? null : k })}>
              {/* Plural, because a chip names a group of posts rather than one post's type. */}
              {CHIP_LABELS[k] ?? POST_KIND_LABELS[k]}
            </Chip>
          ))}
        </div>
      </div>

      {searchOpen && (
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full border border-white/[0.12] bg-black/30 px-3 py-1.5 sm:max-w-xs">
          <span aria-hidden className="shrink-0 text-neutral-500">
            <SearchIcon />
          </span>
          <input
            ref={searchRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              setDraft("");
              set({ query: "" });
              setSearchOpen(false);
            }}
            placeholder="Search this community"
            aria-label="Search this community's posts"
            className="min-w-0 flex-1 bg-transparent text-xs text-white placeholder:text-neutral-600 focus:outline-none"
          />
          <button
            type="button"
            aria-label="Close search"
            onClick={() => {
              setDraft("");
              set({ query: "" });
              setSearchOpen(false);
            }}
            className="shrink-0 text-neutral-500 transition hover:text-white"
          >
            <CloseIcon />
          </button>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-1">
        {!searchOpen && <IconButton label="Search posts" onClick={() => setSearchOpen(true)} icon={<SearchIcon />} />}

        <Popover
          align="end"
          ariaLabel="Sort and filter"
          panelClassName="w-56"
          trigger={({ open, toggle, ref }) => (
            <button
              ref={ref}
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-label="Sort and filter"
              className={`relative flex h-8 w-8 items-center justify-center rounded-full border transition ${
                open ? "border-white/25 bg-white/[0.08] text-white" : "border-[var(--f1-line)] text-neutral-400 hover:border-white/25 hover:text-white"
              }`}
            >
              <SlidersIcon />
              {isFiltered(value) && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--f1-red)]" />}
            </button>
          )}
        >
          {() => (
            <div className="p-1">
              <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">Sort</p>
              {(Object.keys(SORT_LABELS) as PostSort[]).map((s) => (
                <MenuOption key={s} selected={value.sort === s} onClick={() => set({ sort: s })}>
                  {SORT_LABELS[s]}
                </MenuOption>
              ))}
              {/* Stated, not hidden: the two ranked sorts genuinely rank a bounded recent window
                  (see listPosts), and implying they ranked every post ever would be a lie. */}
              {(value.sort === "top" || value.sort === "discussed") && (
                <p className="px-2.5 pb-1 pt-1 text-[10.5px] leading-snug text-neutral-600">Ranked across this community&apos;s recent posts.</p>
              )}

              <div className="my-1 border-t border-white/10" />
              <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">Filter</p>
              <MenuToggle checked={value.mediaOnly} onClick={() => set({ mediaOnly: !value.mediaOnly })}>
                With photo or video
              </MenuToggle>
              <MenuToggle checked={value.mineOnly} onClick={() => set({ mineOnly: !value.mineOnly })}>
                Only my posts
              </MenuToggle>
              {/* Only a moderator sees this, because only a moderator has a queue: for anyone else
                  "pending" can only ever mean their own unapproved posts, which isn't a queue. */}
              {canModerate && moderationEnabled && (
                <MenuToggle checked={value.pendingOnly} onClick={() => set({ pendingOnly: !value.pendingOnly })}>
                  <span className="flex items-center gap-1.5">
                    Awaiting approval
                    {pendingCount !== undefined && pendingCount > 0 && (
                      <span className="rounded-full bg-amber-400/15 px-1.5 text-[10px] font-semibold text-amber-400">{pendingCount}</span>
                    )}
                  </span>
                </MenuToggle>
              )}

              {isFiltered(value) && (
                <>
                  <div className="my-1 border-t border-white/10" />
                  <button
                    type="button"
                    onClick={() => onChange({ ...DEFAULT_FEED_QUERY })}
                    className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-neutral-300 transition hover:bg-white/[0.06] hover:text-white"
                  >
                    Reset to latest
                  </button>
                </>
              )}
            </div>
          )}
        </Popover>
      </div>
    </div>
  );
}

/** Plural forms for the chips. Only where the singular kind label reads oddly as a filter - "Race
 * Discussion" names one post, "Race Weekend" names the set of them. */
const CHIP_LABELS: Partial<Record<PostKind, string>> = {
  announcement: "Announcements",
  question: "Questions",
  race_discussion: "Race Weekend",
  prediction: "Predictions",
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active ? "bg-[var(--f1-red)] text-white" : "border border-[var(--f1-line)] text-neutral-400 hover:border-white/25 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function IconButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--f1-line)] text-neutral-400 transition hover:border-white/25 hover:text-white"
    >
      {icon}
    </button>
  );
}

function MenuOption({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-checked={selected}
      role="menuitemradio"
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition hover:bg-white/[0.06] ${
        selected ? "text-white" : "text-neutral-400"
      }`}
    >
      {children}
      {selected && (
        <span aria-hidden className="shrink-0 text-[var(--f1-red)]">
          <CheckIcon />
        </span>
      )}
    </button>
  );
}

function MenuToggle({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-checked={checked}
      role="menuitemcheckbox"
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition hover:bg-white/[0.06] ${
        checked ? "text-white" : "text-neutral-400"
      }`}
    >
      {children}
      <span
        aria-hidden
        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border ${checked ? "border-[var(--f1-red)] bg-[var(--f1-red)] text-white" : "border-white/20"}`}
      >
        {checked && <CheckIcon />}
      </span>
    </button>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10.4 10.4 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
      <path d="M2.4 4.6h11.2M2.4 8h7.4M2.4 11.4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 14 14" width="11" height="11" fill="none" aria-hidden>
      <path d="m3.5 3.5 7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 14 14" width="9" height="9" fill="none" aria-hidden>
      <path d="m2.8 7.4 2.6 2.6 5.8-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
