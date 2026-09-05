// Compact Structured Context Builder for Homepage Intelligence.
// Split into GLOBAL facts (same for every visitor: race, standings, circuit, RF, Monte Carlo,
// bounded community pulse) and PERSONAL facts (only present for an authenticated user: favorites,
// their circuit history, their own prediction + fingerprint + since-last-visit deltas). This split
// is what lets the cache layer version global and personal data independently (see cache.ts) - one
// user's prediction must never invalidate the shared global cache.

import type { SinceLastVisitDiff } from "./sinceLastVisit";

export interface HomepageContextData {
  // ── Global (identical for every visitor of this race/dataVersion) ──────────────
  race: {
    id: string;
    name: string;
    round: number;
    season: number;
    circuitName?: string;
    city?: string;
    country?: string;
  } | null;
  standings?: {
    driverLeader?: { name: string; team: string; points: number };
    driverSecond?: { name: string; team: string; points: number };
    driverThird?: { name: string; team: string; points: number };
    constructorLeader?: { name: string; points: number };
    constructorSecond?: { name: string; points: number };
  } | null;
  trackHistory?: {
    defendingWinner?: string;
    topPerformer?: string;
    totalRaces?: number;
  } | null;
  /** Random Forest finish-order prediction - a RANKING, not a probability. `topFeatureFactors` is
   * the 2-3 highest-weighted inputs from finishFeatureImportance (e.g. "grid", "recentForm"), never
   * itself a probability - see the route's own comment on the winProbability bug this replaced. */
  model?: {
    topPredictedDriver?: string;
    topFeatureFactors?: string[];
  } | null;
  /** Monte Carlo simulation - the actual calibrated probability source (RaceSimulation.drivers[].p1).
   * This is the only place a "probability" figure is allowed to come from. */
  simulation?: {
    topSimulatedDriver?: string;
    p1Probability?: number; // 0-1, calibrated
    podiumProbability?: number; // 0-1, calibrated
  } | null;
  communityPosts?: Array<{
    title?: string;
    content?: string;
    groupName?: string;
  }>;

  // ── Personal (only present for an authenticated user with real data) ───────────
  favoriteDriver?: {
    name: string;
    rank?: number;
    points?: number;
    teamName?: string;
    /** This circuit's real history for this exact driver - getDriverCircuitStats, not invented. */
    circuit?: { appearances: number; wins: number; podiums: number; bestFinish: number | null; avgFinish: number | null } | null;
  } | null;
  favoriteTeam?: {
    name: string;
    rank?: number;
    points?: number;
    circuit?: { appearances: number; wins: number; podiums: number; bestFinish: number | null } | null;
  } | null;
  userPrediction?: {
    predictedWinner?: string;
    submitted?: boolean;
  } | null;
  /** Application-computed (see computePredictionFingerprint) - Kimi interprets these numbers, it
   * never calculates them. */
  predictionFingerprint?: {
    totalPredictions: number;
    winnerAccuracy: number;
    podiumAccuracy: number;
    avgPositionError: number | null;
    avgPredictedWinnerGrid: number | null;
    pctPicksForSeasonLeader: number | null;
  } | null;
  /** Real, computed deltas since profiles.last_homepage_visit_at - see sinceLastVisit.ts. */
  sinceLastVisit?: SinceLastVisitDiff | null;
}

