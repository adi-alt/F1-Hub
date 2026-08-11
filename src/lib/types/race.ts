export type FinishStatus = "finished" | "lapped" | "dnf";

export type RaceResultEntry = {
  driver: string; // 3-letter code, e.g. "VER"
  driverName: string;
  team: string;
  grid: number | null; // starting grid position (post-penalty)
  finishPosition: number;
  finishGapSec: number | null;
  status: FinishStatus;
  fastestLapSec: number | null;
  points: number;
};

export type RaceInputEntry = {
  driver: string;
  driverName: string;
  team: string;
  grid: number;
  qualifyingGapSec: number | null;
};

export type PredictedOrderEntry = {
  driver: string;
  team: string;
  predictedPosition: number;
  predictedScore: number;
  spread: number | null;
};

export type PredictedPoleEntry = {
  driver: string;
  team: string;
  predictedQualiPosition: number;
  predictedScore: number;
};

export type BacktestRow = { round: number; positionMAE: number; gridBaselineMAE: number };

/**
 * Needs this race's own qualifying data (grid + quali gap) as input, so it can only exist once
 * that's published. Locked in once computed — never recomputed once inputs exist.
 */
export type RacePrediction = {
  generatedAt: string; // ISO timestamp
  modelVersion: string;
  finishOrder: PredictedOrderEntry[];
  finishFeatureImportance: Record<string, number>;
  // Gap to that race's (unknown) fastest lap, not an absolute lap time — see predictPace.ts.
  predictedPaceGapSec: Record<string, number>;
  backtest: BacktestRow[];
};

/**
 * Uses only prior-season driver/team form — no same-weekend grid/quali data — so it's available
 * well before that race's own qualifying happens. Recomputed on every refresh while the race is
 * still pre-qualifying (gets better as more of the season completes), then frozen the moment
 * qualifying data appears for that race, becoming the permanent "what we predicted" record.
 */
export type PolePrediction = {
  generatedAt: string;
  modelVersion: string;
  order: PredictedPoleEntry[];
  featureImportance: Record<string, number>;
};

export type SimulatedDriverEntry = {
  driver: string;
  team: string;
  medianPosition: number;
  positionProbabilities: number[]; // index 0 = P1, raw (uncalibrated) — the full distribution
  p1: number; // calibrated
  podium: number; // calibrated
  top5: number; // raw — no calibrator exists for this target yet
};

/**
 * Monte Carlo race simulation (grid + pace-model output + DNF probability, sampled with
 * correlated race/team/individual noise — see pipeline/ml/simulate_race.py). Same freeze timing
 * as `prediction`: needs this race's own qualifying data, computed once, never recomputed.
 */
export type RaceSimulation = {
  generatedAt: string;
  modelVersion: string;
  drivers: SimulatedDriverEntry[];
};

// "scheduled" = on the calendar (pipeline/sync_calendar.py) but no FastF1 session data exists yet
// for this round — the far side of the season, not this weekend. Distinct from "upcoming", which
// means at least qualifying/practice data already exists (pipeline/fetch_races.py has a doc for
// it), just not the race result yet.
export type RaceStatus = "upcoming" | "completed" | "scheduled";

/** Race-session summary, not a time series — mean readings plus whether it rained at all. */
export type SessionWeather = {
  airTempC: number;
  trackTempC: number;
  humidityPct: number;
  rainfall: boolean;
};

export type TireStint = {
  driver: string;
  stintNumber: number;
  compound: string;
  lapCount: number;
};

/**
 * The shape every page/component actually consumes — an adapted view over the raw FastF1-native
 * Firestore document (see FirestoreRaceDoc in lib/firestore/races.ts), not a direct mirror of it.
 * Field names deliberately match what this app has always called them (`name`, `circuit`, `grid`,
 * `results`), even though the raw document calls them `eventName`/`location`/`gridPosition`/
 * `race.results` — the adapter in races.ts is the one place that translation happens, so this
 * type (and everything that reads it) doesn't need to know the raw pipeline's schema at all.
 */
export type RaceDoc = {
  id: string; // `${year}_r${round}_${event-slug}`
  year: number;
  round: number;
  name: string; // FastF1's eventName, e.g. "Hungarian Grand Prix"
  circuit: string; // FastF1's location, e.g. "Budapest" — stable per physical track across years
  status: RaceStatus;
  updatedAt: string;
  results?: RaceResultEntry[];
  poleSitter?: string;
  poleTimeSec?: number;
  inputs?: RaceInputEntry[];
  prediction?: RacePrediction; // not yet populated — Phase 1
  polePrediction?: PolePrediction; // not yet populated — Phase 1
  simulation?: RaceSimulation;
  weather?: SessionWeather;
  tireStints?: TireStint[];
  raceDate?: string; // ISO — only reliably present for `scheduled` placeholders, see toCalendarPlaceholder
};

export type UserPick = {
  raceId: string;
  predictedWinner: string;
  predictedPodium: [string, string, string];
  submittedAt: string;
};
