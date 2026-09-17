"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { groupHref } from "@/lib/routes";
import type { GroupSummary } from "@/lib/supabase/groups";
import { CreateCommunityModal } from "./create/CreateCommunityModal";

/** Compact rows, not cards - groups are navigation here, not content (see GroupsHomeClient's own
 * comment on the overall shift). No "unread" dot: there's no read-tracking table in the schema,
 * and a fabricated one would be exactly the fake indicator the request itself warned against
 * elsewhere. The real per-group signal available is activePredictions - shown as a small badge
 * only when it's actually nonzero.
 *
 * There is no in-page "selected community" concept here - clicking a row navigates straight to
 * that community's own page (this is a bookmarks rail, not a tab switcher with content inline), so
 * this only needs a real hover/focus state, not a persistent selected one.
 *
 * The two actions below are deliberately unequal in weight: Create is the rarer, one-off action
 * and stays a real (if compact, not full-width) button; Discover is the everyday action for
 * finding more to join, and reads as a quiet text link rather than a second identical button -
 * before this, both were full-width blocks of the same size and only differed by color, which is
 * exactly the "two giant equal buttons" the redesign called out. */
export function GroupsLeftSidebar({ groups, onDiscover }: { groups: GroupSummary[]; onDiscover: () => void }) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">My Communities</p>
          {groups.length > 0 && <span className="text-[11px] tabular-nums text-neutral-600">{groups.length}</span>}
        </div>

        {groups.length === 0 ? (
          <div className="mt-2.5 rounded-lg border border-dashed border-[var(--f1-line)] px-3 py-4 text-center">
            <p className="text-xs text-neutral-500">You&apos;re not part of any communities yet.</p>
            <button type="button" onClick={onDiscover} className="mt-2 text-xs font-semibold text-[var(--f1-red)] transition hover:brightness-125">
              Discover communities →
            </button>
          </div>
        ) : (
          <motion.div initial="hidden" animate="show" className="mt-2 max-h-[60vh] space-y-0.5 overflow-y-auto scrollbar-subtle lg:max-h-[calc(100vh-260px)]">
            {groups.map((g, i) => (
              <motion.div key={g.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: Math.min(i, 8) * 0.03 }}>
                <Link
                  href={groupHref(g.id)}
                  // No border at rest at all - a plain background shift on hover reads as
                  // navigation (the same convention a sidebar nav item uses elsewhere), not a
                  // stack of bordered cards that happen to sit next to each other.
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-neutral-300 transition hover:bg-white/[0.05] hover:text-white"
                >
                  <EntityAvatar imageUrl={g.avatarUrl} name={g.name} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate leading-tight">{g.name}</p>
                    {g.description && <p className="truncate text-[11px] leading-tight text-neutral-500">{g.description}</p>}
                  </div>
                  {g.activePredictions > 0 && (
                    <span className="shrink-0 rounded-full bg-[var(--f1-red)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--f1-red)]">{g.activePredictions}</span>
                  )}
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-[var(--f1-line)] pt-3">
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-full bg-[var(--f1-red)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
        >
          + New community
        </button>
        {groups.length > 0 && (
          <button type="button" onClick={onDiscover} className="text-xs font-medium text-neutral-500 transition hover:text-white">
            Discover →
          </button>
        )}
      </div>

      {showCreate && <CreateCommunityModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
