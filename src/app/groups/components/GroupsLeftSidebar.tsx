"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { groupHref } from "@/lib/routes";
import type { GroupSummary } from "@/lib/supabase/groups";
import { CreateCommunityModal } from "./create/CreateCommunityModal";

/**
 * The navigation rail. Deliberately NOT wrapped in a card of its own - a card around the rail, a
 * card around the feed and a card around the context rail turns the page into three boxes with
 * cards inside them. Navigation sits directly on the page background here; the only real surfaces
 * in this column are the selected row's own tint and the primary action.
 *
 * Selecting a row doesn't navigate away - it switches the center feed to that one community's own
 * stream in place (GroupsFeed owns the actual fetch), the way a mail client's folder list changes
 * what's shown without leaving the page. A chevron appears on hover for the different, real need
 * underneath it - opening that community's own full page (Predictions, Members, Manage) - so
 * selecting-to-filter and opening-the-real-page stay two distinct actions rather than one
 * overloaded click.
 */
export function GroupsLeftSidebar({
  groups,
  selectedId,
  onSelect,
  onDiscover,
}: {
  groups: GroupSummary[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDiscover: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    // Desktop only - a full vertical rail is the wrong idiom on a phone (see
    // MobileCommunitySelector below, which GroupsHomeClient renders instead at <lg). max-h-full,
    // never h-full: the rail ends where its content ends and only caps at the workspace height
    // once there are enough communities to need it.
    <div className="hidden max-h-full flex-col lg:flex">
      <div className="shrink-0 px-1">
        <h1 className="text-[15px] font-bold leading-tight tracking-[-0.01em] text-white">Communities</h1>
        <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">Race-weekend discussion and predictions.</p>
      </div>

      {/* The scope control, above the list and separated from it: "All communities" is not an
          eighth community, it's the filter that decides whether the centre column shows the
          combined feed or one community's own. Hence a collection icon in a squared tile rather
          than a circular avatar, and a divider under it rather than membership in the list. */}
      <div className="mt-3 shrink-0">
        <NavRow
          label="All communities"
          active={selectedId === null}
          onClick={() => onSelect(null)}
          icon={
            <span
              aria-hidden
              className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md transition ${
                selectedId === null ? "bg-[var(--f1-red)]/15 text-[var(--f1-red)]" : "bg-white/[0.06] text-neutral-400"
              }`}
            >
              <CollectionIcon />
            </span>
          }
        />
      </div>

      <div className="mt-2.5 flex shrink-0 items-center justify-between border-t border-white/[0.06] px-1 pt-2.5">
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Your communities</p>
        {groups.length > 0 && <span className="text-[10.5px] tabular-nums text-neutral-600">{groups.length}</span>}
      </div>

      {groups.length === 0 ? (
        <div className="mt-2 px-1">
          <p className="text-[11.5px] font-medium text-neutral-400">No communities yet</p>
          <button type="button" onClick={onDiscover} className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--f1-red)] transition hover:brightness-125">
            Discover communities
            <ChevronIcon />
          </button>
        </div>
      ) : (
        // min-h-0 + flex-1: the list is what gives way when the rail runs out of room, so the two
        // actions below stay pinned and reachable instead of being pushed out of view.
        <div className="mt-1 min-h-0 flex-1 space-y-px overflow-y-auto scrollbar-hide">
          {groups.map((g, i) => (
            <motion.div key={g.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18, delay: Math.min(i, 8) * 0.025 }}>
              <NavRow
                label={g.name}
                active={selectedId === g.id}
                onClick={() => onSelect(g.id)}
                icon={<EntityAvatar imageUrl={g.avatarUrl} name={g.name} seed={g.id} size={26} />}
                badge={
                  g.activePredictions > 0 ? (
                    <span
                      title={`${g.activePredictions} open prediction${g.activePredictions === 1 ? "" : "s"}`}
                      className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[var(--f1-red)] px-1 text-[9.5px] font-bold tabular-nums text-white"
                    >
                      {g.activePredictions}
                    </span>
                  ) : undefined
                }
                openHref={groupHref(g.id)}
                openLabel={`Open ${g.name}`}
              />
            </motion.div>
          ))}
        </div>
      )}

      <div className="mt-2.5 shrink-0 border-t border-white/[0.06] pt-2.5">
        <button
          onClick={() => setShowCreate(true)}
          className="flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[var(--f1-red)] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
        >
          <PlusIcon />
          New community
        </button>
        <button
          type="button"
          onClick={onDiscover}
          className="mt-1 flex w-full items-center justify-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-[11.5px] font-medium text-neutral-400 transition hover:bg-white/[0.05] hover:text-white"
        >
          Discover communities
          <ChevronIcon />
        </button>
      </div>

      {showCreate && <CreateCommunityModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

/**
 * One navigation row - roughly 40px tall, which is navigation scale, not card scale.
 *
 * Idle rows carry no surface and no border at all: seven bordered rectangles stacked in a column
 * read as seven dashboard cards competing with the feed, which is exactly what this column must
 * not do. Separation comes from the rows' own rhythm and their avatars. Hover gets a quiet wash;
 * the selected row gets a tint plus a thin red accent edge - the red is an active INDICATOR, not
 * the row's decoration.
 */
function NavRow({
  label,
  active,
  onClick,
  icon,
  badge,
  openHref,
  openLabel,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  badge?: ReactNode;
  openHref?: string;
  openLabel?: string;
}) {
  return (
    <div
      className={`group relative flex items-center gap-2 overflow-hidden rounded-lg px-1.5 py-1.5 transition ${
        active ? "bg-[var(--f1-red)]/[0.1]" : "hover:bg-white/[0.045]"
      }`}
    >
      {active && <span aria-hidden className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-[var(--f1-red)]" />}
      <button
        type="button"
        onClick={onClick}
        aria-current={active}
        className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
      >
        {icon}
        <span className={`min-w-0 flex-1 truncate text-[12.5px] leading-tight ${active ? "font-semibold text-white" : "font-medium text-neutral-300 group-hover:text-white"}`}>{label}</span>
      </button>
      {badge}
      {openHref && (
        <Link
          href={openHref}
          aria-label={openLabel}
          title="Open community"
          className="shrink-0 rounded p-0.5 text-neutral-600 opacity-0 transition hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
        >
          <ChevronIcon />
        </Link>
      )}
    </div>
  );
}

/** A plain chevron, not "->" - every directional affordance in this section uses this instead of
 * an ASCII arrow. */
function ChevronIcon() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden>
      <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" aria-hidden>
      <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** A collection of tiles - "everything you follow, together". Deliberately not a globe or a
 * community-shaped avatar: this row is a scope, and its icon should read as one. */
function CollectionIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/**
 * The mobile equivalent of the rail above - not the same vertical list shrunk down, a real mobile
 * composition: a horizontally-scrollable chip strip, the idiom a phone screen actually favours for
 * "pick one of a short row of things". Sits above the composer, not below the entire feed.
 */
export function MobileCommunitySelector({ groups, selectedId, onSelect }: { groups: GroupSummary[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  if (groups.length === 0) return null;
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-hide lg:hidden">
      <Chip label="All" active={selectedId === null} onClick={() => onSelect(null)} />
      {groups.map((g) => (
        <Chip key={g.id} label={g.name} seed={g.id} avatarUrl={g.avatarUrl} active={selectedId === g.id} onClick={() => onSelect(g.id)} />
      ))}
    </div>
  );
}

function Chip({ label, seed, avatarUrl, active, onClick }: { label: string; seed?: string; avatarUrl?: string | null; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active}
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-medium transition ${
        active ? "bg-[var(--f1-red)]/[0.16] text-white ring-1 ring-[var(--f1-red)]/30" : "bg-white/[0.04] text-neutral-400 hover:text-neutral-200"
      }`}
    >
      {avatarUrl !== undefined && <EntityAvatar imageUrl={avatarUrl} name={label} seed={seed} size={16} />}
      <span className="max-w-[7rem] truncate">{label}</span>
    </button>
  );
}
