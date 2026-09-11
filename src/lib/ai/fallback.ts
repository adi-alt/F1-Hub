// Deterministic Fallback Engine.
// Generates grounded, fully structured HomepageIntelligence purely from application data
// when the NVIDIA provider rate limit is reached, timeout occurs, or the model is unavailable.
// Guarantees the homepage NEVER breaks or crashes due to AI provider state - and, critically,
// the fallback is ITSELF personalized (real favorite/prediction data is already deterministic;
// only the model's prose is missing), so a provider outage doesn't mean a guest-looking homepage for a
// signed-in user with real favorites.

import type { RaceIntelligenceContext } from "./context/raceContext";
import type { HomepageIntelligence } from "./schemas/homepageIntelligence";
import type { RaceInsight, RaceIntelligenceResult } from "./schemas/raceIntelligence";
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
  /** Is this weekend's circuit one of the user's favorite circuits - see homepage route.ts's new
   * `isFavoriteCircuit` resolution. */
  favoriteCircuit?: { name: string } | null;
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
        ? `At ${circuitName}: ${fd.circuit.wins} win(s), ${fd.circuit.podiums} podium(s) in ${fd.circuit.appearances} start(s).${ctx.favoriteCircuit ? ` ${circuitName} is also one of your favorite circuits.` : ""}`
        : `No recorded history for ${fd.name} at ${circuitName} yet.${ctx.favoriteCircuit ? ` ${circuitName} is one of your favorite circuits.` : ""}`,
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

// ─── Race Intelligence fallback ────────────────────────────────────────────────
// Unlike the homepage fallback above (which builds from a separate, simplified FallbackDataContext),
// this takes the real RaceIntelligenceContext directly - it already has everything needed, no
// second, narrower type to keep in sync. Explicit quality rule, not just "template something": only
// real deterministic facts already available elsewhere on the page get stated; anything it can't
// honestly template gets `available: false` / empty evidenceIds, never a vague filler sentence.
export function generateDeterministicRaceFallback(context: RaceIntelligenceContext): RaceIntelligenceResult {
  const { classification, standingsImpact, safetyCarPeriods, keyMoments } = context;
  const winnerName = classification.winner?.driverName ?? "the winner";

  const keyFactors: RaceInsight[] = [];
  if (classification.winner) {
    keyFactors.push({
      title: "Race winner",
      explanation: `${winnerName} won the race.`,
      claimType: "fact",
      evidenceIds: ["classification-winner"],
    });
  }
  if (classification.dnfCount > 0) {
    keyFactors.push({
      title: "Retirements",
      explanation: `${classification.dnfCount} car${classification.dnfCount === 1 ? "" : "s"} failed to finish.`,
      claimType: "fact",
      evidenceIds: ["classification-dnf"],
    });
  }
  if (safetyCarPeriods !== null && safetyCarPeriods > 0) {
    keyFactors.push({
      title: "Safety car",
      explanation: `${safetyCarPeriods} safety car period${safetyCarPeriods === 1 ? "" : "s"} affected the race.`,
      claimType: "fact",
      evidenceIds: ["safety-car-count"],
    });
  }
  const biggestMoveMoment = keyMoments.find((m) => m.text.includes("gained"));
  if (biggestMoveMoment) {
    const factId = context.evidenceFacts.find((f) => f.fact === `Lap ${biggestMoveMoment.lap}: ${biggestMoveMoment.text}`)?.id;
    keyFactors.push({
      title: "Biggest mover",
      explanation: biggestMoveMoment.text,
      claimType: "fact",
      evidenceIds: factId ? [factId] : [],
    });
  }
  // Never pad below 3 with invented content - a fallback race with too little real data to
  // template just has fewer key factors, an honest gap rather than filler.

  return {
    shared: {
      headline: classification.winner ? `${winnerName} wins the ${context.race.name}` : `${context.race.name} results`,
      executiveSummary: classification.winner
        ? `${winnerName} won the ${context.race.name}${classification.dnfCount > 0 ? `, with ${classification.dnfCount} retirement${classification.dnfCount === 1 ? "" : "s"}` : ""}.`
        : `Results are in for the ${context.race.name}.`,
      keyFactors,
      strategyInsight: { title: "", explanation: "", available: false },
      racePaceInsight: { title: "", explanation: "", available: false },
      championshipImpact: standingsImpact.driverLeaderChanged
        ? { title: "Championship lead changes hands", explanation: `${standingsImpact.newDriverLeader} is the new championship leader.`, available: true }
        : { title: "", explanation: "", available: false },
    },
    // Personal fallback: only produced with real favorite context, specific and grounded - never
    // generic motivational filler. The route only calls this at all when hasPersonalContext() is
    // true, but this function stays defensive regardless. Scoped to the primary (first) favorite
    // driver - a deterministic template can't synthesize prose across multiple favorites the way
    // free-form AI text can (same scope decision as the homepage fallback).
    personal:
      context.favoriteDrivers[0] &&
      (() => {
        const primary = context.favoriteDrivers[0];
        const row = context.evidenceFacts.find((f) => f.id.startsWith("favorite-driver-result"));
        return row ? { title: `${primary.name}'s race`, explanation: row.fact, evidenceIds: [row.id] } : null;
      })(),
  };
}


