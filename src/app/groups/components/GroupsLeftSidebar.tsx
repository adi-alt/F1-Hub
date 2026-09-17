"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { groupHref } from "@/lib/routes";
import type { GroupSummary } from "@/lib/supabase/groups";
import { CreateCommunityModal } from "./create/CreateCommunityModal";

/**
 * Real navigation, not a list of cards next to a couple of buttons.
 *
 * Selecting a row doesn't navigate away - it switches the center feed to that one community's own
 * stream in place (GroupsFeed owns the actual fetch; see its own comment), the same way clicking a
 * folder changes what a mail client shows without leaving the page. "All" is the default and
 * returns to the cross-community Following/For You/Latest feed. The selected row gets a real,
 * single accent-edge treatment (not a border-per-row) so "this is what's currently feeding the
 * center column" is legible without reading any text. A small arrow appears on hover for the
 * different, real need underneath it - opening that community's own full page (Predictions,
 * Members, Manage, etc.) - so selecting-to-filter and opening-the-real-page stay two distinct,
 * un-confused actions instead of one overloaded click.
 *
 * No per-row description line anymore - that was real information (the community's own
 * description) but it doubled every row's height and weight for metadata nobody scans a nav rail
 * to read; the avatar and name alone are what "this is a place I navigate to" needs to say.
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
    // Desktop only - a full vertical rail like this is the wrong idiom on a phone (see
    // MobileCommunitySelector below, rendered instead at <lg by GroupsHomeClient).
    <div className="hidden space-y-4 lg:block">
      <div>
        <div className="flex items-center justify-between px-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Your communities</p>
          {groups.length > 0 && <span className="text-[11px] tabular-nums text-neutral-600">{groups.length}</span>}
        </div>

        {groups.length === 0 ? (
          <div className="mt-2.5 rounded-lg border border-dashed border-[var(--f1-line)] px-3 py-4 text-center">
            <p className="text-xs text-neutral-500">You&apos;re not following any communities yet.</p>
            <button type="button" onClick={onDiscover} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--f1-red)] transition hover:brightness-125">
              Discover communities
              <ChevronIcon />
            </button>
          </div>
        ) : (
          // No max-h/overflow of its own anymore - GroupsHomeClient's own wrapper is now the one
          // real scroll region this rail lives inside (a second nested overflow-y-auto here would
          // be exactly the "broken nested scroll, double scrollbars" this app's scroll model
          // explicitly avoids).
          <motion.div initial="hidden" animate="show" className="mt-1.5 space-y-px">
            <NavRow label="All" active={selectedId === null} onClick={() => onSelect(null)} icon={<AllIcon />} />
            {groups.map((g, i) => {
              const active = selectedId === g.id;
              return (
                <motion.div key={g.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: Math.min(i, 8) * 0.03 }}>
                  <div className={`group relative flex items-center rounded-md pl-2.5 pr-1 transition ${active ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`}>
                    {/* The one selected-state language for this rail: a left accent edge, not a
                        border around the whole row - reads as "this feeds the column to the right"
                        rather than "this is a card". */}
                    <span aria-hidden className={`absolute -left-2.5 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full transition ${active ? "bg-[var(--f1-red)]" : "bg-transparent"}`} />
                    <button
                      type="button"
                      onClick={() => onSelect(g.id)}
                      aria-current={active}
                      className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-sm"
                    >
                      <EntityAvatar imageUrl={g.avatarUrl} name={g.name} seed={g.id} size={24} />
                      <span className={`min-w-0 flex-1 truncate ${active ? "font-semibold text-white" : "text-neutral-300 group-hover:text-white"}`}>{g.name}</span>
                      {g.activePredictions > 0 && (
                        <span className="shrink-0 rounded-full bg-[var(--f1-red)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--f1-red)]">{g.activePredictions}</span>
                      )}
                    </button>
                    <Link
                      href={groupHref(g.id)}
                      aria-label={`Open ${g.name}`}
                      title="Open community"
                      className="ml-0.5 shrink-0 rounded p-1 text-neutral-600 opacity-0 transition hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <svg viewBox="0 0 16 16" width="11" height="11" fill="none" aria-hidden>
                        <path d="M6 3.5h6.5V10M12.5 3.5 3.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* flex-wrap on the row (not on either button's own text) - if the rail is ever narrower
          than both actions fit on one line, Discover drops to its own line whole rather than
          either button's label wrapping mid-word. shrink-0 + whitespace-nowrap on each button is
          what actually stops that: without them a flex item can be compressed below its content's
          natural width, which is what was wrapping "+ New community" onto two lines. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[var(--f1-line)] px-2.5 pt-3">
        <button
          onClick={() => setShowCreate(true)}
          className="shrink-0 whitespace-nowrap rounded-full bg-[var(--f1-red)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
        >
          + New community
        </button>
        {groups.length > 0 && (
          <button type="button" onClick={onDiscover} className="shrink-0 whitespace-nowrap text-xs font-medium text-neutral-500 transition hover:text-white">
            Discover
          </button>
        )}
      </div>

      {showCreate && <CreateCommunityModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function NavRow({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon: ReactNode }) {
  return (
    <div className={`group relative flex items-center rounded-md pl-2.5 pr-1 transition ${active ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`}>
      <span aria-hidden className={`absolute -left-2.5 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full transition ${active ? "bg-[var(--f1-red)]" : "bg-transparent"}`} />
      <button type="button" onClick={onClick} aria-current={active} className="flex w-full items-center gap-2 py-1.5 text-left text-sm">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${active ? "bg-white/10 text-white" : "text-neutral-500"}`}>{icon}</span>
        <span className={active ? "font-semibold text-white" : "text-neutral-300 group-hover:text-white"}>{label}</span>
      </button>
    </div>
  );
}

/** A plain chevron, not "->" - every directional affordance in this section uses this instead of
 * an ASCII arrow. */
function ChevronIcon() {
  return (
    <svg viewBox="0 0 12 12" width="9" height="9" fill="none" aria-hidden>
      <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A real globe, not a 4-square grid glyph - "All" means every followed community's feed
 * aggregated together, and a globe is the honest icon for "everything", the same way it reads on
 * any real navigation system. */
function AllIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 8h12M8 2c1.8 1.7 2.8 3.8 2.8 6S9.8 12.3 8 14c-1.8-1.7-2.8-3.8-2.8-6S6.2 3.7 8 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The mobile equivalent of the left rail above - not the same vertical list shrunk down, a real
 * mobile composition: a horizontally-scrollable chip strip, the idiom a phone screen actually
 * favours for "pick one of a short row of things" (the same shape this app's own filter chips
 * elsewhere already use). Sits above the composer, not below the entire feed - selecting a
 * community should be reachable before scrolling past everything else, not after it.
 */
export function MobileCommunitySelector({ groups, selectedId, onSelect }: { groups: GroupSummary[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  if (groups.length === 0) return null;
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 lg:hidden">
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
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active ? "bg-white/[0.1] text-white" : "bg-white/[0.03] text-neutral-400 hover:text-neutral-200"
      }`}
    >
      {avatarUrl !== undefined && <EntityAvatar imageUrl={avatarUrl} name={label} seed={seed} size={16} />}
      <span className="max-w-[7rem] truncate">{label}</span>
    </button>
  );
}
