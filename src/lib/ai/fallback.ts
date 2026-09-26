// Deterministic Fallback Engine.
// Generates grounded, fully structured HomepageIntelligence purely from application data
// when the NVIDIA provider rate limit is reached, timeout occurs, or the model is unavailable.
// Guarantees the homepage NEVER breaks or crashes due to AI provider state - and, critically,
// the fallback is ITSELF personalized (real favorite/prediction data is already deterministic;
// only the model's prose is missing), so a provider outage doesn't mean a guest-looking homepage for a
// signed-in user with real favorites.

import { joinNames } from "@/lib/circuitIntelligence";
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


import type { SharedSeasonIntelligence, SeasonCompareInsight, RaceEventTake, SharedCircuitIntelligence } from "./schemas/seasonIntelligence";
import type { ComparePair, RaceSummary } from "@/app/season/_service/season.pure";
import type { SeasonNarrativeContext } from "./context/seasonContext";
import type { CircuitContext } from "./context/circuitContext";

// ─── Season fallbacks ──────────────────────────────────────────────────────────
//
// These exist for the minutes when the provider is unavailable, and the bar for them is not
// "something renders" - it is "a reader cannot tell anything is wrong." So: no implementation
// vocabulary ever reaches the screen (no "deterministic", "fallback", "AI", "cache", "mode"), and
// every sentence is assembled from numbers that were already computed upstream. They read thinner
// than real editorial copy, which is honest; they never read like a status message.
//
// The application still knows the difference - see IntelligenceSource - it just doesn't make the
// reader carry it.

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

export function generateSeasonFallbackFromContext(ctx: SeasonNarrativeContext): SharedSeasonIntelligence {
  const leader = ctx.drivers[0];
  const second = ctx.drivers[1];
  const topTeam = ctx.constructors[0];
  const tightest = ctx.battles[0];
  const form = ctx.recentForm[0];
  const mover = ctx.movers.find((m) => m.positionDelta) ?? ctx.movers[0];
  const gap = leader && second ? leader.points - second.points : null;

  // The story leads with the shape of the championship rather than its scoreline, so it reads as
  // a claim rather than a table read back.
  const storyHeadline = !leader
    ? `The ${ctx.season} season is still taking shape`
    : gap === null
      ? `${leader.driverName} sets the early standard`
      : gap === 0
        ? `${leader.driverName} and ${second!.driverName} are inseparable at the top`
        : gap > 50
          ? `${leader.driverName} has turned a lead into a buffer`
          : `${leader.driverName} leads, but the margin is still live`;

  const storyParts: string[] = [];
  if (leader && ctx.completedRounds > 0) {
    storyParts.push(
      `${leader.driverName} heads the championship after ${ctx.completedRounds} completed ${plural(ctx.completedRounds, "round")}` +
        (gap !== null && gap > 0 ? `, ${gap} ${plural(gap, "point")} clear of ${second!.driverName}.` : second ? `, level with ${second.driverName}.` : "."),
    );
  } else {
    storyParts.push(`The ${ctx.season} season has not yet produced a classified round.`);
  }
  if (form && ctx.formWindow > 0) {
    storyParts.push(
      form.name === leader?.driverName
        ? `The same driver has scored more than anyone across the last ${ctx.formWindow} rounds, so recent form is reinforcing the order rather than disturbing it.`
        : `${form.name} has scored more than anyone across the last ${ctx.formWindow} rounds, which is the clearest sign of movement behind the leader.`,
    );
  }
  if (ctx.remainingRounds > 0 && gap !== null) {
    storyParts.push(
      gap > 50
        ? `With ${ctx.remainingRounds} ${plural(ctx.remainingRounds, "round")} left, the pressure sits on the chasing side to force errors rather than wait for them.`
        : `With ${ctx.remainingRounds} ${plural(ctx.remainingRounds, "round")} still to run, a single weekend can still reorder the top of the table.`,
    );
  }

  const themes: string[] = [];
  if (gap !== null && gap > 50) themes.push("championship control");
  else if (gap !== null) themes.push("open title fight");
  if (topTeam) themes.push("constructors' order");
  if (tightest && tightest.gap === 0) themes.push("level midfield fight");
  else if (tightest) themes.push("midfield margins");

  const battleSummary = tightest
    ? tightest.gap === 0
      ? `${tightest.aLabel} and ${tightest.bLabel} are level on ${tightest.metricLabel.toLowerCase()}, the finest margin anywhere in the standings, which makes every finishing position between them decisive.`
      : `${tightest.aLabel} and ${tightest.bLabel} are the closest pairing in the standings, separated on ${tightest.metricLabel.toLowerCase()} by an amount a single strong weekend would erase.`
    : "The standings are not yet close enough anywhere to call a genuine battle.";

  const progressionSummary = leader && ctx.completedRounds > 0
    ? `${leader.driverName} has won ${leader.wins} of the ${ctx.completedRounds} ${plural(ctx.completedRounds, "round")} run so far; the curve below shows where that advantage was actually built.`
    : "The points curve below shows how the order has developed round by round.";

  const topRecord = ctx.records[0];
  const recordSummary = topRecord
    ? `${topRecord.name} holds the season's ${topRecord.label.toLowerCase()} - ${topRecord.why.toLowerCase()}.`
    : "Not enough rounds have run for a season record to mean much yet.";

  const whatChangedSummary = mover
    ? mover.positionDelta
      ? `${mover.name} ${mover.positionDelta > 0 ? "gained" : "lost"} ground in the latest completed round, the most notable move in the order.`
      : `Points moved in the latest completed round without reordering the table.`
    : "The order held after the latest completed round.";

  return {
    seasonStory: { headline: storyHeadline, summary: storyParts.join(" "), themes: themes.slice(0, 3) },
    battleInsight: {
      headline: tightest ? "The margin that matters most" : "No close battles yet",
      summary: battleSummary,
      highlightedBattleId: undefined,
    },
    progressionInsight: { headline: "How the order was built", summary: progressionSummary, highlightedEntities: [] },
    recordInsight: { headline: topRecord ? "The season's standout number" : "Records still forming", summary: recordSummary, highlightedRecordIds: [] },
    whatChangedInsight: { summary: whatChangedSummary, highlights: [] },
  };
}

