"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { groupHref } from "@/lib/routes";
import type { GroupSummary } from "@/lib/supabase/groups";
import { CreateGroupModal } from "./CreateGroupModal";

/** Compact rows, not cards - groups are navigation here, not content (see GroupsHomeClient's own
 * comment on the overall shift). No "unread" dot: there's no read-tracking table in the schema,
 * and a fabricated one would be exactly the fake indicator the request itself warned against
 * elsewhere. The real per-group signal available is activePredictions - shown as a small badge
 * only when it's actually nonzero. */
export function GroupsLeftSidebar({ groups, onDiscover }: { groups: GroupSummary[]; onDiscover: () => void }) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">My Groups</p>
        <motion.div initial="hidden" animate="show" className="mt-2 space-y-0.5">
          {groups.map((g, i) => (
            <motion.div key={g.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: Math.min(i, 8) * 0.03 }}>
              <Link href={groupHref(g.id)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-neutral-300 transition hover:bg-white/[0.04] hover:text-white">
                <EntityAvatar imageUrl={g.avatarUrl} name={g.name} size={22} />
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                {g.activePredictions > 0 && (
                  <span className="shrink-0 rounded-full bg-[var(--f1-red)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--f1-red)]">{g.activePredictions}</span>
                )}
              </Link>
            </motion.div>
          ))}
          {groups.length === 0 && <p className="px-2 text-xs text-neutral-600">You haven&apos;t joined any groups yet.</p>}
        </motion.div>
      </div>

      <div className="space-y-1.5 border-t border-[var(--f1-line)] pt-3">
        <button
          onClick={() => setShowCreate(true)}
          className="w-full rounded-full bg-[var(--f1-red)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110"
        >
          + Create Group
        </button>
        <button onClick={onDiscover} className="w-full rounded-full border border-[var(--f1-line)] px-3 py-2 text-xs font-semibold text-neutral-300 transition hover:border-white/30 hover:text-white">
          Discover Communities
        </button>
      </div>

      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
