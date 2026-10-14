"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, LayoutGrid } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Icon } from "@/components/ui/Icon";
import { groupHref } from "@/lib/routes";
import type { GroupSummary } from "@/lib/supabase/groups";

/**
 * Your communities, as a rail beside the feed. Selecting a row doesn't navigate: it switches the feed to that
 * community's own stream in place (GroupsFeed owns the fetch), the way a mail client's folders do. "All" returns to
 * the feed across every community. The arrow on a row opens that community's own page (predictions, members), so
 * filtering and opening stay two separate actions.
 *
 * The page's title and the New community / Discover actions live in the page header now, not in this rail.
 */
export function GroupsLeftSidebar({ groups, selectedId, onSelect }: { groups: GroupSummary[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  return (
    <nav aria-label="Your communities" className="flex max-h-[calc(100dvh-6rem)] flex-col rounded-card border border-white/10 bg-surface-1/60 p-2">
      <div className="flex shrink-0 items-baseline justify-between px-2 pb-2 pt-1">
        <h2 className="text-body-sm font-semibold text-primary">Your communities</h2>
        <span className="text-caption tabular text-tertiary">{groups.length}</span>
      </div>
      <div data-tour="community-list" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto scrollbar-subtle">
        <div data-tour="community-filter">
          <NavRow
            label="All communities"
            sublabel="The feed across all of them"
            active={selectedId === null}
            onClick={() => onSelect(null)}
            icon={
              <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-surface-2 text-secondary">
                <Icon icon={LayoutGrid} size={16} />
              </span>
            }
          />
        </div>
        {groups.map((g, i) => (
          <motion.div key={g.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: Math.min(i, 8) * 0.03, ease: [0.2, 0, 0, 1] }}>
            <NavRow
              label={g.name}
              sublabel={`${g.memberCount} member${g.memberCount === 1 ? "" : "s"}`}
              active={selectedId === g.id}
              onClick={() => onSelect(g.id)}
              icon={<EntityAvatar imageUrl={g.avatarUrl} name={g.name} seed={g.id} size={36} />}
              badge={
                g.activePredictions > 0 ? (
                  <span title={`${g.activePredictions} open prediction round${g.activePredictions === 1 ? "" : "s"}`} className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-surface-3 px-1.5 text-caption font-semibold tabular text-primary">
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
    </nav>
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
    <div className={`group relative flex items-center gap-2 rounded-control px-2 py-2 transition-colors duration-fast ${active ? "bg-surface-2" : "hover:bg-surface-2/60"}`}>
      {active && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand" />}
      <button type="button" onClick={onClick} aria-current={active} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-control text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
        {icon}
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-body-sm ${active ? "font-semibold text-primary" : "font-medium text-secondary group-hover:text-primary"}`}>{label}</span>
          {sublabel && <span className="block truncate text-caption text-tertiary">{sublabel}</span>}
        </span>
      </button>
      {badge}
      {openHref && (
        <Link
          href={openHref}
          aria-label={openLabel}
          title="Open community"
          className="shrink-0 rounded-control p-1 text-tertiary opacity-0 transition-opacity duration-fast hover:text-primary focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Icon icon={ChevronRight} size={16} />
        </Link>
      )}
    </div>
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
      <Chip label="All communities" active={selectedId === null} onClick={() => onSelect(null)} />
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
      className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-body-sm transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
        active ? "border-white/30 bg-surface-3 font-medium text-primary" : "border-subtle text-secondary hover:border-strong hover:text-primary"
      }`}
    >
      {avatarUrl !== undefined && <EntityAvatar imageUrl={avatarUrl} name={label} seed={seed} size={16} />}
      <span className="max-w-[7rem] truncate">{label}</span>
    </button>
  );
}