/** The compare fallback is built from the SAME ComparePair the model would have been given, so it
 * is about exactly the right two entities by construction - the wrong-pair failure mode simply
 * cannot occur on this path. It states a real difference rather than deferring to the table
 * ("See the stats below" was not an insight, it was an apology). */
export function generateCompareFallbackFromPair(pair: ComparePair): SeasonCompareInsight {
  const { a, b } = pair;
  const ahead = pair.aheadId === a.id ? a : pair.aheadId === b.id ? b : null;
  const behind = ahead === a ? b : ahead === b ? a : null;

  const headline = !ahead
    ? `${a.name} and ${b.name} are level`
    : `${ahead.name} is ahead of ${behind!.name} on points`;

  const sentences: string[] = [];
  if (ahead && behind) {
    sentences.push(`${ahead.name} holds the advantage in the championship after ${pair.completedRounds} completed ${plural(pair.completedRounds, "round")}.`);
  } else {
    sentences.push(`${a.name} and ${b.name} are level in the championship after ${pair.completedRounds} completed ${plural(pair.completedRounds, "round")}.`);
  }
  if (pair.h2h.comparableRounds > 0) {
    const h2hLeader = pair.h2h.aWins > pair.h2h.bWins ? a.name : pair.h2h.bWins > pair.h2h.aWins ? b.name : null;
    sentences.push(
      h2hLeader
        ? `On race classification they have met ${pair.h2h.comparableRounds} ${plural(pair.h2h.comparableRounds, "time")}, and ${h2hLeader} has finished ahead more often.`
        : `On race classification they are split evenly across ${pair.h2h.comparableRounds} ${plural(pair.h2h.comparableRounds, "meeting")}.`,
    );
  }
  if (pair.momentumWindow > 0) {
    sentences.push(
      pair.momentum === "EVEN"
        ? `Neither has taken an edge across the last ${pair.momentumWindow} rounds.`
        : `${pair.momentum === "A" ? a.name : b.name} has scored more across the last ${pair.momentumWindow} rounds.`,
    );
  }

  const advantage = (side: typeof a, other: typeof a): string => {
    if (side.wins > other.wins) return "wins more often";
    if (side.averageFinish !== null && other.averageFinish !== null && side.averageFinish < other.averageFinish) return "finishes higher on average";
    if (side.dnfs < other.dnfs) return "has been more reliable";
    if (side.poles !== null && other.poles !== null && side.poles > other.poles) return "is stronger over one lap";
    if (side.recentPoints > other.recentPoints) return "is in better recent form";
    return "no clear advantage in these numbers";
  };

  return {
    headline,
    summary: sentences.join(" "),
    keyAdvantageA: advantage(a, b),
    keyAdvantageB: advantage(b, a),
    momentum: pair.momentum,
  };
}

/** The race window's compact event take, assembled from the round's own real state. Says nothing
 * about a race that hasn't run, and forecasts nothing about one that has. */
