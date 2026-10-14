// The header's status item ("Japanese GP · Qualifying in 2d 4h", or "Live · Qualifying"): the F1 version of a menu
// bar's clock. The root layout picks the next few sessions from the calendar; the header works out, once a minute,
// which one to show. Pure, so both halves are tested without a clock.
import { formatCountdown, parseUtcDateTime } from "./countdown";
import { SESSION_LABELS, SESSION_RUN_MINUTES, sessionKeyOf } from "./weekendSessions";

export type HeaderSession = { year: number; round: number; race: string; label: string; startsAt: string; runMinutes: number };

export type HeaderStatus = { kind: "live" | "next"; session: HeaderSession; countdown: string } | null;

type CalendarLike = { year: number; round: number; name: string | null; status: string | null; sessions: { label: string; date: string }[] };

/** The sessions still to start or still running at `nowMs`, in order, at most `limit` of them: enough for the
 * header to move on by itself through a weekend without a new page load. Cancelled or postponed rounds and
 * sessions the site doesn't show (a test session, say) are left out. */
export function upcomingSessions(entries: readonly CalendarLike[], nowMs: number, limit = 6): HeaderSession[] {
  const out: HeaderSession[] = [];
  for (const e of entries) {
    if (!e.name || e.status === "cancelled" || e.status === "postponed") continue;
    for (const s of e.sessions ?? []) {
      const key = s.date ? sessionKeyOf(s.label) : null;
      if (!key) continue;
      const start = parseUtcDateTime(s.date).getTime();
      if (Number.isNaN(start) || start + SESSION_RUN_MINUTES[key] * 60_000 <= nowMs) continue;
      out.push({ year: e.year, round: e.round, race: e.name, label: SESSION_LABELS[key], startsAt: s.date, runMinutes: SESSION_RUN_MINUTES[key] });
    }
  }
  return out.sort((a, b) => parseUtcDateTime(a.startsAt).getTime() - parseUtcDateTime(b.startsAt).getTime()).slice(0, limit);
}

/** What the header says at `nowMs`: the session running now, else the next one with a countdown; null with none. */
export function headerStatus(sessions: readonly HeaderSession[], nowMs: number): HeaderStatus {
  for (const s of sessions) {
    const start = parseUtcDateTime(s.startsAt).getTime();
    if (nowMs >= start + s.runMinutes * 60_000) continue;
    if (nowMs >= start) return { kind: "live", session: s, countdown: "" };
    return { kind: "next", session: s, countdown: formatCountdown(start, nowMs) };
  }
  return null;
}

/** "Japanese Grand Prix" -> "Japanese GP": the header has room for a short name only. */
export function shortRaceName(name: string): string {
  return name.replace(/\s*Grand Prix$/i, " GP").trim();
}