export function buildHomepageContext(data: HomepageContextData): string {
  const sections: string[] = [];

  // ─────────────────────────────────────────── GLOBAL, STRUCTURED, VERIFIED DATA
  sections.push("<STRUCTURED_F1_DATA>");

  if (data.race) {
    sections.push(
      `Upcoming Race: Round ${data.race.round} of ${data.race.season} - ${data.race.name} at ${data.race.circuitName || "Circuit"} (${data.race.city || ""}, ${data.race.country || ""})`,
    );
  } else {
    sections.push("Upcoming Race: In-season preparation; next race schedule pending.");
  }

  if (data.standings) {
    const s = data.standings;
    if (s.driverLeader) {
      const gap = s.driverSecond ? s.driverLeader.points - s.driverSecond.points : 0;
      sections.push(
        `Drivers Championship: P1 ${s.driverLeader.name} (${s.driverLeader.points} pts, ${s.driverLeader.team}), P2 ${s.driverSecond?.name || "TBD"} (${s.driverSecond?.points || 0} pts, gap: ${gap} pts)${s.driverThird ? `, P3 ${s.driverThird.name} (${s.driverThird.points} pts)` : ""}.`,
      );
    }
    if (s.constructorLeader) {
      sections.push(
        `Constructors Championship: P1 ${s.constructorLeader.name} (${s.constructorLeader.points} pts), P2 ${s.constructorSecond?.name || "TBD"} (${s.constructorSecond?.points || 0} pts).`,
      );
    }
  }

  if (data.trackHistory) {
    const th = data.trackHistory;
    sections.push(
      `Circuit Track History: Defending Winner: ${th.defendingWinner || "None recorded"}; Most Wins / Top Record: ${th.topPerformer || "N/A"}${th.totalRaces ? `; Total historic races: ${th.totalRaces}` : ""}.`,
    );
  }

  if (data.model) {
    sections.push(
      `Random Forest Model (ranking, not a probability): Predicts ${data.model.topPredictedDriver || "the current leader"} to finish highest${data.model.topFeatureFactors?.length ? `; the model's decision leans most on ${data.model.topFeatureFactors.join(", ")}` : ""}.`,
    );
  }

  if (data.simulation) {
    const p1Pct = data.simulation.p1Probability != null ? Math.round(data.simulation.p1Probability * 100) : null;
    const podiumPct = data.simulation.podiumProbability != null ? Math.round(data.simulation.podiumProbability * 100) : null;
    sections.push(
      `Monte Carlo Simulation (the only real probability figures available): ${data.simulation.topSimulatedDriver || "Frontrunner"} has a ${p1Pct != null ? `${p1Pct}%` : "leading"} simulated win probability${podiumPct != null ? ` and a ${podiumPct}% podium probability` : ""}.`,
    );
  }

  sections.push("</STRUCTURED_F1_DATA>");

  // ─────────────────────────────────────────── PERSONAL, USER-SCOPED CONTEXT
  const hasPersonalData = !!(data.favoriteDriver || data.favoriteTeam || data.userPrediction || data.predictionFingerprint || data.sinceLastVisit?.hasPriorVisit);
  sections.push("<PERSONAL_CONTEXT>");
  if (!hasPersonalData) {
    sections.push("No authenticated personal context available - this is a guest visitor or a signed-in user with no favorites/predictions yet.");
  } else {
    if (data.favoriteDriver) {
      const fd = data.favoriteDriver;
      sections.push(
        `User's Favorite Driver: ${fd.name}${fd.rank ? ` (P${fd.rank} in WDC` : ""}${fd.points !== undefined ? `, ${fd.points} points)` : fd.rank ? ")" : ""}${fd.teamName ? ` racing for ${fd.teamName}` : ""}.`,
      );
      if (fd.circuit) {
        sections.push(
          `User's Favorite Driver's History At This Circuit: ${fd.circuit.appearances} start(s), ${fd.circuit.wins} win(s), ${fd.circuit.podiums} podium(s)${fd.circuit.bestFinish != null ? `, best finish P${fd.circuit.bestFinish}` : ""}${fd.circuit.avgFinish != null ? `, average finish P${fd.circuit.avgFinish.toFixed(1)}` : ""}.`,
        );
      }
    }

    if (data.favoriteTeam) {
      const ft = data.favoriteTeam;
      sections.push(
        `User's Favorite Constructor: ${ft.name}${ft.rank ? ` (P${ft.rank} in WCC` : ""}${ft.points !== undefined ? `, ${ft.points} points)` : ft.rank ? ")" : ""}.`,
      );
      if (ft.circuit) {
        sections.push(
          `User's Favorite Constructor's History At This Circuit: ${ft.circuit.appearances} start(s), ${ft.circuit.wins} win(s), ${ft.circuit.podiums} podium(s)${ft.circuit.bestFinish != null ? `, best finish P${ft.circuit.bestFinish}` : ""}.`,
        );
      }
    }

    if (data.userPrediction) {
      sections.push(
        `User's Own Prediction For This Race: ${data.userPrediction.submitted ? `Submitted - predicted winner ${data.userPrediction.predictedWinner || "a driver"}` : "Not yet submitted"}.`,
      );
    }

    if (data.predictionFingerprint && data.predictionFingerprint.totalPredictions > 0) {
      const pf = data.predictionFingerprint;
      sections.push(
        `User's Prediction Fingerprint (application-calculated, real): ${pf.totalPredictions} total predictions, ${Math.round(pf.winnerAccuracy)}% winner accuracy, ${Math.round(pf.podiumAccuracy)}% podium-slot accuracy${pf.avgPositionError != null ? `, average position error ${pf.avgPositionError.toFixed(1)}` : ""}${pf.avgPredictedWinnerGrid != null ? `, average starting grid of picked winners: P${pf.avgPredictedWinnerGrid.toFixed(1)}` : ""}${pf.pctPicksForSeasonLeader != null ? `, ${Math.round(pf.pctPicksForSeasonLeader)}% of picks went to this season's eventual points leader` : ""}.`,
      );
    }

    if (data.sinceLastVisit?.hasPriorVisit) {
      if (data.sinceLastVisit.changes.length > 0) {
        sections.push("Changes Since The User's Last Visit (real, computed deltas):");
        for (const change of data.sinceLastVisit.changes) {
          sections.push(`- [${change.type}] ${change.title}: ${change.explanation}`);
        }
      } else {
        sections.push("Changes Since The User's Last Visit: nothing materially changed.");
      }
    }
  }
  sections.push("</PERSONAL_CONTEXT>");

  // Untrusted Community Context (bounded to avoid prompt injection & token bloat)
  sections.push("<UNTRUSTED_COMMUNITY_DATA>");
  if (data.communityPosts && data.communityPosts.length > 0) {
    const boundedPosts = data.communityPosts.slice(0, 10);
    for (const post of boundedPosts) {
      const title = (post.title || "").replace(/<[^>]*>?/gm, "").slice(0, 80);
      const group = (post.groupName || "General").replace(/<[^>]*>?/gm, "").slice(0, 30);
      sections.push(`- [Community: ${group}] ${title}`);
    }
  } else {
    sections.push("No community posts in the last 7 days.");
  }
  sections.push("</UNTRUSTED_COMMUNITY_DATA>");

  return sections.join("\n\n");
}
