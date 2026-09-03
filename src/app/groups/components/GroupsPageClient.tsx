"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QuietTabs } from "@/app/season/_components/QuietTabs";
import { CreateGroupModal } from "./CreateGroupModal";
import { DiscoverGroupsTab } from "./DiscoverGroupsTab";
import { GroupCard } from "./GroupCard";
import { GroupSort, sortGroups, type SortKey } from "./GroupSort";
import type { GroupSummary } from "@/lib/supabase/groups";

function EmptyMyGroups({ onDiscover, onCreate }: { onDiscover: () => void; onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-10 text-center">
      <svg viewBox="0 0 24 24" fill="none" className="mx-auto h-10 w-10 text-neutral-600" aria-hidden>
        <path
          d="M17 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM21 20v-1a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">No groups yet</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">Join an existing F1 community or create your own prediction league.</p>
      <div className="mt-5 flex items-center justify-center gap-3">
        <button onClick={onDiscover} className="rounded-full border border-[var(--f1-line)] px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:border-white/30">
          Discover Groups
        </button>
        <button onClick={onCreate} className="rounded-full bg-[var(--f1-red)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110">
          + Create Group
        </button>
      </div>
    </div>
  );
}

function NoSearchResults() {
  return (
    <p className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-6 text-center text-sm text-neutral-500">
      No groups found. Try another search term.
    </p>
  );
}

// Points moved to the global header (see Header.tsx's PointsBadge) - it's visible everywhere now,
// repeating it here would just be the same number twice on this one page.
export function GroupsPageClient({ groups }: { groups: GroupSummary[] }) {
  const [tab, setTab] = useState<"mine" | "discover">("mine");
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("active");

  const activePredictionsTotal = groups.reduce((sum, g) => sum + g.activePredictions, 0);
  const weeklyPostsTotal = groups.reduce((sum, g) => sum + g.weeklyPosts, 0);
  const trimmedQuery = query.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    const base = trimmedQuery ? groups.filter((g) => g.name.toLowerCase().includes(trimmedQuery) || g.description?.toLowerCase().includes(trimmedQuery)) : groups;
    return sortGroups(base, sort);
  }, [groups, trimmedQuery, sort]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <QuietTabs
          options={[
            { value: "mine" as const, label: `My Groups (${groups.length})` },
            { value: "discover" as const, label: "Discover Groups" },
          ]}
          value={tab}
          onChange={setTab}
        />
        <button onClick={() => setShowCreate(true)} className="rounded-full bg-[var(--f1-red)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110">
          + Create Group
        </button>
      </div>

      <AnimatePresence mode="wait">
        {tab === "mine" ? (
          <motion.div key="mine" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="mt-6">
            {groups.length > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search my groups..."
                    className="w-full max-w-sm rounded-lg border border-[var(--f1-line)] bg-black/30 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
                  />
                  <GroupSort value={sort} onChange={setSort} />
                </div>
                <div className="mb-4 mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">My Groups</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {groups.length} communit{groups.length === 1 ? "y" : "ies"} · {activePredictionsTotal} active prediction{activePredictionsTotal === 1 ? "" : "s"} · {weeklyPostsTotal} post
                    {weeklyPostsTotal === 1 ? "" : "s"} this week
                  </p>
                </div>
              </>
            )}

            {groups.length === 0 ? (
              <EmptyMyGroups onDiscover={() => setTab("discover")} onCreate={() => setShowCreate(true)} />
            ) : filteredGroups.length === 0 ? (
              <NoSearchResults />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredGroups.map((g, i) => (
                  <GroupCard key={g.id} group={g} index={i} />
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="discover" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="mt-6">
            <DiscoverGroupsTab />
          </motion.div>
        )}
      </AnimatePresence>

      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
