// Race-weekend mode (roadmap R-64): which module leads the race page and the home hero. Pure and
// dependency-free beyond sessionCode/countdown, so a client component can import it.
//
//   pre-quali  → countdown + your pick
//   post-quali → the grid + the model's call
//   live       → the live state of the session running now
//   post-race  → your points, the community average, the model
import { liveSession, sessionCode } from "./sessionCode";
import { parseUtcDateTime } from "./countdown";

export type RaceWeekendPhase = "pre-quali" | "post-quali" | "live" | "post-race";

export type PhaseRace = {
  status: string;
  results?: readonly unknown[] | null;
  poleSitter?: string | null;
  inputs?: readonly { grid?: number | null }[] | null;
};

export type PhaseSession = { label: string; date: string };

export type RaceWeekendState = {
  phase: RaceWeekendPhase;
  /** The session running now, only in the live phase. */
  liveSession: PhaseSession | null;
};

// Sessions that change what the lead module shows when they are running. Practice doesn't: the
// pick is still the thing to do during FP1.
const LIVE_CODES = new Set(["Q", "SQ", "SR", "R"]);
const QUALI_MS = 75 * 60_000;

/** Whether this weekend's qualifying is over: the grid is in the race's inputs, a pole sitter is
 * stored, or the qualifying session started longer ago than a qualifying session lasts. */
function qualifyingDone(race: PhaseRace, sessions: readonly PhaseSession[], nowMs: number): boolean {
  if (race.poleSitter) return true;
  if (race.inputs?.some((i) => typeof i.grid === "number" && i.grid > 0)) return true;
  const quali = sessions.find((s) => sessionCode(s.label) === "Q");
  return quali ? nowMs - parseUtcDateTime(quali.date).getTime() >= QUALI_MS : false;
}

export function raceWeekendPhase(race: PhaseRace, sessions: readonly PhaseSession[], nowMs: number): RaceWeekendState {
  if (race.status === "completed" || (race.results?.length ?? 0) > 0) return { phase: "post-race", liveSession: null };
  const live = liveSession([...sessions], nowMs);
  if (live && LIVE_CODES.has(sessionCode(live.label))) return { phase: "live", liveSession: live };
  return { phase: qualifyingDone(race, sessions, nowMs) ? "post-quali" : "pre-quali", liveSession: null };
}
