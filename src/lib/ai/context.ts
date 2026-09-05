// Compact Structured Context Builder for Homepage Intelligence.
// Pre-computes and aggregates deterministic F1 numbers and historical data
// into bounded tags (<STRUCTURED_F1_DATA> and <UNTRUSTED_COMMUNITY_DATA>).

export interface HomepageContextData {
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
    favoriteDriverBestFinish?: number | null;
    favoriteDriverAvgFinish?: number | null;
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
    winProbability?: number;
    featureDrivers?: string[];
  } | null;
  simulation?: {
    topSimulatedDriver?: string;
    p1Probability?: number;
  } | null;
  userPrediction?: {
    predictedWinner?: string;
    submitted?: boolean;
  } | null;
  predictionPerformance?: {
    winnerAccuracy?: number;
    podiumAccuracy?: number;
    avgPositionError?: number;
    totalPredictions?: number;
  } | null;
  communityPosts?: Array<{
    title?: string;
    content?: string;
    groupName?: string;
  }>;
}

export function buildHomepageContext(data: HomepageContextData): string {
  const sections: string[] = [];

  // Structured Verified Data
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
    if (th.favoriteDriverBestFinish !== undefined && th.favoriteDriverBestFinish !== null) {
      sections.push(
        `User Favorite Driver Circuit Record: Best finish P${th.favoriteDriverBestFinish}${th.favoriteDriverAvgFinish ? `, Avg finish P${th.favoriteDriverAvgFinish.toFixed(1)}` : ""}.`,
      );
    }
  }

  if (data.favoriteDriver) {
    sections.push(
      `User Favorite Driver: ${data.favoriteDriver.name}${data.favoriteDriver.rank ? ` (P${data.favoriteDriver.rank} in WDC)` : ""}${data.favoriteDriver.points !== undefined ? ` with ${data.favoriteDriver.points} points` : ""}.`,
    );
  }

  if (data.favoriteTeam) {
    sections.push(
      `User Favorite Constructor: ${data.favoriteTeam.name}${data.favoriteTeam.rank ? ` (P${data.favoriteTeam.rank} in WCC)` : ""}${data.favoriteTeam.points !== undefined ? ` with ${data.favoriteTeam.points} points` : ""}.`,
    );
  }

  if (data.model) {
    const probPct = data.model.winProbability ? Math.round(data.model.winProbability * 100) : null;
    sections.push(
      `Machine Learning Random Forest Model: Favors ${data.model.topPredictedDriver || "Leader"}${probPct ? ` with ${probPct}% estimated win probability` : ""}.`,
    );
  }

  if (data.simulation) {
    const simPct = data.simulation.p1Probability ? Math.round(data.simulation.p1Probability * 100) : null;
    sections.push(
      `Monte Carlo Simulation: Top simulated outcome is ${data.simulation.topSimulatedDriver || "Frontrunner"}${simPct ? ` with ${simPct}% P1 simulation rate` : ""}.`,
    );
  }

  if (data.userPrediction) {
    sections.push(
      `User Weekend Prediction: ${data.userPrediction.submitted ? `Submitted - Predicted Winner: ${data.userPrediction.predictedWinner || "Driver"}` : "Not yet submitted for this race"}.`,
    );
  }

  if (data.predictionPerformance && (data.predictionPerformance.totalPredictions || 0) > 0) {
    const pp = data.predictionPerformance;
    sections.push(
      `User Prediction History: ${pp.totalPredictions} total predictions, Winner Accuracy: ${Math.round(pp.winnerAccuracy || 0)}%, Podium Accuracy: ${Math.round(pp.podiumAccuracy || 0)}%, Avg Pos Error: ${(pp.avgPositionError || 0).toFixed(1)}.`,
    );
  }

  sections.push("</STRUCTURED_F1_DATA>");

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
