import Link from "next/link";
import { RaceSectionCard } from "./RaceSectionCard";
import { EntityAvatar } from "@/components/EntityAvatar";
import { groupHref } from "@/lib/routes";
import { predictionTypeLabels, type RaceCommunityCard } from "@/lib/groupPredictionTypes";

/** A small stack of real members' own identity-color avatars (this app's own EntityAvatar
 * convention - initial + a stable hash-derived color, not a fabricated photo this schema has
 * nowhere to store per-member) - "the community feels like people," without inventing any. */
function MemberStack({ members, total }: { members: { id: string; name: string }[]; total: number }) {
  if (members.length === 0) return null;
  const overflow = total - members.length;
  return (
    <div className="flex items-center">
      {members.map((m, i) => (
        <div key={m.id} className={i > 0 ? "-ml-2" : ""} style={{ zIndex: members.length - i }}>
          <EntityAvatar imageUrl={null} name={m.name} seed={m.id} size={22} />
        </div>
      ))}
      {overflow > 0 && (
        <span className="-ml-2 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-[var(--f1-carbon)] bg-white/[0.08] text-[9px] font-semibold text-neutral-300">
          +{overflow}
        </span>
      )}
    </div>
  );
}

function CommunityRow({ card }: { card: RaceCommunityCard }) {
  const href = card.prediction ? `${groupHref(card.groupId)}?tab=predictions` : groupHref(card.groupId);
  const actionLabel = card.prediction ? (card.isMember ? "View predictions" : "Join & predict") : card.isMember ? "Open" : "Explore";
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-white/20 hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
    >
      <EntityAvatar imageUrl={card.avatarUrl} name={card.name} seed={card.groupId} size={38} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{card.name}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
          <span>
            {card.memberCount} {card.memberCount === 1 ? "member" : "members"}
          </span>
          {card.prediction && (
            <>
              <span aria-hidden>·</span>
              <span>
                {predictionTypeLabels[card.prediction.type]} · {card.prediction.entryCount} {card.prediction.entryCount === 1 ? "entry" : "entries"}
              </span>
            </>
          )}
        </div>
      </div>
      <MemberStack members={card.memberPreview} total={card.memberCount} />
      <span className="hidden shrink-0 text-xs font-medium text-neutral-400 sm:block">{actionLabel} →</span>
    </Link>
  );
}

/**
 * Real communities, tied to this exact race where any exist - never an invented "trending"
 * signal, never a fabricated member/activity count (see listRaceCommunities' own comment). Shown
 * on every race page regardless of phase; it degrades to general discovery (not an empty section)
 * when literally no group has opened a prediction for this specific race yet - true for most races
 * most of the time, since not every public group predicts every round.
 *
 * Renders nothing at all only on a genuine fetch failure or a truly empty discovery result (no
 * public groups exist at all) - both real, rare states, never papered over with placeholder cards.
 */
export function RaceCommunitiesSection({ mode, communities, id }: { mode: "predicting" | "discover"; communities: RaceCommunityCard[]; id?: string }) {
  if (communities.length === 0) return null;
  return (
    <RaceSectionCard
      id={id}
      title={mode === "predicting" ? "Communities predicting this race" : "Communities to join"}
      description={mode === "predicting" ? "Real groups with an open prediction for this exact race, most active first." : "No group has opened a prediction for this race yet - here's where people are talking F1."}
      headerRight={
        <Link href="/groups" className="text-xs font-medium text-neutral-400 transition hover:text-white">
          Discover more →
        </Link>
      }
    >
      <div className="space-y-2">
        {communities.map((c) => (
          <CommunityRow key={c.groupId} card={c} />
        ))}
      </div>
    </RaceSectionCard>
  );
}
