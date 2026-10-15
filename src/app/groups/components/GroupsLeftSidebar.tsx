"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Compass, Home, MoreHorizontal, Plus } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Icon } from "@/components/ui/Icon";
import { groupHref } from "@/lib/routes";
import type { GroupSummary } from "@/lib/supabase/groups";
import type { CommunityPulseData } from "@/lib/supabase/communityPulse";
import { CommunityPulseCard } from "./CommunityPulseCard";

/** Row height plus the gap between rows: the list is sized in whole rows. */
const ROW_PX = 40 + 2;

/**
 * Your communities, as the left rail. Selecting a row doesn't navigate: it switches the feed to that community's
 * own stream in place (GroupsFeed owns the fetch), the way a mail client's folders do. The arrow on a hovered row
 * opens the community's own page, so filtering and opening stay two separate actions.
 *
 * The rail never scrolls and never clips (only the feed scrolls): it shows as many whole rows as the window has
 * room for, and the rest sit behind "See all", a dialog with the full list. The selected community is always
 * one of the visible rows. Pulse sits under the list when the window is tall enough for both.
 */
export function GroupsLeftSidebar({
  groups,
  selectedId,
  onSelect,
  onCreate,
  onDiscover,
  pulse,
}: {
  groups: GroupSummary[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  onDiscover: () => void;
  pulse: CommunityPulseData;
}) {
  const columnRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pulseRef = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(Number.POSITIVE_INFINITY);
  const [showAll, setShowAll] = useState(false);

  // Whole rows that fit: the column's height, less Pulse, less the card's own chrome (header, Discover row).
  useLayoutEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    const measure = () => {
      const card = cardRef.current;
      const list = listRef.current;
      if (!card || !list || column.clientHeight === 0) return;
      const chrome = card.offsetHeight - list.offsetHeight;
      const pulseEl = pulseRef.current;
      const pulseH = pulseEl && pulseEl.offsetHeight > 0 ? pulseEl.offsetHeight + 12 : 0;
      setCapacity(Math.max(3, Math.floor((column.clientHeight - pulseH - chrome + 2) / ROW_PX)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(column);
    if (pulseRef.current) ro.observe(pulseRef.current);
    return () => ro.disconnect();
  }, []);

  // "All communities" is the first row; the communities follow. When they don't all fit, the last visible slot
  // becomes "See all", and a selected community past the cut takes the slot before it.
  const total = groups.length + 1;
  const overflow = total > capacity;
  let shown = overflow ? groups.slice(0, Math.max(0, capacity - 2)) : groups;
  if (overflow && selectedId && !shown.some((g) => g.id === selectedId)) {
    const selected = groups.find((g) => g.id === selectedId);
    if (selected) shown = [...shown.slice(0, -1), selected];
  }

  return (
    <div ref={columnRef} className="flex h-full min-h-0 flex-col gap-3">
      <nav ref={cardRef} aria-label="Your communities" className="flex min-h-0 shrink flex-col rounded-card bg-surface-1 p-2">
        <div className="flex h-9 shrink-0 items-center justify-between gap-2 pl-2">
          <h3 className="text-body font-semibold text-primary">Communities</h3>
          <button
            type="button"
            onClick={onCreate}
            aria-label="Start a community"
            title="Start a community"
            className="flex size-8 items-center justify-center rounded-full text-secondary transition-colors duration-fast hover:bg-surface-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Icon icon={Plus} size={16} />
          </button>
        </div>

        <div ref={listRef} data-tour="community-list" className="mt-1 min-h-0 space-y-0.5 overflow-hidden">
          <div data-tour="community-filter">
            <AllRow active={selectedId === null} onClick={() => onSelect(null)} />
          </div>
          {shown.map((g) => (
            <CommunityRow key={g.id} group={g} active={selectedId === g.id} onClick={() => onSelect(g.id)} />
          ))}
          {overflow && (
            <button type="button" onClick={() => setShowAll(true)} className={`${ROW} text-secondary hover:bg-surface-2/70 hover:text-primary`}>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full text-tertiary">
                <Icon icon={MoreHorizontal} size={20} />
              </span>
              <span className="text-body-sm font-medium">
                See all <span className="tabular text-tertiary">{groups.length}</span>
              </span>
            </button>
          )}
        </div>

        <div className="mt-1 shrink-0 border-t border-white/[0.06] pt-1">
          <button type="button" onClick={onDiscover} className={`${ROW} text-secondary hover:bg-surface-2/70 hover:text-primary`}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full text-tertiary">
              <Icon icon={Compass} size={20} />
            </span>
            <span className="text-body-sm font-medium">Discover communities</span>
          </button>
        </div>
      </nav>

      {/* Only when the window is tall enough to give the list room as well. */}
      <div ref={pulseRef} className="hidden shrink-0 rounded-card bg-surface-1 px-2 py-4 [@media(min-height:760px)]:block">
        <CommunityPulseCard groups={groups} pulse={pulse} />
      </div>

      <Dialog open={showAll} onClose={() => setShowAll(false)} title="Your communities" size="sm">
        <div className="space-y-0.5">
          <AllRow
            active={selectedId === null}
            onClick={() => {
              onSelect(null);
              setShowAll(false);
            }}
          />
          {groups.map((g) => (
            <CommunityRow
              key={g.id}
              group={g}
              active={selectedId === g.id}
              onClick={() => {
                onSelect(g.id);
                setShowAll(false);
              }}
            />
          ))}
        </div>
      </Dialog>
    </div>
  );
}

const ROW =
  "flex h-10 w-full items-center gap-2.5 rounded-control px-1.5 text-left transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

function AllRow({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <NavRow
      label="All communities"
      active={active}
      onClick={onClick}
      icon={
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-full transition-colors duration-fast ${active ? "text-primary" : "text-tertiary"}`}>
          <Icon icon={Home} size={20} />
        </span>
      }
    />
  );
}

function CommunityRow({ group: g, active, onClick }: { group: GroupSummary; active: boolean; onClick: () => void }) {
  return (
    <NavRow
      label={g.name}
      active={active}
      onClick={onClick}
      icon={<EntityAvatar imageUrl={g.avatarUrl} name={g.name} seed={g.id} size={28} />}
      // New posts this week, as an unread-style dot (critique §5.2); open rounds live in the race rail.
      badge={g.weeklyPosts > 0 ? <span title="Active this week" className="mr-1 size-1.5 shrink-0 rounded-full bg-primary/70 group-hover:hidden" /> : undefined}
      openHref={groupHref(g.id)}
      openLabel={`Open ${g.name}`}
    />
  );
}

/**
 * One navigation row, the single row grammar of the rail. Selected is a quiet neutral tone and brighter, heavier
 * text (red is kept for actions); idle rows carry no surface, so nothing competes with the feed.
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
    <div className={`group relative flex h-10 items-center gap-1 rounded-control pr-1 transition-colors duration-fast ${active ? "bg-surface-2" : "hover:bg-surface-2/70"}`}>
      <button type="button" onClick={onClick} aria-current={active} className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-control pl-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
        {icon}
        <span className={`min-w-0 flex-1 truncate text-body-sm ${active ? "font-semibold text-primary" : "font-medium text-secondary group-hover:text-primary"}`}>{label}</span>
      </button>
      {badge}
      {openHref && (
        <Link
          href={openHref}
          aria-label={openLabel}
          title="Open community"
          className="sr-only shrink-0 rounded-control p-1 text-tertiary hover:text-primary focus-visible:not-sr-only group-hover:not-sr-only"
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
