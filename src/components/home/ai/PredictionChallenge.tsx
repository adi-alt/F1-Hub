"use client";

import { Skeleton } from "@/components/ui/Skeleton";
import { useHomepageIntelligence } from "./HomepageIntelligenceProvider";

const STATUS_LABEL: Record<string, string> = {
  AGREE: "Model agrees with you",
  DISAGREE: "Model disagrees with you",
};

/** "AI Challenge" - lives inside the existing PickVsModel section (Your Pick vs. F1 Hub Model),
 * not a new top-level card. status/AGREE-DISAGREE is decided deterministically by the route before
 * the model ever runs (comparing the user's real pick to the model's real pick); the model only writes the
 * explanation and cites the evidence it was actually given. */
export function PredictionChallenge() {
  const { intelligence, isLoading } = useHomepageIntelligence();

  if (isLoading) return <PredictionChallengeSkeleton />;

  const challenge = intelligence?.predictionChallenge;
  if (!challenge || challenge.status === "NO_PICK") return null;

  const isDisagree = challenge.status === "DISAGREE";

  return (
    <div className={`mt-4 rounded-xl border px-3.5 py-3 ${isDisagree ? "border-[var(--f1-red)]/25 bg-[var(--f1-red)]/[0.05]" : "border-emerald-500/20 bg-emerald-500/[0.04]"}`}>
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${isDisagree ? "bg-[var(--f1-red)]" : "bg-emerald-400"}`} />
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-300">
          {isDisagree ? "AI Challenge" : STATUS_LABEL.AGREE}
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

export function PredictionChallengeSkeleton() {
  return (
    <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
      <Skeleton className="skeleton-shimmer h-3 w-28 rounded" />
      <Skeleton className="skeleton-shimmer mt-2 h-3.5 w-full rounded" />
    </div>
  );
}
