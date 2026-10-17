// Communities' race-weekend mode, the pure half: which weekend the section is living in, which session a post was
// written during, each session's result as a top three, and what the Apex model picked for a round. No clock or
// database here (callers pass `nowMs` and data), so every rule is tested on its own.
import { parseUtcDateTime } from "./countdown";
import { formatLapTime } from "./format";
import type { PredictionGuess, PredictionType } from "./groupPredictionTypes";
import type { QualifyingStageRow } from "./supabase/races";
import type { RaceDoc } from "./types/race";
import { SESSION_LABELS, SESSION_RUN_MINUTES, sessionKeyOf, type SessionKey } from "./weekendSessions";

export type { SessionKey } from "./weekendSessions";

/** A weekend session as the section uses it: when it starts, how long it runs, and whether its results are stored. */
export type CommunitySession = { key: SessionKey; label: string; startsAt: string; runMinutes: number; hasData: boolean };

export type CalendarLike = { year: number; round: number; name: string | null; status: string | null; sessions: { label: string; date: string }[] };

/** How long before the first session the weekend "opens" for the section, and how long after the race it stays. */
export const BUILD_UP_HOURS = 72;
export const AFTERMATH_HOURS = 36;

const startMs = (iso: string) => parseUtcDateTime(iso).getTime();
const endMs = (s: Pick<CommunitySession, "startsAt" | "runMinutes">) => startMs(s.startsAt) + s.runMinutes * 60_000;

/** A calendar entry's sessions in weekend order, keyed, de-duplicated, without the ones the site doesn't show. */
export function sessionsOf(entry: CalendarLike, hasData: Partial<Record<SessionKey, boolean>> = {}): CommunitySession[] {
  const out: CommunitySession[] = [];
  for (const s of entry.sessions ?? []) {
    const key = s.date ? sessionKeyOf(s.label) : null;
    if (!key || out.some((o) => o.key === key) || Number.isNaN(startMs(s.date))) continue;
    out.push({ key, label: SESSION_LABELS[key], startsAt: s.date, runMinutes: SESSION_RUN_MINUTES[key], hasData: !!hasData[key] });
  }
  return out.sort((a, b) => startMs(a.startsAt) - startMs(b.startsAt));
}

/**
 * The weekend Communities is living in at `nowMs`: the round whose window (from BUILD_UP_HOURS before its first
 * session to AFTERMATH_HOURS after its race ends) contains now, else the next round still to come. Cancelled and
 * postponed rounds never count. Null when the season has nothing left.
 */
export function pickWeekend<T extends CalendarLike>(entries: readonly T[], nowMs: number): T | null {
  let next: { entry: T; first: number } | null = null;
  for (const e of entries) {
    if (!e.name || e.status === "cancelled" || e.status === "postponed") continue;
    const sessions = sessionsOf(e);
    if (!sessions.length) continue;
    const first = startMs(sessions[0].startsAt);
    const last = endMs(sessions[sessions.length - 1]);
    if (nowMs >= first - BUILD_UP_HOURS * 3_600_000 && nowMs <= last + AFTERMATH_HOURS * 3_600_000) return e;
    if (first > nowMs && (!next || first < next.first)) next = { entry: e, first };
  }
  return next?.entry ?? null;
}

/** Where a moment sits in the weekend: during a session ("live"), after one and before the next ("after"), before the
 * first ("build-up"), or outside the weekend's window altogether (null). */
export type SessionPhase = { phase: "live" | "after"; key: SessionKey; label: string } | { phase: "build-up" } | null;

export function sessionPhaseAt(sessions: readonly CommunitySession[], atMs: number): SessionPhase {
  if (!sessions.length || Number.isNaN(atMs)) return null;
  const first = startMs(sessions[0].startsAt);
  const last = endMs(sessions[sessions.length - 1]);
  if (atMs < first - BUILD_UP_HOURS * 3_600_000 || atMs > last + AFTERMATH_HOURS * 3_600_000) return null;
  if (atMs < first) return { phase: "build-up" };
  let latest: CommunitySession | null = null;
  for (const s of sessions) {
    if (atMs >= startMs(s.startsAt) && atMs < endMs(s)) return { phase: "live", key: s.key, label: s.label };
    if (atMs >= endMs(s)) latest = s;
  }
  return latest ? { phase: "after", key: latest.key, label: latest.label } : { phase: "build-up" };
}

/** The session running at `nowMs`, if any. */
export function liveSession(sessions: readonly CommunitySession[], nowMs: number): CommunitySession | null {
  return sessions.find((s) => nowMs >= startMs(s.startsAt) && nowMs < endMs(s)) ?? null;
}

/** When a session is over (its start plus its usual running time): where its result sits in the feed. */
export function sessionEndsAt(s: Pick<CommunitySession, "startsAt" | "runMinutes">): number {
  return endMs(s);
}

/** One line of a session's result. `detail` is the lap time (practice, qualifying), or the gap or status (races). */
export type ResultLine = { position: number; code: string; name: string; team: string; detail: string | null };

const lap = formatLapTime;
const gap = (sec: number | null) => (sec === null ? null : `+${sec.toFixed(3)}s`);

/**
 * The top three of each session whose data is stored: practice by best lap, (sprint) qualifying by classified
 * position, the sprint and the race by finishing position. Names and teams come from the session's own rows where
 * it has them (qualifying, races), else from `roster` (practice stores codes only).
 */
