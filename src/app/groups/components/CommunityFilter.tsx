"use client";

import { EntityAvatar } from "@/components/EntityAvatar";
import type { GroupSummary } from "@/lib/supabase/groups";

/**
 * Which community the feed shows: "All communities", or one of yours, as a row of chips above the feed at every
 * width (it scrolls sideways when there are more than fit). Picking one swaps the feed to that community's own stream
 * in place (GroupsFeed owns the fetch); the community's cards above open its page.
 */
export function CommunityFilter({ groups, selectedId, onSelect }: { groups: GroupSummary[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  if (groups.length === 0) return null;
  return (
    <div role="toolbar" aria-label="Show the feed for" data-tour="community-filter" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-hide">
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
