// Takes with receipts: what a post's "call" claims, when it locks, and how it is graded against the official result.
// Pure - no database, no clock (callers pass `nowMs`) - so every rule is tested on its own. Calls are graded when read,
// never stored as a verdict, so a corrected classification re-grades every call by itself.
import { fastestLapDriver } from "./communityWeekend";
import type { RaceDoc } from "./types/race";

export type CallKind = "winner" | "podium" | "pole" | "fastest_lap" | "beats_teammate" | "safety_car" | "retirements";

export const CALL_KINDS: readonly CallKind[] = ["winner", "podium", "pole", "fastest_lap", "beats_teammate", "safety_car", "retirements"];

/** A call as stored (post_calls) and sent to the browser. `driver` for the driver calls, `rival` for a head-to-head,
 * `threshold` for "at least N retirements". */
export type PostCall = { kind: CallKind; raceId: string; driver: string | null; rival: string | null; threshold: number | null; locksAt: string };

/** pending: no result yet; void: the result can't settle it (a driver didn't take part). `provisional` marks a grade
 * made on a preliminary classification, before the official one replaces it. */
export type CallVerdict = { status: "pending" | "correct" | "incorrect" | "void"; provisional: boolean };

/** Which session settles a call (and so when it locks): pole is settled by qualifying, the rest by the race. */
export function callSession(kind: CallKind): "Q" | "R" {
  return kind === "pole" ? "Q" : "R";
}

/** The call, as a sentence: "Norris wins", "Leclerc on pole", "Piastri beats Norris", "At least 3 retirements". */
export function describeCall(call: Pick<PostCall, "kind" | "driver" | "rival" | "threshold">, nameOf: (code: string) => string = (c) => c): string {
  const d = call.driver ? nameOf(call.driver) : "?";
  switch (call.kind) {
    case "winner":
      return `${d} wins`;
    case "podium":
      return `${d} on the podium`;
    case "pole":
      return `${d} on pole`;
    case "fastest_lap":
      return `${d} sets the fastest lap`;
    case "beats_teammate":
      return `${d} beats ${call.rival ? nameOf(call.rival) : "their teammate"}`;
    case "safety_car":
      return "A safety car comes out";
    case "retirements":
      return `At least ${call.threshold ?? 1} ${call.threshold === 1 ? "retirement" : "retirements"}`;
  }
}

const isCode = (v: unknown): v is string => typeof v === "string" && /^[A-Z]{3}$/.test(v);

/**
 * A call from untrusted input, checked against what the race allows: the kind is known, its drivers are on the
 * race's roster (a head-to-head needs two different ones), a threshold is 1-20. Returns the reason it's refused
 * instead of a call. Locking (now is before the session) is the caller's check, with the calendar's time.
 */
export function parseCall(input: unknown, roster: ReadonlySet<string>): { call: Omit<PostCall, "raceId" | "locksAt"> } | { error: string } {
  if (!input || typeof input !== "object") return { error: "That call isn't valid." };
  const raw = input as Record<string, unknown>;
  const kind = raw.kind as CallKind;
  if (!CALL_KINDS.includes(kind)) return { error: "That kind of call isn't supported." };
  const driver = isCode(raw.driver) ? raw.driver : null;
  const rival = isCode(raw.rival) ? raw.rival : null;
  const threshold = typeof raw.threshold === "number" && Number.isInteger(raw.threshold) && raw.threshold >= 1 && raw.threshold <= 20 ? raw.threshold : null;
  if (kind === "safety_car") return { call: { kind, driver: null, rival: null, threshold: null } };
  if (kind === "retirements") return threshold === null ? { error: "Choose how many retirements." } : { call: { kind, driver: null, rival: null, threshold } };
  if (!driver || !roster.has(driver)) return { error: "Choose a driver in this race." };
  if (kind === "beats_teammate") {
    if (!rival || !roster.has(rival) || rival === driver) return { error: "Choose two different drivers in this race." };
    return { call: { kind, driver, rival, threshold: null } };
  }
  return { call: { kind, driver, rival: null, threshold: null } };
}

/**
 * Grade a call against the race as stored. Pending until the settling session's result is in; a race call needs the
 * race classified (status completed with results); pole needs the pole sitter. A driver who isn't in the
 * classification at all voids a call about them. Safety-car and retirement calls read the race's own counts.
 */
export function gradeCall(call: PostCall, race: RaceDoc | null): CallVerdict {
  const pending: CallVerdict = { status: "pending", provisional: false };
  if (!race) return pending;
  const verdict = (right: boolean, provisional = false): CallVerdict => ({ status: right ? "correct" : "incorrect", provisional });

  if (call.kind === "pole") {
    if (!race.poleSitter) return pending;
    return verdict(race.poleSitter === call.driver);
  }

  const results = race.status === "completed" ? (race.results ?? []) : [];
  if (!results.length) return pending;
  const provisional = race.resultsSource === "openf1_preliminary";
  const row = (code: string | null) => (code ? results.find((r) => r.driver === code) : undefined);

  switch (call.kind) {
    case "winner": {
      if (!row(call.driver)) return { status: "void", provisional };
      return verdict(row(call.driver)?.finishPosition === 1, provisional);
    }
    case "podium": {
      const r = row(call.driver);
      if (!r) return { status: "void", provisional };
      return verdict(r.finishPosition <= 3, provisional);
    }
    case "fastest_lap": {
      if (!row(call.driver)) return { status: "void", provisional };
      const holder = fastestLapDriver(race);
      return holder ? verdict(holder === call.driver, provisional) : pending;
    }
    case "beats_teammate": {
      const a = row(call.driver);
      const b = row(call.rival);
      if (!a || !b) return { status: "void", provisional };
      return verdict(a.finishPosition < b.finishPosition, provisional);
    }
    case "safety_car":
      return typeof race.safetyCarPeriods === "number" ? verdict(race.safetyCarPeriods >= 1, provisional) : pending;
    case "retirements":
      return verdict(results.filter((r) => r.status === "dnf").length >= (call.threshold ?? 1), provisional);
  }
}

/** A member's record from their graded calls: right, settled (right or wrong; pending and void don't count). */
export function callRecord(verdicts: readonly CallVerdict[]): { correct: number; settled: number } {
  let correct = 0;
  let settled = 0;
  for (const v of verdicts) {
    if (v.status === "correct" || v.status === "incorrect") settled++;
    if (v.status === "correct") correct++;
  }
  return { correct, settled };
}

/** A hit rate only once there's a record to speak of: below this many settled calls, show the count, not a percentage. */
export const MIN_SETTLED_FOR_RATE = 3;
