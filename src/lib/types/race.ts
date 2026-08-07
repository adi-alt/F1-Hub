export type FinishStatus = "finished" | "lapped" | "dnf";

export type RaceResultEntry = {
  driver: string; // 3-letter code, e.g. "VER"
  driverName: string;
  team: string;
  grid: number;
  qualiPosition: number;
  qualifyingGapSec: number;
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
  qualifyingGapSec: number;
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

export type RaceStatus = "upcoming" | "completed";

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

export type RaceDoc = {
  id: string; // `${year}_${slug}`
  year: number;
  round: number;
  slug: string;
  circuit: string; // stable per-track key, = slug
  name: string;
  status: RaceStatus;
  dateStart?: string;
  dateEnd?: string;
  results?: RaceResultEntry[];
  poleSitter?: string;
  poleTimeSec?: number;
  inputs?: RaceInputEntry[];
  prediction?: RacePrediction;
  polePrediction?: PolePrediction;
  sourceUrl: string;
  updatedAt: string;
  // Populated by a separate FastF1-based pipeline (Python, GitHub Action) — not the Node scraper.
  // Both optional and only ever partial-merged onto this doc, never part of a full `saveRace`.
  weather?: SessionWeather;
  tireStints?: TireStint[];
  fastF1UpdatedAt?: string;
};

export type UserPick = {
  raceId: string;
  predictedWinner: string;
  predictedPodium: [string, string, string];
  submittedAt: string;
};
