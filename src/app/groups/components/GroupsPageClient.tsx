"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QuietTabs } from "@/app/season/_components/QuietTabs";
import { CreateGroupModal } from "./CreateGroupModal";
import { DiscoverGroupsTab } from "./DiscoverGroupsTab";
import { GroupCard } from "./GroupCard";
import type { GroupSummary } from "@/lib/supabase/groups";

function EmptyMyGroups({ onDiscover, onCreate }: { onDiscover: () => void; onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-8 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">You&apos;re not in any groups yet</p>
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

  const activePredictionsTotal = groups.reduce((sum, g) => sum + g.activePredictions, 0);
  const trimmedQuery = query.trim().toLowerCase();
  const filteredGroups = trimmedQuery
    ? groups.filter((g) => g.name.toLowerCase().includes(trimmedQuery) || g.description?.toLowerCase().includes(trimmedQuery))
    : groups;

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
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-full bg-[var(--f1-red)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
        >
          + Create Group
        </button>
      </div>

      <AnimatePresence mode="wait">
        {tab === "mine" ? (
          <motion.div key="mine" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="mt-6">
            {groups.length > 0 && (
              <>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search my groups..."
                  className="w-full max-w-sm rounded-lg border border-[var(--f1-line)] bg-black/30 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
                />
                <div className="mb-4 mt-5 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">My groups</p>
                  <p className="text-xs text-neutral-500">
                    {groups.length} group{groups.length === 1 ? "" : "s"} · {activePredictionsTotal} active prediction{activePredictionsTotal === 1 ? "" : "s"}
                  </p>
                </div>
              </>
            )}

            {groups.length === 0 ? (
              <EmptyMyGroups onDiscover={() => setTab("discover")} onCreate={() => setShowCreate(true)} />
            ) : filteredGroups.length === 0 ? (
              <NoSearchResults />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
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
