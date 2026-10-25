import Link from "next/link";
import { PersonAvatar } from "@/components/avatar/PersonAvatar";
import type { AvatarConfig } from "@/lib/avatar";
import { RaceSectionCard } from "./RaceSectionCard";
import { EntityAvatar } from "@/components/EntityAvatar";
import { groupHref } from "@/lib/routes";
import { predictionTypeLabels, type RaceCommunityCard } from "@/lib/groupPredictionTypes";

/** A small stack of real members' own identity-color avatars (this app's own EntityAvatar
 * convention - initial + a stable hash-derived color, not a fabricated photo this schema has
 * nowhere to store per-member) - "the community feels like people," without inventing any. */
function MemberStack({ members, total }: { members: { id: string; name: string; avatar: AvatarConfig | null }[]; total: number }) {
  if (members.length === 0) return null;
  const overflow = total - members.length;
  return (
    <div className="flex items-center">
      {members.map((m, i) => (
        <div key={m.id} className={i > 0 ? "-ml-2" : ""} style={{ zIndex: members.length - i }}>
          <PersonAvatar id={m.id} avatar={m.avatar} size={22} />
        </div>
      ))}
      {overflow > 0 && (
        <span className="-ml-2 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-subtle bg-surface-2 text-caption font-semibold text-secondary">
          +{overflow}
        </span>
      )}
    </div>
  );
}

const STATUS_AFTER: Record<string, string> = { resolved: "Scored", void: "Voided", locked: "Awaiting the result", open: "Awaiting the result" };

function CommunityRow({ card, completed }: { card: RaceCommunityCard; completed: boolean }) {
  const href = card.prediction ? `${groupHref(card.groupId)}&tab=predictions` : groupHref(card.groupId);
  const actionLabel = completed ? "See results" : card.prediction ? (card.isMember ? "View predictions" : "Join & predict") : card.isMember ? "Open" : "Explore";
  const entries = card.prediction ? `${card.prediction.entryCount} ${card.prediction.entryCount === 1 ? "entry" : "entries"}` : null;
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-control px-2 py-3 transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <EntityAvatar imageUrl={card.avatarUrl} name={card.name} seed={card.groupId} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-semibold text-primary">{card.name}</p>
        <p className="mt-0.5 truncate text-caption text-secondary">
          {completed && card.prediction
            ? `${entries} · ${STATUS_AFTER[card.prediction.status]}`
            : [`${card.memberCount} ${card.memberCount === 1 ? "member" : "members"}`, card.prediction && `${predictionTypeLabels[card.prediction.type]} · ${entries}`].filter(Boolean).join(" · ")}
        </p>
      </div>
      <MemberStack members={card.memberPreview} total={card.memberCount} />
      <span className="hidden shrink-0 text-caption font-medium text-secondary sm:block">{actionLabel} →</span>
    </Link>
  );
}

/**
 * The communities with a prediction on this exact race (listRaceCommunities), the one place the race page lists
 * them. Before the race: the open predictions to join. After it: only the ones people actually entered, as where
 * to see how each community called it; a prediction nobody entered is left out, and with none the section is too.
 */
export function RaceCommunitiesSection({ communities, completed = false, id = "communities" }: { communities: RaceCommunityCard[]; completed?: boolean; id?: string }) {
  const shown = completed ? communities.filter((c) => (c.prediction?.entryCount ?? 0) > 0) : communities;
  if (shown.length === 0) return null;
  return (
    <RaceSectionCard
      id={id}
      title={completed ? "How communities called it" : "Communities predicting this race"}
      description={completed ? "Groups that ran a prediction on this race. Open one for its entries and scores." : "Groups with an open prediction for this race, most active first."}
      headerRight={
        <Link href="/communities" className="rounded-control text-caption font-medium text-secondary transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          All communities →
        </Link>
      }
    >
      <div className="-mx-2 divide-y divide-subtle">
        {shown.map((c) => (
          <CommunityRow key={c.groupId} card={c} completed={completed} />
        ))}
      </div>
    </RaceSectionCard>
  );
}
