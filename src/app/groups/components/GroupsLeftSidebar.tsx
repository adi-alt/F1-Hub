"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { groupHref } from "@/lib/routes";
import type { GroupSummary } from "@/lib/supabase/groups";
import { CreateCommunityModal } from "./create/CreateCommunityModal";

/**
 * The navigation rail: one frosted surface holding the page's own identity (title + description -
 * there is no separate page header above the workspace, see page.tsx), the community list, and the
 * two community-level actions.
 *
 * Selecting a row doesn't navigate away - it switches the center feed to that one community's own
 * stream in place (GroupsFeed owns the actual fetch), the way a mail client's folder list changes
 * what's shown without leaving the page. "All" is the default and returns to the cross-community
 * feed. A small arrow appears on hover for the different, real need underneath it - opening that
 * community's own full page (Predictions, Members, Manage) - so selecting-to-filter and
 * opening-the-real-page stay two distinct actions rather than one overloaded click.
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
    // MobileCommunitySelector below, which GroupsHomeClient renders instead at <lg).
    // max-h-full, never h-full: the card ends where its content ends (see GroupsHomeClient, which
    // gives this a definite-height flex parent so that percentage actually resolves) and only caps
    // at the workspace height once there are enough communities to need it, at which point the
    // list inside it starts scrolling instead.
    <div className="hidden max-h-full flex-col rounded-xl border border-white/[0.07] bg-[var(--f1-carbon)]/60 p-3 backdrop-blur-sm lg:flex">
      <div className="shrink-0 px-1">
        <h1 className="text-[17px] font-bold leading-tight tracking-[-0.01em] text-white">Communities</h1>
        <p className="mt-0.5 text-[11.5px] leading-snug text-neutral-500">Race-weekend discussion and predictions across your communities.</p>
      </div>

      <div className="mt-3.5 flex shrink-0 items-center justify-between px-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Your communities</p>
        {groups.length > 0 && <span className="text-[11px] tabular-nums text-neutral-600">{groups.length}</span>}
      </div>

      {groups.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-white/[0.09] px-3 py-5 text-center">
          <p className="text-xs text-neutral-500">No communities yet.</p>
          <button type="button" onClick={onDiscover} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--f1-red)] transition hover:brightness-125">
            Discover communities
            <ChevronIcon />
          </button>
        </div>
      ) : (
        // min-h-0 + flex-1: the list is what gives way when the rail runs out of room, so the two
        // actions below stay pinned and reachable instead of being pushed out of the card.
        //
        // divide-y at very low contrast: each community is a distinct destination and the hairline
        // between them is what makes the list scan as rows rather than a run-on column. Kept to
        // white/[0.05] so it separates without drawing the borders-everywhere look.
        <div data-tour="community-list" className="mt-1.5 min-h-0 flex-1 divide-y divide-white/[0.05] overflow-y-auto scrollbar-hide">
          {/* The scope control. Same row grammar as a community - same inset, same 36px icon
              slot, same selected treatment - so the list reads as one navigation system, with a
              squared tile instead of a circular avatar to say it is a filter and not a community.
              Never carries an unread badge: "All" has no membership to have unread activity in. */}
          <div data-tour="community-filter" className="mb-1 border-b border-white/[0.08] pb-1">
            <NavRow
              label="All"
              sublabel="Everything you\u2019re in"
              active={selectedId === null}
              onClick={() => onSelect(null)}
              icon={
                <span
                  className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg transition ${
                    selectedId === null ? "bg-[var(--f1-red)]/[0.14] text-[var(--f1-red)]" : "bg-white/[0.05] text-neutral-400"
                  }`}
                >
                  <AllIcon />
                </span>
              }
            />
          </div>
          {groups.map((g, i) => {
            const active = selectedId === g.id;
            return (
              <motion.div key={g.id} className="mt-px" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: Math.min(i, 8) * 0.03 }}>
                <NavRow
                  label={g.name}
                  active={active}
                  onClick={() => onSelect(g.id)}
                  icon={<EntityAvatar imageUrl={g.avatarUrl} name={g.name} seed={g.id} size={34} />}
                  badge={
                    g.activePredictions > 0 ? (
                      <span
                        title={`${g.activePredictions} open prediction${g.activePredictions === 1 ? "" : "s"}`}
                        className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--f1-red)] px-1.5 text-[10px] font-bold tabular-nums text-white"
                      >
                        {g.activePredictions}
                      </span>
                    ) : undefined
                  }
                  openHref={groupHref(g.id)}
                  openLabel={`Open ${g.name}`}
                />
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="mt-3 shrink-0 space-y-1.5 border-t border-white/[0.07] pt-3">
        <button
          onClick={() => setShowCreate(true)}
          className="flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[var(--f1-red)] px-3 py-2 text-[12.5px] font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
        >
          <PlusIcon />
          New community
        </button>
        <button
          type="button"
          onClick={onDiscover}
          className="flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-white/[0.09] bg-white/[0.02] px-3 py-2 text-[12.5px] font-medium text-neutral-200 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
        >
          <CompassIcon />
          Discover communities
        </button>
      </div>

      {showCreate && <CreateCommunityModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

/**
 * One navigation row - the single row grammar this rail has, used by both the All filter and every
 * community, which is what makes the list read as one system rather than a widget above a list.
 *
 * The selected state is ONE accent, not three. It previously stacked a red border, a red gradient
 * wash AND a red edge bar on top of a red-filled icon tile, which made the selected row read as an
 * important card rather than as the current filter - the accents compounded instead of combining.
 * Now: a faint red wash that fades out to the right, anchored by a thin edge bar at its left so
 * the tint looks attached to something rather than floating, and brighter label text. No border,
 * no glow.
 *
 * Idle rows carry no surface at all, so nothing competes with the feed.
 */
function NavRow({
  label,
  sublabel,
  active,
  onClick,
  icon,
  badge,
  openHref,
  openLabel,
}: {
  label: string;
  sublabel?: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  badge?: ReactNode;
  openHref?: string;
  openLabel?: string;
}) {
  return (
    <div
      className={`group relative flex items-center gap-2.5 overflow-hidden rounded-lg px-3 py-1.5 transition ${
        active ? "bg-gradient-to-r from-[var(--f1-red)]/[0.11] via-[var(--f1-red)]/[0.04] to-transparent" : "hover:bg-white/[0.045]"
      }`}
    >
      {active && <span aria-hidden className="absolute inset-y-1 left-0 w-[2px] rounded-r-full bg-[var(--f1-red)]/80" />}
      <button type="button" onClick={onClick} aria-current={active} className="flex min-w-0 flex-1 items-center gap-2.5 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]">
        {icon}
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[14px] leading-tight ${active ? "font-semibold text-white" : "font-medium text-neutral-300 group-hover:text-white"}`}>{label}</span>
          {sublabel && <span className="mt-0.5 block truncate text-[11.5px] leading-tight text-neutral-500">{sublabel}</span>}
        </span>
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
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden>
      <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="m13 7-1.8 4.4a1 1 0 0 1-.6.6L6.5 13.5l1.8-4.4a1 1 0 0 1 .6-.6L13 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** A real globe - "All" means every followed community's feed aggregated together, and a globe is
 * the honest icon for "everything". */
function AllIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden>
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
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active ? "bg-[var(--f1-red)]/[0.16] text-white ring-1 ring-[var(--f1-red)]/30" : "bg-white/[0.04] text-neutral-400 hover:text-neutral-200"
      }`}
    >
      {avatarUrl !== undefined && <EntityAvatar imageUrl={avatarUrl} name={label} seed={seed} size={16} />}
      <span className="max-w-[7rem] truncate">{label}</span>
    </button>
  );
}
