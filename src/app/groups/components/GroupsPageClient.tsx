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

export function GroupsPageClient({ groups, pointsBalance }: { groups: GroupSummary[]; pointsBalance: number }) {
  const [tab, setTab] = useState<"mine" | "discover">("mine");
  const [showCreate, setShowCreate] = useState(false);

  const activePredictionsTotal = groups.reduce((sum, g) => sum + g.activePredictions, 0);
  const bestGroup = [...groups].filter((g) => g.myRank).sort((a, b) => (a.myRank ?? Infinity) - (b.myRank ?? Infinity))[0];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <QuietTabs
          options={[
            { value: "mine" as const, label: "My Groups" },
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
              <div className="mb-5 flex flex-wrap items-center gap-x-8 gap-y-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">My groups</p>
                  <p className="mt-0.5 text-sm text-neutral-300">
                    {groups.length} group{groups.length === 1 ? "" : "s"} · {activePredictionsTotal} active prediction{activePredictionsTotal === 1 ? "" : "s"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Your points</p>
                  <p className="mt-0.5 text-sm text-neutral-300">
                    <span className="font-mono text-white">{pointsBalance}</span> pts
                    {bestGroup && <span className="text-neutral-500"> · Ranked #{bestGroup.myRank} in {bestGroup.name}</span>}
                  </p>
                </div>
              </div>
            )}

            {groups.length === 0 ? (
              <EmptyMyGroups onDiscover={() => setTab("discover")} onCreate={() => setShowCreate(true)} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {groups.map((g, i) => (
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
