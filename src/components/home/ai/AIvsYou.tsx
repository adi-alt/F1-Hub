"use client";

import { Skeleton } from "@/components/ui/Skeleton";
import { modelPositionFor } from "../PickVsModel";
import { useHomepageIntelligence } from "./HomepageIntelligenceProvider";
import type { RaceDoc, UserPick } from "@/lib/types/race";

const STATUS_LABEL: Record<string, string> = {
  AGREE: "The model agrees with you",
  DISAGREE: "AI vs You",
};

/** Its own standalone section (previously nested inside PickVsModel's card) - reads as commentary
 * attached to that chart, not a competing prediction component. status/AGREE-DISAGREE is decided
 * deterministically by the route before the model ever runs (comparing the user's real pick to the
 * model's real pick); the model only writes the explanation and cites the evidence it was actually
 * given. The VS header row above the explanation is likewise plain real data - the same
 * `modelPositionFor` derivation PickVsModel's own chart uses for the user's predicted winner - not
 * AI-generated, so the disagreement is visually explicit before the model's own case appears. */
export function AIvsYou({ myPick, nextRace }: { myPick: UserPick | null; nextRace: RaceDoc | null }) {
  const { intelligence, isLoading } = useHomepageIntelligence();

  if (isLoading) return <AIvsYouSkeleton />;

  const challenge = intelligence?.predictionChallenge;
  if (!challenge || challenge.status === "NO_PICK") return null;

  const isDisagree = challenge.status === "DISAGREE";
  const yourWinner = myPick?.predictedPodium?.[0] ?? null;
  const modelPosition = yourWinner && nextRace ? modelPositionFor(nextRace, yourWinner) : null;

  return (
    <div className={`rounded-xl border px-4 py-4 ${isDisagree ? "border-[var(--f1-red)]/25 bg-[var(--f1-red)]/[0.05]" : "border-emerald-500/20 bg-emerald-500/[0.04]"}`}>
      {yourWinner && (
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Your Pick</p>
            <p className="mt-0.5 text-sm font-semibold text-white">{yourWinner} P1</p>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-600">vs</span>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">F1 Hub Model</p>
            <p className="mt-0.5 text-sm font-semibold text-white">
              {yourWinner} {modelPosition != null ? `P${modelPosition}` : "—"}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${isDisagree ? "bg-[var(--f1-red)]" : "bg-emerald-400"}`} />
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-300">
          {isDisagree ? STATUS_LABEL.DISAGREE : STATUS_LABEL.AGREE}
        </p>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-neutral-200">{challenge.explanation}</p>
      {isDisagree && (challenge.strongestEvidenceForUser || challenge.strongestEvidenceAgainstUser) && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {challenge.strongestEvidenceForUser && (
            <p className="text-[11px] text-neutral-400">
              <span className="font-medium text-neutral-300">Your case: </span>
              {challenge.strongestEvidenceForUser}
            </p>
          )}
          {challenge.strongestEvidenceAgainstUser && (
            <p className="text-[11px] text-neutral-400">
              <span className="font-medium text-neutral-300">The model&apos;s case: </span>
              {challenge.strongestEvidenceAgainstUser}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function AIvsYouSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4">
      <Skeleton className="skeleton-shimmer h-3 w-28 rounded" />
      <Skeleton className="skeleton-shimmer mt-2 h-3.5 w-full rounded" />
    </div>
  );
}
