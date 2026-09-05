// Deterministic Fallback Engine.
// Generates grounded, fully structured HomepageIntelligence purely from application data
// when the NVIDIA provider rate limit is reached, timeout occurs, or Kimi is unavailable.
// Guarantees the homepage NEVER breaks or crashes due to AI provider state.

import type { HomepageIntelligence } from "./schemas/homepageIntelligence";

export interface FallbackDataContext {
  race?: {
    name: string;
    round: number;
    season: number;
    circuitName?: string;
    city?: string;
  } | null;
  standings?: {
    driverLeader?: { name: string; points: number };
    driverSecond?: { name: string; points: number };
    constructorLeader?: { name: string; points: number };
  } | null;
  trackHistory?: {
    defendingWinner?: string;
    topPerformer?: string;
    totalRaces?: number;
  } | null;
  favoriteDriver?: {
    name: string;
    rank?: number;
    points?: number;
    teamName?: string;
  } | null;
  favoriteTeam?: {
    name: string;
    rank?: number;
    points?: number;
  } | null;
  model?: {
    topPredictedDriver?: string;
    winProbability?: number; // e.g. 0.42
  } | null;
  userPrediction?: {
    predictedWinner?: string;
    submitted?: boolean;
  } | null;
  predictionPerformance?: {
    winnerAccuracy?: number;
    totalPredictions?: number;
    avgPositionError?: number;
  } | null;
  communitySummary?: {
    recentPostCount?: number;
    hotTopic?: string;
  } | null;
}

export function generateDeterministicFallback(
  ctx: FallbackDataContext,
  reason: string = "DETERMINISTIC_FALLBACK",
): { data: HomepageIntelligence; isFallback: true; fallbackReason: string } {
  const raceName = ctx.race?.name || "Upcoming Grand Prix";
  const circuitName = ctx.race?.circuitName || "Circuit";
  const driverLeader = ctx.standings?.driverLeader?.name || "Championship leader";
  const p2Driver = ctx.standings?.driverSecond?.name;
  const p1Points = ctx.standings?.driverLeader?.points ?? 0;
  const p2Points = ctx.standings?.driverSecond?.points ?? 0;
  const pointsGap = p1Points - p2Points;

  const topPredicted = ctx.model?.topPredictedDriver || driverLeader;
  const winProbPct = ctx.model?.winProbability
    ? Math.round(ctx.model.winProbability * 100)
    : 35;

  // 1. Race Brief
  const headline = p2Driver && pointsGap > 0
    ? `${driverLeader} carries a ${pointsGap}-point advantage heading into the ${raceName}.`
    : `Anticipation builds as the paddock prepares for the ${raceName} at ${circuitName}.`;

  const whyItMatters = ctx.trackHistory?.defendingWinner
    ? `Defending circuit winner ${ctx.trackHistory.defendingWinner} looks to repeat past mastery, while the championship battle between ${driverLeader}${p2Driver ? ` and ${p2Driver}` : ""} adds intense strategic pressure.`
    : `Championship contenders must master the unique aerodynamic demands of ${circuitName} to keep their title hopes on track.`;

  const keyFactor = "Tire degradation and pit window management through the middle stint.";

  // 2. One Thing To Watch
  const oneThingToWatch = {
    topic: "Opening Lap Traction",
    explanation: `The run down to Turn 1 at ${circuitName} frequently reshapes qualifying advantages and sets the strategic rhythm for the afternoon.`,
  };

  // 3. Biggest Uncertainty
  const biggestUncertainty = {
    title: ctx.model ? "Model Edge vs On-Track Variables" : "Safety Car Window Volatility",
    explanation: ctx.model
      ? `Our Random Forest model favors ${topPredicted} at ${winProbPct}% win probability, but localized tire deg and pit safety cars remain the pivotal swing factors.`
      : `High probability of virtual or full safety car interruptions keeps alternate pit strategy windows alive throughout the Grand Prix.`,
  };

  // 4. Favorite Driver Insight
  let favoriteDriverInsight: string | null = null;
  if (ctx.favoriteDriver?.name) {
    const rankStr = ctx.favoriteDriver.rank ? `P${ctx.favoriteDriver.rank}` : "in the championship";
    favoriteDriverInsight = `${ctx.favoriteDriver.name} sits ${rankStr} with ${ctx.favoriteDriver.points ?? 0} points, aiming for a strong points haul to consolidate their position.`;
  }

  // 5. Favorite Team Insight
  let favoriteTeamInsight: string | null = null;
  if (ctx.favoriteTeam?.name) {
    const rankStr = ctx.favoriteTeam.rank ? `P${ctx.favoriteTeam.rank}` : "in the standings";
    favoriteTeamInsight = `${ctx.favoriteTeam.name} (${rankStr}) brings updated package configurations targeting aerodynamic balance at ${circuitName}.`;
  }

  // 6. Season Narrative
  const seasonNarrative = p2Driver && pointsGap > 0
    ? `The 2026 title contest remains taut: ${driverLeader} holds a ${pointsGap}-point margin over ${p2Driver}, with every qualifying session and fastest lap point carrying championship weight.`
    : `The season momentum is in full swing as teams dial in development packages heading into ${raceName}.`;

  // 7. Community Pulse
  const communityPulse = ctx.communitySummary?.hotTopic
    ? {
        topics: [ctx.communitySummary.hotTopic, "Qualifying Setup", "Podium Debate"],
        mostDiscussed: ctx.communitySummary.hotTopic,
        summary: `Community discussions are actively debating tire wear strategies and top 5 predictions for ${raceName}.`,
      }
    : {
        topics: ["Qualifying Predictions", "Pole Position", "Podium Battle"],
        mostDiscussed: "Race Winner Debate",
        summary: `Fans and predictors are locking in their weekend picks and analyzing track history form.`,
      };

  // 8. Prediction Coach
  let predictionCoach: { analysis: string; tendency: string } | null = null;
  if (ctx.predictionPerformance && ctx.predictionPerformance.totalPredictions && ctx.predictionPerformance.totalPredictions > 0) {
    const acc = Math.round(ctx.predictionPerformance.winnerAccuracy ?? 0);
    predictionCoach = {
      analysis: `You have an active prediction accuracy of ${acc}% across ${ctx.predictionPerformance.totalPredictions} races.`,
      tendency: acc >= 50
        ? "Consistent performance predicting front-row contenders."
        : "Tendency to pick bold underdog results; look at track history and model simulations to optimize scoring.",
    };
  }

  // 9. Next Action
  const hasUserPredicted = ctx.userPrediction?.submitted;
  const nextAction = hasUserPredicted
    ? {
        label: "Review Machine Learning Projections",
        actionType: "VIEW_MODEL" as const,
      }
    : {
        label: `Submit Predictions for ${raceName}`,
        actionType: "MAKE_PREDICTION" as const,
      };

  return {
    data: {
      raceBrief: { headline, whyItMatters, keyFactor },
      oneThingToWatch,
      biggestUncertainty,
      favoriteDriverInsight,
      favoriteTeamInsight,
      seasonNarrative,
      communityPulse,
      predictionCoach,
      nextAction,
    },
    isFallback: true,
    fallbackReason: reason,
  };
}