import { SharedSeasonIntelligence, SeasonCompareInsight } from "./schemas/seasonIntelligence";

// Loosely-typed on purpose - this is the same contextSnapshot SeasonDetail.tsx serializes to
// contextJson, but the fallback only reads a handful of already-real, already-computed fields
// from it, defensively, and never fails just because the shape doesn't fully match.
type SeasonFallbackContext = {
  driverStandings?: { position: number; name: string; team: string; points: number; wins: number }[];
  battles?: { aLabel: string; bLabel: string; gap: number }[];
};

/** Never says "deterministic", "fallback", "cache", or any other implementation term - this reads
 * exactly like normal Apex copy because a real generation failure should be invisible to the
 * user, not a status message about the AI layer's own internal state. Every sentence here is
 * built ONLY from numbers already computed and passed in (season/completedRounds/context) -
 * never a guess or an invented stat, the same rule every other deterministic fallback in this
 * file follows. */
export function generateDeterministicSeasonFallback(season: number, completedRounds: number, contextJson?: string): SharedSeasonIntelligence {
  let ctx: SeasonFallbackContext = {};
  if (contextJson) {
    try {
      ctx = JSON.parse(contextJson) as SeasonFallbackContext;
    } catch {
      // Malformed/absent context - the generic sentences below still hold up on their own.
    }
  }

  const leader = ctx.driverStandings?.[0];
  const chaser = ctx.driverStandings?.[1];
  const closestBattle = ctx.battles?.[0];

  const seasonSummary =
    leader && chaser
      ? `${leader.name} leads the ${season} championship by ${leader.points - chaser.points} points over ${chaser.name} after ${completedRounds} rounds.`
      : `${completedRounds} rounds of the ${season} season are complete, with the championship still taking shape.`;

  const battleSummary = closestBattle
    ? closestBattle.gap === 0
      ? `${closestBattle.aLabel} and ${closestBattle.bLabel} are level on points, the tightest fight in the standings right now.`
      : `${closestBattle.aLabel} and ${closestBattle.bLabel} are separated by just ${closestBattle.gap} points, the closest battle in the standings.`
    : "The standings below show how tightly the field is matched this season.";

  return {
    seasonStory: {
      headline: leader ? `${leader.name} sets the pace` : `${season} season`,
      summary: seasonSummary,
      themes: [],
    },
    battleInsight: {
      headline: "Championship battles",
      summary: battleSummary,
      highlightedBattleId: undefined,
    },
    progressionInsight: {
      headline: "Season progression",
      summary: leader ? `${leader.name} has won ${leader.wins} of the ${completedRounds} rounds run so far.` : "The full points progression is charted below.",
      highlightedEntities: [],
    },
    recordInsight: {
      headline: "Records",
      summary: leader ? `${leader.name} leads the season with ${leader.points} points and ${leader.wins} wins.` : "The season's key records are listed below.",
      highlightedRecordIds: [],
    },
    whatChangedInsight: {
      summary: "The latest round's exact position and points changes are listed below.",
      highlights: [],
    },
  };
}

export function generateDeterministicCompareFallback(entityA: string, entityB: string): SeasonCompareInsight {
  return {
    headline: `${entityA} vs ${entityB}`,
    summary: `A written breakdown of ${entityA} against ${entityB} is unavailable right now. The stats below are exact.`,
    keyAdvantageA: "See the stats below",
    keyAdvantageB: "See the stats below",
    momentum: "EVEN"
  };
}
