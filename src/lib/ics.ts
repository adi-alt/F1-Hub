// iCalendar (RFC 5545) export of race-weekend sessions from calendar.sessions (audit R-54): one event per session,
// times in UTC (each calendar app shows them in its owner's zone), a stable UID per session so re-importing or a
// subscribed refresh updates an event instead of duplicating it.

import { parseUtcDateTime } from "./countdown";
import { circuitTimeZone } from "./circuitTimeZones";
import type { CalendarEntry } from "./supabase/calendar";

/** How long each kind of session is blocked out for. Practice and qualifying are an hour; the races longer. */
function durationMinutes(label: string): number {
  const l = label.toLowerCase();
  if (l.includes("sprint") && !l.includes("qualifying") && !l.includes("shootout")) return 60;
  if (l === "race" || l.includes("grand prix")) return 120;
  return 60;
}

/** RFC 5545 TEXT escaping: backslash, semicolon, comma and newlines. */
export function escapeIcsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets are folded: CRLF then a space (RFC 5545 3.1). */
export function foldIcsLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with the folding space
    if (size + n > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** An .ics document for one or more race weekends. `now` is DTSTAMP. Sessions without a valid date are skipped. */
export function buildIcs(entries: Pick<CalendarEntry, "id" | "name" | "circuit" | "sessions" | "status">[], opts: { calendarName: string; now: Date; url?: string }): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Apex F1 Hub//Race calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeIcsText(opts.calendarName)}`];
  for (const entry of entries) {
    if (entry.status === "cancelled") continue;
    for (const session of entry.sessions) {
      const start = parseUtcDateTime(session.date);
      if (Number.isNaN(start.getTime())) continue;
      const end = new Date(start.getTime() + durationMinutes(session.label) * 60_000);
      const zone = circuitTimeZone(entry.circuit);
      const description = [zone ? `Track time zone: ${zone}.` : null, opts.url ? `Apex F1 Hub: ${opts.url}` : null].filter(Boolean).join(" ");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${entry.id}-${session.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@apexf1hub.com`,
        `DTSTAMP:${stamp(opts.now)}`,
        `DTSTART:${stamp(start)}`,
        `DTEND:${stamp(end)}`,
        `SUMMARY:${escapeIcsText(`F1 ${entry.name ?? "Grand Prix"}: ${session.label}`)}`,
        ...(entry.circuit ? [`LOCATION:${escapeIcsText(entry.circuit)}`] : []),
        ...(description ? [`DESCRIPTION:${escapeIcsText(description)}`] : []),
        ...(opts.url ? [`URL:${opts.url}`] : []),
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