export function sessionResults(race: RaceDoc | null, stages: readonly QualifyingStageRow[], roster: ReadonlyMap<string, { name: string; team: string }>, limit = 3): Partial<Record<SessionKey, ResultLine[]>> {
  if (!race) return {};
  const who = (code: string, name?: string, team?: string) => ({ code, name: name ?? roster.get(code)?.name ?? code, team: team ?? roster.get(code)?.team ?? "" });
  const out: Partial<Record<SessionKey, ResultLine[]>> = {};
  for (const key of ["FP1", "FP2", "FP3"] as const) {
    const laps = race.practice?.[key]?.bestLaps;
    if (!laps?.length) continue;
    out[key] = [...laps]
      .sort((a, b) => a.lapTimeSec - b.lapTimeSec)
      .slice(0, limit)
      .map((l, i) => ({ position: i + 1, ...who(l.driver), detail: i === 0 ? lap(l.lapTimeSec) : gap(l.deltaToBestSec) }));
  }
  for (const key of ["SQ", "Q"] as const) {
    const rows = stages.filter((r) => r.session === key && r.position !== null).sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
    if (rows.length) {
      out[key] = rows.slice(0, limit).map((r) => {
        const best = r.stages[r.stageReached - 1];
        return { position: r.position as number, ...who(r.driver, r.driverName, r.team), detail: best === null ? null : lap(best) };
      });
    } else if (key === "Q" && race.poleSitter) {
      out.Q = [{ position: 1, ...who(race.poleSitter), detail: race.poleTimeSec ? lap(race.poleTimeSec) : null }];
    }
  }
  const finish = (rows: { driver: string; driverName: string; team: string; finishPosition: number; finishGapSec: number | null; status: string }[] | undefined) =>
    rows?.length
      ? [...rows]
          .sort((a, b) => a.finishPosition - b.finishPosition)
          .slice(0, limit)
          .map((r) => ({ position: r.finishPosition, ...who(r.driver, r.driverName, r.team), detail: r.finishPosition === 1 ? null : r.status === "finished" ? gap(r.finishGapSec) : r.status === "lapped" ? "Lapped" : "DNF" }))
      : null;
  const sprint = finish(race.sprintResults);
  if (sprint) out.S = sprint;
  if (race.status === "completed") {
    const grandPrix = finish(race.results);
    if (grandPrix) out.R = grandPrix;
  }
  return out;
}

/** The race's fastest lap holder, from the classified results. */
export function fastestLapDriver(race: RaceDoc | null): string | null {
  const laps = (race?.results ?? []).filter((r) => typeof r.fastestLapSec === "number" && r.fastestLapSec > 0);
  if (!laps.length) return null;
  return laps.reduce((best, r) => ((r.fastestLapSec as number) < (best.fastestLapSec as number) ? r : best)).driver;
}

/** What the Apex model picked for a round: a driver and, where the model gives one, its chance (0-1). */
export type ModelPick = { driver: string; chance: number | null; source: "pole-model" | "simulation" | "race-model" };

/**
 * The Apex model's pick for a round type, from what the pipeline stored for the race: the pole model (before
 * qualifying) for pole; the race model's predicted winner (after qualifying) for the winner and a podium's winner
 * slot, else the race simulation's favourite where only that exists; the driver with the smallest predicted pace
 * gap for the fastest lap. No model covers retirements, so a retirements round has no pick.
 *
 * The race model comes first because it has called the winner far more often this season than the simulation's
 * favourite, whose win chances are nearly flat across the grid (its favourite rarely above 7%).
 */
export function modelPickFor(type: PredictionType, race: RaceDoc | null): ModelPick | null {
  if (!race) return null;
  if (type === "pole") {
    const top = [...(race.polePrediction?.order ?? [])].sort((a, b) => a.predictedQualiPosition - b.predictedQualiPosition)[0];
    return top ? { driver: top.driver, chance: null, source: "pole-model" } : null;
  }
  if (type === "winner" || type === "podium") {
    const order = [...(race.prediction?.finishOrder ?? [])].sort((a, b) => a.predictedPosition - b.predictedPosition)[0];
    if (order) return { driver: order.driver, chance: null, source: "race-model" };
    const sim = [...(race.simulation?.drivers ?? [])].sort((a, b) => b.p1 - a.p1)[0];
    return sim ? { driver: sim.driver, chance: sim.p1, source: "simulation" } : null;
  }
  if (type === "fastest_lap") {
    const gaps = Object.entries(race.prediction?.predictedPaceGapSec ?? {}).filter(([, g]) => typeof g === "number");
    if (!gaps.length) return null;
    const [driver] = gaps.reduce((best, cur) => (cur[1] < best[1] ? cur : best));
    return { driver, chance: null, source: "race-model" };
  }
  return null;
}

/** The one driver a round's answer (or a guess) names for the crowd-vs-model comparison: the driver for single-driver
 * rounds, the winner slot for a podium (what the crowd's trend is built from, too). Null for retirements. */
export function comparableDriver(type: PredictionType, guess: PredictionGuess | null): string | null {
  if (guess === null) return null;
  if (type === "podium") return Array.isArray(guess) && typeof guess[0] === "string" ? guess[0] : null;
  if (type === "winner" || type === "pole" || type === "fastest_lap") return typeof guess === "string" ? guess : null;
  return null;
}

/** One settled round's crowd-vs-model outcome, for the season record. */
export type CrowdModelRound = { groupId: string; crowd: string | null; model: string | null; answer: string | null };

/** A season record: how many settled rounds the crowd and the model each called right, over the rounds where both
 * had a pick and the answer is known. */
export function crowdModelRecord(rounds: readonly CrowdModelRound[]): { crowd: number; model: number; rounds: number } {
  let crowd = 0;
  let model = 0;
  let counted = 0;
  for (const r of rounds) {
    if (!r.crowd || !r.model || !r.answer) continue;
    counted++;
    if (r.crowd === r.answer) crowd++;
    if (r.model === r.answer) model++;
  }
  return { crowd, model, rounds: counted };
}