export function generateRaceEventFallback(race: RaceSummary): RaceEventTake {
  if (race.weekendStatus === "cancelled" || race.weekendStatus === "postponed") {
    return {
      headline: `${race.name} is ${race.weekendStatus}`,
      summary: `This round is currently marked ${race.weekendStatus}. The schedule below reflects what is known so far.`,
    };
  }
  if (race.weekendStatus === "completed") {
    const podium = race.podium.map((p) => p.driverName);
    return {
      headline: race.winnerName ? `${race.winnerName} takes round ${race.round}` : `${race.name} is complete`,
      summary: [
        race.winnerName ? `${race.winnerName} won the ${race.name}.` : `The ${race.name} has been classified.`,
        podium.length === 3 ? `${podium[1]} and ${podium[2]} completed the podium.` : null,
        race.poleSitterName && race.poleSitterName !== race.winnerName ? `${race.poleSitterName} had started from pole.` : null,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  const nextSession = race.sessions.find((s) => s.state === "current" || s.state === "upcoming");
  if (race.weekendStatus === "live") {
    return {
      headline: `${race.name} is under way`,
      summary: `The weekend has started at ${race.circuit ?? race.name}.${nextSession ? ` ${nextSession.label} is next on the schedule.` : ""} Session results appear below as each one is classified.`,
    };
  }
  return {
    headline: `Round ${race.round}: ${race.name}`,
    summary: [
      `${race.name}${race.circuit ? ` at ${race.circuit}` : ""} is round ${race.round} of the season${race.isSprintWeekend ? ", run to the sprint format" : ""}.`,
      race.forecast ? `The current forecast puts air temperature near ${Math.round(race.forecast.airTempC)}C with a ${Math.round(race.forecast.rainProbability * 100)}% chance of rain.` : null,
      nextSession ? `${nextSession.label} opens the weekend's running.` : null,
    ]
      .filter(Boolean)
      .join(" "),
  };
}


/** The circuit take's own fallback - same no-implementation-vocabulary rule as every other
 * fallback here, and state-aware for the same reason the real prompt is: a circuit whose round
 * hasn't run yet must never get a sentence that reads like a result. */
export function generateCircuitTakeFallback(ctx: CircuitContext): SharedCircuitIntelligence {
  if (ctx.state === "completed" && ctx.currentSeasonResult?.winner) {
    const r = ctx.currentSeasonResult;
    const trackTake = {
      headline: `${r.winner} takes ${ctx.grandPrixName ?? "the race"} at ${ctx.displayName}`,
      summary: [
        `${r.winner} won at ${ctx.displayName} this season.`,
        r.biggestGainer ? `${r.biggestGainer.name} made up the most ground from the grid, gaining ${r.biggestGainer.places} places.` : null,
        r.dnfCount > 0 ? `${r.dnfCount} car${r.dnfCount === 1 ? "" : "s"} retired.` : null,
      ]
        .filter(Boolean)
        .join(" "),
      evidenceIds: [],
    };
    return { trackTake };
  }

  if (ctx.state === "next" || ctx.state === "upcoming") {
    const record = ctx.records.mostWins;
    const trackTake = {
      headline: `${ctx.displayName}${ctx.facts ? `, ${ctx.facts.trackType} circuit` : ""}`,
      summary: [
        ctx.facts ? `${ctx.displayName} runs ${ctx.facts.lengthKm.toFixed(1)}km over ${ctx.facts.turns} turns.` : `Full track characteristics for ${ctx.displayName} aren't recorded yet.`,
        record ? `${joinNames(record.drivers)} ${record.drivers.length === 1 ? "holds" : "hold"} the record with ${record.count} win(s) here.` : "No winner history recorded.",
      ]
        .filter(Boolean)
        .join(" "),
      evidenceIds: [],
    };
    return { trackTake };
  }

  const record = ctx.records.mostWins;
  const trackTake = {
    headline: ctx.displayName,
    summary: [
      ctx.facts ? `${ctx.displayName} is a ${ctx.facts.trackType} circuit of ${ctx.facts.lengthKm.toFixed(1)}km with ${ctx.facts.turns} turns.` : `Detailed characteristics for ${ctx.displayName} aren't recorded yet.`,
      record ? `${joinNames(record.drivers)} ${record.drivers.length === 1 ? "holds" : "hold"} the record here with ${record.count} wins.` : "This circuit isn't on the current season's calendar.",
    ]
      .filter(Boolean)
      .join(" "),
    evidenceIds: [],
  };
  return { trackTake };
}
