// A race weekend's sessions, from its own calendar - a standard weekend (FP1, FP2, FP3, Qualifying, Grand Prix) and
// a sprint weekend (FP1, Sprint Qualifying, Sprint, Qualifying, Grand Prix) alike, and any other format the calendar
// lists. Pure apart from weekendSessionsFor, which reads the clock: the race page builds its session selector from it.
import type { QualifyingStageRow } from "./supabase/races";
import type { RaceDoc } from "./types/race";

export type SessionKey = "FP1" | "FP2" | "FP3" | "SQ" | "S" | "Q" | "R";

/** A session's state from its data first, the clock second: "completed" means its results are in, not that its
 * start time has passed. A session that has run but whose data isn't in yet is "awaiting", never "missing". */
export type SessionState = "upcoming" | "live" | "awaiting" | "completed";

export type WeekendSession = { key: SessionKey; label: string; startsAt: string | null; state: SessionState };

const LABELS: Record<SessionKey, string> = { FP1: "Practice 1", FP2: "Practice 2", FP3: "Practice 3", SQ: "Sprint Qualifying", S: "Sprint", Q: "Qualifying", R: "Grand Prix" };

/** Roughly how long each session runs - only to tell "live" from "over, results awaited" before any data arrives. */
const RUNS_MINUTES: Record<SessionKey, number> = { FP1: 60, FP2: 60, FP3: 60, SQ: 45, S: 45, Q: 60, R: 150 };

/** The calendar's session label -> a session key, or null for one this page doesn't show. */
export function sessionKeyOf(label: string): SessionKey | null {
  const l = label.toLowerCase().trim();
  if (/^(practice|free practice|fp)\s*1$/.test(l)) return "FP1";
  if (/^(practice|free practice|fp)\s*2$/.test(l)) return "FP2";
  if (/^(practice|free practice|fp)\s*3$/.test(l)) return "FP3";
  if (l === "sprint qualifying" || l === "sprint shootout") return "SQ";
  if (l === "sprint" || l === "sprint race") return "S";
  if (l === "qualifying") return "Q";
  if (l === "race" || l === "grand prix") return "R";
  return null;
}

/** The weekend's sessions in order, each with its state. `hasData` says which sessions' results are stored. */
export function buildWeekendSessions(calendar: { label: string; date: string }[], hasData: Partial<Record<SessionKey, boolean>>, nowMs: number): WeekendSession[] {
  const out: WeekendSession[] = [];
  for (const s of calendar) {
    const key = sessionKeyOf(s.label);
    if (!key || out.some((o) => o.key === key)) continue;
    const start = s.date ? Date.parse(s.date.endsWith("Z") || /[+-]\d\d:\d\d$/.test(s.date) ? s.date : `${s.date}Z`) : NaN;
    const state: SessionState = hasData[key]
      ? "completed"
      : Number.isNaN(start) || nowMs < start
        ? "upcoming"
        : nowMs < start + RUNS_MINUTES[key] * 60_000
          ? "live"
          : "awaiting";
    out.push({ key, label: LABELS[key], startsAt: s.date || null, state });
  }
  // A session with data but missing from the calendar (an old round) still gets a tab, in weekend order.
  for (const key of ["FP1", "FP2", "FP3", "SQ", "S", "Q", "R"] as SessionKey[]) {
    if (hasData[key] && !out.some((o) => o.key === key)) out.push({ key, label: LABELS[key], startsAt: null, state: "completed" });
  }
  const order: SessionKey[] = ["FP1", "FP2", "FP3", "SQ", "S", "Q", "R"];
  return out.sort((a, b) => (a.startsAt && b.startsAt ? Date.parse(a.startsAt) - Date.parse(b.startsAt) : order.indexOf(a.key) - order.indexOf(b.key)));
}

/** The session the page opens on: the most recent one with results (after qualifying: qualifying; after the
 * sprint: the sprint; after the Grand Prix: the Grand Prix), or, before any, the next session to come. */
export function defaultSession(sessions: WeekendSession[]): SessionKey | null {
  const done = sessions.filter((s) => s.state === "completed");
  if (done.length) return done[done.length - 1].key;
  return (sessions.find((s) => s.state === "live") ?? sessions.find((s) => s.state === "upcoming") ?? sessions[0])?.key ?? null;
}

/** The race page's sessions, now: which have results stored decides "completed". */
export function weekendSessionsFor(calendar: { label: string; date: string }[], race: RaceDoc, stages: QualifyingStageRow[], nowMs = Date.now()): WeekendSession[] {
  return buildWeekendSessions(
    calendar,
    {
      FP1: !!race.practice?.FP1,
      FP2: !!race.practice?.FP2,
      FP3: !!race.practice?.FP3,
      SQ: stages.some((r) => r.session === "SQ"),
      S: !!race.sprintResults?.length,
      Q: stages.some((r) => r.session === "Q") || !!race.inputs?.length,
      R: race.status === "completed" && !!race.results?.length,
    },
    nowMs,
  );
}
