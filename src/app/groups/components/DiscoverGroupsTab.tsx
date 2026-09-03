"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { groupHref } from "@/lib/routes";
import type { PublicGroupSummary } from "@/lib/supabase/groups";
import { GroupCardShell } from "./GroupCardShell";
import { GroupCardSkeleton } from "./GroupCardSkeleton";
import { GroupSort, sortGroups, type SortKey } from "./GroupSort";
import { JoinGroupForm } from "./JoinGroupForm";

function PublicGroupCard({ group, index, onJoined }: { group: PublicGroupSummary; index: number; onJoined: (id: string) => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "joining" | "error">("idle");

  async function join() {
    setStatus("joining");
    const res = await fetch(`/api/groups/${group.id}/join`, { method: "POST" });
    if (!res.ok) {
      setStatus("error");
      return;
    }
    onJoined(group.id);
    router.push(groupHref(group.id));
  }

  const shell = (
    <GroupCardShell
      index={index}
      id={group.id}
      bannerUrl={group.bannerUrl}
      avatarUrl={group.avatarUrl}
      name={group.name}
      visibility="public"
      description={group.description}
      memberCount={group.memberCount}
      activePredictions={group.activePredictions}
      weeklyPosts={group.weeklyPosts}
      latestPost={group.latestPost}
      footer={
        group.isMember ? (
          <div className="mt-3 flex items-center justify-end gap-1 text-xs font-medium text-neutral-400 transition group-hover:text-white">
            View Group
            <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden>
              <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ) : (
          <>
            <button
              onClick={() => void join()}
              disabled={status === "joining"}
              className="mt-3 w-full rounded-full border border-[var(--f1-line)] px-3 py-1.5 text-xs font-semibold text-neutral-200 transition hover:border-white/30 disabled:opacity-60"
            >
              {status === "joining" ? "Joining…" : "Join Group"}
            </button>
            {status === "error" && <p className="mt-2 text-xs text-[var(--f1-red)]">Could not join - try again.</p>}
          </>
        )
      }
    />
  );

  // Already a member - the whole card previews like a My Groups card, no separate Join affordance
  // to accidentally re-trigger (join.ts is a no-op for an existing member, but showing "Join" for a
  // group you're already in is exactly the confusing state the request called out).
  return group.isMember ? (
    <Link href={groupHref(group.id)} className="group block h-full">
      {shell}
    </Link>
  ) : (
    shell
  );
}

/** Public groups only - listPublicGroups' own doc comment explains why (opt-in visibility, the one
 * deliberate relaxation of "nothing discoverable without an invite" this redesign added). No
 * category filter chips (Competitive/Discussion/Predictions from the original request) - there's
 * no real field on `groups` to categorize by, and a filter that doesn't actually filter anything
 * real would be exactly the "fake interaction" this app's own established pattern avoids; search
 * and sort (both real, over real fields) stay. */
export function DiscoverGroupsTab() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("active");
  const [groups, setGroups] = useState<PublicGroupSummary[] | null>(null);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/api/groups?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((body: { groups: PublicGroupSummary[] }) => setGroups(body.groups))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  const visible = useMemo(() => {
    if (!groups) return null;
    return sortGroups(
      groups.map((g) => (joinedIds.has(g.id) ? { ...g, isMember: true } : g)),
      sort,
    );
  }, [groups, joinedIds, sort]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Discover Groups</p>
          <p className="mt-1 text-sm text-neutral-500">Find public F1 communities and prediction leagues.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search public F1 communities..."
          className="w-full max-w-sm rounded-lg border border-[var(--f1-line)] bg-black/30 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
        />
        <GroupSort value={sort} onChange={setSort} />
      </div>

      <div className="mt-5">
        {visible === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <GroupCardSkeleton key={i} />
            ))}
          </div>
        ) : visible.length === 0 && query.trim() ? (
          <p className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-6 text-center text-sm text-neutral-500">No groups found. Try another search term.</p>
        ) : visible.length === 0 ? (
          <p className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-6 text-center text-sm text-neutral-500">
            No public groups yet - be the first to create one and make it public.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((g, i) => (
              <PublicGroupCard key={g.id} group={g} index={i} onJoined={(id) => setJoinedIds((prev) => new Set(prev).add(id))} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-[var(--f1-line)] pt-5">
        <p className="mb-2 text-xs text-neutral-500">Have an invite link to a private group?</p>
        <JoinGroupForm compact />
      </div>
    </div>
  );
}
