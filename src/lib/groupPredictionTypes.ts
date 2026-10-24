import type { AvatarConfig } from "@/lib/avatar";
// A pure, dependency-free module - the same reason sessionCode.ts exists on its own (see that
// file's own comment). groupPredictions.ts (the real service, server-only) imports groups.ts for
// its requireMember/requireAdmin checks, which imports otp.ts for its SMTP transporter, which
// imports nodemailer - a Node-only package (`tls`/`net`) that crashes the client bundle the instant
// it's pulled in. Confirmed live: `next build` failed on exactly this chain the first time
// GroupPredictions.tsx imported `predictionTypeLabels` (a real runtime value, not an erased type)
// straight from groupPredictions.ts. Everything a client component actually needs - the types and
// this one small label map - lives here instead, imported by both sides.

export type PredictionType = "winner" | "podium" | "fastest_lap" | "pole" | "dnf_count";
/** The stored lifecycle status. "locked" is written by the scheduled lock_due_predictions() once the
 * deadline passes; enforcement never waits for it (enter_prediction compares the clock itself). */
export type PredictionStatus = "open" | "locked" | "resolved" | "void";

/** What a round IS right now, deadline included - the one thing every surface should render from,
 * instead of each re-deriving "is it closed?" from the race date (audit COM-05: four surfaces had
 * four different answers, and the server had none). */
export type PredictionState = PredictionStatus;

/** The single client-side statement of the deadline rule, mirroring enter_prediction() in
 * supabase/migrations/20260930_prediction_lifecycle.sql: a round is open only while its stored
 * status is "open" AND the deadline is known AND has not been reached. The deadline instant itself
 * is closed (`>=`). An unknown deadline (`lockAt` null) is closed - the database fails closed too.
 * Pass a ticking `nowMs` so a card flips to closed at the deadline without a refresh; the server
 * remains the authority either way. */
export function predictionStateAt(status: PredictionStatus, lockAt: string | null, nowMs: number): PredictionState {
  if (status !== "open") return status;
  if (lockAt === null) return "locked";
  const lockMs = Date.parse(lockAt);
  return Number.isNaN(lockMs) || nowMs >= lockMs ? "locked" : "open";
}

/** Milliseconds until the deadline, or null when it is unknown. Zero or negative once passed. */
export function msUntilLock(lockAt: string | null, nowMs: number): number | null {
  if (lockAt === null) return null;
  const lockMs = Date.parse(lockAt);
  return Number.isNaN(lockMs) ? null : lockMs - nowMs;
}

// winner/fastest_lap/pole guess = a driver code; podium = a 3-driver array; dnf_count = a number.
export type PredictionGuess = string | [string, string, string] | number;

export type GroupPrediction = {
  id: string;
  groupId: string;
  raceId: string;
  raceName: string;
  /** The race's own scheduled date, from `races.race_date`. Null for a calendar-only placeholder
   * round the pipeline hasn't dated yet - the card says "date TBC" rather than inventing one. */
  raceDate: string | null;
  /** 'upcoming' | 'scheduled' | 'completed', straight off the races row. Lets a prediction whose
   * race has already run be told apart from one still genuinely open. */
  raceStatus: string | null;
  type: PredictionType;
  entryPoints: number;
  status: PredictionStatus;
  /** When entries stop: the start of the weekend's main Qualifying session, from the same database
   * function that enforces it. Null when the schedule has no such session (the round is then
   * closed, not open-ended). */
  lockAt: string | null;
  /** `status` combined with `lockAt` at the moment the server built this object. */
  state: PredictionState;
  correctAnswer: PredictionGuess | null;
  createdAt: string;
  resolvedAt: string | null;
  entryCount: number;
  myEntry: { guess: PredictionGuess; pointsWagered: number; pointsAwarded: number | null } | null;
  /** What this round can do for the viewer, from predictionCardState when the server built it. */
  viewerState: PredictionCardState;
};

export const predictionTypeLabels: Record<PredictionType, string> = {
  winner: "Race winner",
  podium: "Podium",
  fastest_lap: "Fastest lap",
  pole: "Pole position",
  dnf_count: "Number of DNFs",
};

/** A real community card for the race page's own discovery section - defined here (not in
 * groupPredictions.ts) for the exact reason every other type on this page is: a client component
 * rendering this (RaceCommunitiesSection) must never import from the real service module, which
 * reaches otp.ts's nodemailer import through groups.ts and crashes the client bundle the instant
 * it's pulled in (see this file's own top comment). */
