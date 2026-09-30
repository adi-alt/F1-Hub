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
export type PredictionStatus = "open" | "locked" | "resolved";

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
  memberPreview: { id: string; name: string }[];
  isMember: boolean;
  prediction: { id: string; type: PredictionType; status: PredictionStatus; lockAt: string | null; entryCount: number; entryPoints: number } | null;
};
