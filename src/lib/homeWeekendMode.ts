// The home hero's race-weekend mode (R-64). The home follows the NEXT race, which moves on the moment
// a race is classified; for a few days after a race the hero stays on that race's outcome (your
// points, the community's, the model's) before the next weekend takes over.
import { parseUtcDateTime } from "./countdown";
import { raceWeekendPhase, type PhaseRace, type PhaseSession, type RaceWeekendState } from "./raceWeekendPhase";
import { sessionCode } from "./sessionCode";

export const POST_RACE_WINDOW_MS = 72 * 3_600_000;

export type HomeWeekendMode = (RaceWeekendState & { race: "next" }) | { phase: "post-race"; liveSession: null; race: "last" };

export function homeWeekendMode(params: {
  next: { race: PhaseRace; sessions: readonly PhaseSession[] } | null;
  /** The latest completed race, with its sessions (for when it was run). */
  last: { sessions: readonly PhaseSession[] } | null;
  nowMs: number;
}): HomeWeekendMode | null {
  const raceStart = params.last?.sessions.find((s) => sessionCode(s.label) === "R");
  if (raceStart) {
    const since = params.nowMs - parseUtcDateTime(raceStart.date).getTime();
    if (since >= 0 && since < POST_RACE_WINDOW_MS) return { phase: "post-race", liveSession: null, race: "last" };
  }
  if (!params.next) return null;
  return { ...raceWeekendPhase(params.next.race, params.next.sessions, params.nowMs), race: "next" };
}
