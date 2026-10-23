import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIcs, escapeIcsText, foldIcsLine } from "../ics";

const now = new Date("2026-10-23T10:00:00.000Z");
const entry = {
  id: "2026_r20_mexico",
  name: "Mexico City Grand Prix",
  circuit: "Mexico City",
  status: "upcoming" as const,
  sessions: [
    { label: "Practice 1", date: "2026-10-30T18:30:00" },
    { label: "Qualifying", date: "2026-10-31T21:00:00" },
    { label: "Race", date: "2026-11-01T20:00:00" },
    { label: "Broken", date: "not a date" },
  ],
};

test("one UTC event per dated session, with stable UIDs and CRLF line endings", () => {
  const ics = buildIcs([entry], { calendarName: "Apex F1 Hub: Mexico City Grand Prix", now, url: "https://www.apexf1hub.com/race?year=2026&round=20" });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 3);
  assert.match(ics, /UID:2026_r20_mexico-qualifying@apexf1hub\.com/);
  assert.match(ics, /DTSTART:20261031T210000Z\r\nDTEND:20261031T220000Z/);
  assert.match(ics, /DTSTART:20261101T200000Z\r\nDTEND:20261101T220000Z/);
  assert.match(ics, /DTSTAMP:20261023T100000Z/);
  assert.match(ics, /SUMMARY:F1 Mexico City Grand Prix: Race/);
  assert.match(ics, /Track time zone: America\/Mexico_City/);
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
});

test("a cancelled round is left out", () => {
  const ics = buildIcs([{ ...entry, status: "cancelled" }], { calendarName: "x", now });
  assert.equal(ics.match(/BEGIN:VEVENT/g), null);
});

test("text escaping and line folding", () => {
  assert.equal(escapeIcsText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
  const folded = foldIcsLine(`SUMMARY:${"é".repeat(60)}`);
  for (const part of folded.split("\r\n")) assert.ok(new TextEncoder().encode(part).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), `SUMMARY:${"é".repeat(60)}`);
});
