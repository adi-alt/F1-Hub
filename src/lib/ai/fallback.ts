// Deterministic Fallback Engine.
// Generates grounded, fully structured HomepageIntelligence purely from application data
// when the NVIDIA provider rate limit is reached, timeout occurs, or the model is unavailable.
// Guarantees the homepage NEVER breaks or crashes due to AI provider state - and, critically,
// the fallback is ITSELF personalized (real favorite/prediction data is already deterministic;
// only the model's prose is missing), so a provider outage doesn't mean a guest-looking homepage for a
// signed-in user with real favorites.

import type { HomepageIntelligence } from "./schemas/homepageIntelligence";
import type { SinceLastVisitDiff } from "./sinceLastVisit";

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
    circuit?: { appearances: number; wins: number; podiums: number; bestFinish: number | null; avgFinish: number | null } | null;
  } | null;
  favoriteTeam?: {
    name: string;
    rank?: number;
    points?: number;
  } | null;
  model?: {
    topPredictedDriver?: string;
  } | null;
  simulation?: {
    topSimulatedDriver?: string;
    p1Probability?: number; // 0-1
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
  sinceLastVisit?: SinceLastVisitDiff | null;
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
  const topSimulated = ctx.simulation?.topSimulatedDriver || topPredicted;
  const winProbPct = ctx.simulation?.p1Probability != null ? Math.round(ctx.simulation.p1Probability * 100) : null;

  // 1. Race Brief (generic - unchanged from a guest's perspective)
  const headline = p2Driver && pointsGap > 0
    ? `${driverLeader} carries a ${pointsGap}-point advantage heading into the ${raceName}.`
    : `Anticipation builds as the paddock prepares for the ${raceName} at ${circuitName}.`;

  const whyItMatters = ctx.trackHistory?.defendingWinner
    ? `Defending circuit winner ${ctx.trackHistory.defendingWinner} looks to repeat past mastery, while the championship battle between ${driverLeader}${p2Driver ? ` and ${p2Driver}` : ""} adds intense strategic pressure.`
    : `Championship contenders must master the unique aerodynamic demands of ${circuitName} to keep their title hopes on track.`;

  const keyFactor = "Tire degradation and pit window management through the middle stint.";

  // 2. Personal Race Brief - only when a favorite exists, built from real data only
  let personalRaceBrief: HomepageIntelligence["personalRaceBrief"] = null;
  if (ctx.favoriteDriver?.name) {
    const fd = ctx.favoriteDriver;
    const rankStr = fd.rank ? `P${fd.rank}` : "unclassified";
    const circuitLine = fd.circuit && fd.circuit.appearances > 0
      ? `${fd.name} has ${fd.circuit.wins > 0 ? `${fd.circuit.wins} win(s)` : "no wins yet"} at ${circuitName} across ${fd.circuit.appearances} start(s)${fd.circuit.bestFinish != null ? `, best finish P${fd.circuit.bestFinish}` : ""}.`
      : `${fd.name}'s history at ${circuitName} isn't in the archive yet.`;
    personalRaceBrief = {
      headline: `Your driver, ${fd.name}, sits ${rankStr} in the championship heading into ${raceName}.`,
      whyItMatters: circuitLine,
      favoriteDriverAngle: `${fd.name} is chasing ${pointsGap > 0 && fd.name !== driverLeader ? `a ${pointsGap}-point deficit to ${driverLeader}` : "championship points"} this weekend.`,
      favoriteTeamAngle: ctx.favoriteTeam?.name && ctx.favoriteTeam.name !== fd.teamName ? null : null,
    };
  }
  if (ctx.favoriteTeam?.name && !personalRaceBrief) {
    personalRaceBrief = {
      headline: `Your team, ${ctx.favoriteTeam.name}, arrives at ${raceName}${ctx.favoriteTeam.rank ? ` P${ctx.favoriteTeam.rank} in the constructors' standings` : ""}.`,
      whyItMatters: `Every point matters as the constructors' championship continues to take shape.`,
      favoriteDriverAngle: null,
      favoriteTeamAngle: ctx.favoriteTeam.points !== undefined ? `${ctx.favoriteTeam.name} has ${ctx.favoriteTeam.points} points so far this season.` : null,
    };
  }

  // 3. One Thing To Watch
  const oneThingToWatch = {
    topic: "Opening Lap Traction",
    explanation: `The run down to Turn 1 at ${circuitName} frequently reshapes qualifying advantages and sets the strategic rhythm for the afternoon.`,
  };

  // 4. Biggest Uncertainty - cites the real Monte Carlo number, never the RF ranking as a %
  const biggestUncertainty = {
    title: ctx.simulation ? "Model Edge vs On-Track Variables" : "Safety Car Window Volatility",
    explanation: ctx.simulation
      ? `Our Monte Carlo simulation gives ${topSimulated} a ${winProbPct != null ? `${winProbPct}%` : "leading"} win probability, but localized tire deg and pit safety cars remain the pivotal swing factors.`
      : `High probability of virtual or full safety car interruptions keeps alternate pit strategy windows alive throughout the Grand Prix.`,
  };

  // 5/6. Favorite Driver/Team Insight (legacy fields, kept for existing UI consumers)
  let favoriteDriverInsight: string | null = null;
  if (ctx.favoriteDriver?.name) {
    const rankStr = ctx.favoriteDriver.rank ? `P${ctx.favoriteDriver.rank}` : "in the championship";
    favoriteDriverInsight = `${ctx.favoriteDriver.name} sits ${rankStr} with ${ctx.favoriteDriver.points ?? 0} points, aiming for a strong points haul to consolidate their position.`;
  }
  let favoriteTeamInsight: string | null = null;
  if (ctx.favoriteTeam?.name) {
    const rankStr = ctx.favoriteTeam.rank ? `P${ctx.favoriteTeam.rank}` : "in the standings";
    favoriteTeamInsight = `${ctx.favoriteTeam.name} (${rankStr}) brings updated package configurations targeting aerodynamic balance at ${circuitName}.`;
  }

  // 7. Season Narrative
  const seasonNarrative = p2Driver && pointsGap > 0
    ? `The season title contest remains taut: ${driverLeader} holds a ${pointsGap}-point margin over ${p2Driver}, with every qualifying session and fastest lap point carrying championship weight.`
    : `The season momentum is in full swing as teams dial in development packages heading into ${raceName}.`;

  // 8. Community Pulse
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

  // 9. Prediction Coach
  let predictionCoach: { analysis: string; tendency: string } | null = null;
  if (ctx.predictionPerformance && ctx.predictionPerformance.totalPredictions && ctx.predictionPerformance.totalPredictions > 0) {
    const acc = Math.round(ctx.predictionPerformance.winnerAccuracy ?? 0);
    predictionCoach = {
      analysis: `You have an active prediction accuracy of ${acc}% across ${ctx.predictionPerformance.totalPredictions} races.`,
      tendency: acc >= 50
        ? "Consistent performance predicting front-row contenders."
        : "Tendency to pick bold underdog results - look at track history and model simulations to optimize scoring.",
    };
  }

  // 10. Prediction Challenge - deterministic AGREE/DISAGREE/NO_PICK, generic explanation text
  let predictionChallenge: HomepageIntelligence["predictionChallenge"] = null;
  if (ctx.userPrediction?.submitted && ctx.userPrediction.predictedWinner) {
    const modelPick = topSimulated || topPredicted;
    const agrees = ctx.userPrediction.predictedWinner === modelPick;
    predictionChallenge = {
      status: agrees ? "AGREE" : "DISAGREE",
      explanation: agrees
        ? `Your pick matches the model's current favorite, ${modelPick}.`
        : `You backed ${ctx.userPrediction.predictedWinner}, while the model currently favors ${modelPick}${winProbPct != null ? ` at ${winProbPct}% simulated win probability` : ""}.`,
      strongestEvidenceForUser: ctx.favoriteDriver?.circuit?.wins ? `${ctx.userPrediction.predictedWinner} has real history at this circuit.` : "Recent form and qualifying pace remain open questions the model can't fully capture.",
      strongestEvidenceAgainstUser: winProbPct != null ? `The simulation gives ${modelPick} a ${winProbPct}% win probability.` : "The model's simulation currently favors a different driver.",
    };
  } else {
    predictionChallenge = { status: "NO_PICK", explanation: "You haven't made a prediction for this race yet.", strongestEvidenceForUser: "", strongestEvidenceAgainstUser: "" };
  }

  // 11. Personal Outlook - only with a favorite driver
  let personalOutlook: HomepageIntelligence["personalOutlook"] = null;
  if (ctx.favoriteDriver?.name) {
    const fd = ctx.favoriteDriver;
    personalOutlook = {
      driver: fd.name,
      championshipContext: fd.rank ? `${fd.name} sits P${fd.rank} in the championship${fd.points !== undefined ? ` with ${fd.points} points` : ""}.` : `${fd.name}'s championship position isn't classified yet.`,
      circuitContext: fd.circuit && fd.circuit.appearances > 0
        ? `At ${circuitName}: ${fd.circuit.wins} win(s), ${fd.circuit.podiums} podium(s) in ${fd.circuit.appearances} start(s).`
        : `No recorded history for ${fd.name} at ${circuitName} yet.`,
      modelContext: winProbPct != null && topSimulated === fd.name
        ? `The simulation favors ${fd.name} at ${winProbPct}% win probability.`
        : `The model currently favors ${topSimulated || driverLeader} over ${fd.name} this weekend.`,
      overallAssessment: `${fd.name} heads into ${raceName} ${fd.rank ? `P${fd.rank} in the championship` : ""}${fd.circuit?.wins ? ` with a real history of success at ${circuitName}` : ""}. ${winProbPct != null ? `The model currently gives the win edge to ${topSimulated}.` : ""}`.trim(),
    };
  }

  // 12. Since Last Visit
  let sinceLastVisit: HomepageIntelligence["sinceLastVisit"] = null;
  if (ctx.sinceLastVisit?.hasPriorVisit) {
    sinceLastVisit = {
      changes: ctx.sinceLastVisit.changes,
      summary: ctx.sinceLastVisit.changes.length > 0
        ? `${ctx.sinceLastVisit.changes.length} thing${ctx.sinceLastVisit.changes.length === 1 ? "" : "s"} changed since your last visit.`
        : "Nothing materially changed since your last visit.",
    };
  }

  // 13. Next Action
  const hasUserPredicted = ctx.userPrediction?.submitted;
  const nextAction = hasUserPredicted
    ? { label: "Review Machine Learning Projections", actionType: "VIEW_MODEL" as const }
    : { label: `Submit Predictions for ${raceName}`, actionType: "MAKE_PREDICTION" as const };

  return {
    data: {
      raceBrief: { headline, whyItMatters, keyFactor },
      personalRaceBrief,
      oneThingToWatch,
      biggestUncertainty,
      favoriteDriverInsight,
      favoriteTeamInsight,
      seasonNarrative,
      communityPulse,
      predictionCoach,
      predictionChallenge,
      personalOutlook,
      sinceLastVisit,
      nextAction,
    },
    isFallback: true,
    fallbackReason: reason,
  };
}