export type RaceCommunityCard = {
  groupId: string;
  name: string;
  avatarUrl: string | null;
  memberCount: number;
  memberPreview: { id: string; name: string; avatar: AvatarConfig | null }[];
  isMember: boolean;
  prediction: { id: string; type: PredictionType; status: PredictionStatus; lockAt: string | null; entryCount: number; entryPoints: number } | null;
};

/** What a prediction card can do for this viewer right now, worked out once from the round, the
 * clock and the viewer - so the feed, the community tab and the race page never disagree about
 * whether a round can take an entry, and the card can say exactly why it can't. The server computes
 * it when it builds a listing (`viewerState`); the card re-runs the same function with its ticking
 * clock, the live points balance and the race's roster. */
export type PredictionCardState =
  | "open"
  | "locked"
  /** Closed and the race has run: waiting for an admin to resolve it. */
  | "awaiting_result"
  | "resolved"
  | "void"
  | "insufficient_points"
  | "not_member"
  /** No driver line-up for the race yet (driver rounds only). */
  | "no_lineup";

export function predictionCardState(
  round: { status: PredictionStatus; lockAt: string | null; raceStatus: string | null; type: PredictionType; entryPoints: number },
  viewer: { isMember: boolean; hasEntered: boolean; pointsBalance?: number | null; driverCount?: number },
  nowMs: number,
): PredictionCardState {
  const state = predictionStateAt(round.status, round.lockAt, nowMs);
  if (state === "void" || state === "resolved") return state;
  if (state === "locked") return round.raceStatus === "completed" ? "awaiting_result" : "locked";
  if (!viewer.isMember) return "not_member";
  if (viewer.driverCount === 0 && round.type !== "dnf_count") return "no_lineup";
  // Someone who already entered paid for it; changing a pick costs nothing.
  if (!viewer.hasEntered && typeof viewer.pointsBalance === "number" && viewer.pointsBalance < round.entryPoints) return "insufficient_points";
  return "open";
}

/** One aggregated option in a prediction's community trend. `pct` is a real share of `total`,
 * rounded for display only. */
export type PredictionTrendOption = { key: string; label: string; count: number; pct: number };

export type PredictionTrend = {
  /** Real number of entries behind this aggregate. The UI decides what counts as "enough to
   * show" - this never hides or pads it. */
  total: number;
  options: PredictionTrendOption[];
};

/** How many distinct options a trend lists before the remainder is grouped into "Other". */
const TREND_TOP_N = 4;

/** The one facet of a guess a trend groups by. A podium guess is three drivers, which has no
 * single meaningful distribution - the winner pick is the part members actually compare, so that's
 * what's aggregated, and the card labels it as such rather than implying the whole podium matched. */
function trendKeyFor(type: PredictionType, guess: PredictionGuess): string | null {
  if (type === "podium") return Array.isArray(guess) && typeof guess[0] === "string" ? guess[0] : null;
  if (type === "dnf_count") return typeof guess === "number" ? String(guess) : null;
  return typeof guess === "string" ? guess : null;
}

/** Counts real entries into a trend: the top options by count (ties by key), the rest as "Other".
 * Nothing is sampled or padded - no entries is `{ total: 0, options: [] }`. */
export function aggregatePredictionTrend(type: PredictionType, guesses: readonly PredictionGuess[], driverNameByCode: ReadonlyMap<string, string>): PredictionTrend {
  const counts = new Map<string, number>();
  for (const guess of guesses) {
    const key = trendKeyFor(type, guess);
    if (key !== null) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  if (total === 0) return { total: 0, options: [] };
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const label = (key: string) => (type === "dnf_count" ? `${key} ${key === "1" ? "retirement" : "retirements"}` : (driverNameByCode.get(key) ?? key));
  const options: PredictionTrendOption[] = sorted.slice(0, TREND_TOP_N).map(([key, count]) => ({ key, label: label(key), count, pct: Math.round((count / total) * 100) }));
  const restCount = sorted.slice(TREND_TOP_N).reduce((sum, [, n]) => sum + n, 0);
  if (restCount > 0) options.push({ key: "__other__", label: "Other", count: restCount, pct: Math.round((restCount / total) * 100) });
  return { total, options };
}
