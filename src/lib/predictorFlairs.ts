// Predictor Flairs and Reputation System (Level 3.3)
// Evaluates predictor badges based on settled calls, prediction streaks, and model rivalries.
// PURE - no database dependencies, safe for both server and browser bundles.

import type { PredictorFlair, PredictorFlairTone } from "./communities";
import type { CallVerdict } from "./postCalls";

export type FlairSource = {
  authorRecord: { correct: number; settled: number } | null;
  verdicts?: CallVerdict[];
  isP1LastRound?: boolean;
  beatApexLastRound?: boolean;
};

/** Predefined flair definitions with badges and explanations. */
export const PREDICTOR_FLAIR_PRESETS: Record<string, PredictorFlair> = {
  p1_last_round: {
    id: "p1_last_round",
    label: "🏆 P1 Last Round",
    description: "Topped community predictions in the most recent Grand Prix",
    tone: "amber",
  },
  streak_3: {
    id: "streak_3",
    label: "🎯 3-Race Streak",
    description: "3 consecutive correct calls on race weekends",
    tone: "emerald",
  },
  streak_5: {
    id: "streak_5",
    label: "🔥 5-Race Streak",
    description: "5 consecutive correct calls — unstoppable form",
    tone: "brand",
  },
  beat_apex: {
    id: "beat_apex",
    label: "🤖 Beat Apex",
    description: "Successfully outpredicted the Apex Monte Carlo model",
    tone: "cyan",
  },
  high_accuracy: {
    id: "high_accuracy",
    label: "🎯 80%+ Hit Rate",
    description: "Over 80% accuracy across settled community calls",
    tone: "emerald",
  },
  sharp: {
    id: "sharp",
    label: "⚡ Sharp Predictor",
    description: "Proven track record across 5+ settled calls",
    tone: "purple",
  },
};

/** Compute a user's active predictor flairs based on their calls history and records. */
export function computePredictorFlairs(source: FlairSource): PredictorFlair[] {
  const flairs: PredictorFlair[] = [];
  const rec = source.authorRecord;

  // Streak calculation from verdicts (newest first)
  if (source.verdicts && source.verdicts.length > 0) {
    let streak = 0;
    for (const v of source.verdicts) {
      if (v.status === "correct") {
        streak++;
      } else if (v.status === "incorrect") {
        break;
      }
      // "pending" or "void" doesn't necessarily break streak if looking at settled only
    }

    if (streak >= 5) {
      flairs.push(PREDICTOR_FLAIR_PRESETS.streak_5);
    } else if (streak >= 3) {
      flairs.push(PREDICTOR_FLAIR_PRESETS.streak_3);
    }
  }

  // Hit rate badge
  if (rec && rec.settled >= 3) {
    const rate = rec.correct / rec.settled;
    if (rate >= 0.75) {
      flairs.push({
        id: "high_accuracy",
        label: `🔥 ${Math.round(rate * 100)}% Hit Rate`,
        description: `${rec.correct} of ${rec.settled} calls correct this season`,
        tone: "emerald",
      });
    } else if (rec.settled >= 5 && rec.correct >= 3) {
      flairs.push(PREDICTOR_FLAIR_PRESETS.sharp);
    }
  }

  // P1 Last Round
  if (source.isP1LastRound) {
    flairs.push(PREDICTOR_FLAIR_PRESETS.p1_last_round);
  }

  // Beat Apex
  if (source.beatApexLastRound || (rec && rec.settled >= 2 && rec.correct >= 2)) {
    // If not already carrying 2 flairs, add Beat Apex
    if (flairs.length < 2) {
      flairs.push(PREDICTOR_FLAIR_PRESETS.beat_apex);
    }
  }

  // Cap at max 2 prominent badges to keep UI clean and tasteful
  return flairs.slice(0, 2);
}

/** Styling token helpers for predictor flairs. */
export function getFlairToneClasses(tone: PredictorFlairTone): { bg: string; text: string; border: string; glow: string } {
  switch (tone) {
    case "amber":
      return {
        bg: "bg-amber-500/10 hover:bg-amber-500/15",
        text: "text-amber-400 font-medium",
        border: "border-amber-500/25",
        glow: "shadow-[0_0_8px_rgba(245,158,11,0.15)]",
      };
    case "emerald":
      return {
        bg: "bg-emerald-500/10 hover:bg-emerald-500/15",
        text: "text-emerald-400 font-medium",
        border: "border-emerald-500/25",
        glow: "shadow-[0_0_8px_rgba(16,185,129,0.15)]",
      };
    case "cyan":
      return {
        bg: "bg-cyan-500/10 hover:bg-cyan-500/15",
        text: "text-cyan-400 font-medium",
        border: "border-cyan-500/25",
        glow: "shadow-[0_0_8px_rgba(6,182,212,0.15)]",
      };
    case "brand":
      return {
        bg: "bg-brand/10 hover:bg-brand/15",
        text: "text-brand font-medium",
        border: "border-brand/25",
        glow: "shadow-[0_0_8px_rgba(232,0,45,0.15)]",
      };
    case "purple":
    default:
      return {
        bg: "bg-purple-500/10 hover:bg-purple-500/15",
        text: "text-purple-300 font-medium",
        border: "border-purple-500/25",
        glow: "shadow-[0_0_8px_rgba(168,85,247,0.15)]",
      };
  }
}
