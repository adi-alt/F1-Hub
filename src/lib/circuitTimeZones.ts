// Each circuit's own IANA time zone, keyed by the same location string the live season uses everywhere (FastF1's
// `circuit`/location, matched through normalizeText like circuitFacts.ts), so a session can be shown in track time
// next to the reader's own (audit R-54). Zones, not fixed offsets: Intl applies each place's daylight-saving rules
// for the session's own date. A venue missing here shows the reader's time only - never a guessed zone.

import { normalizeText } from "./circuitSlug";
import { parseUtcDateTime } from "./countdown";

const ZONES: Record<string, string> = {
  melbourne: "Australia/Melbourne",
  shanghai: "Asia/Shanghai",
  suzuka: "Asia/Tokyo",
  sakhir: "Asia/Bahrain",
  jeddah: "Asia/Riyadh",
  miami: "America/New_York",
  "miami gardens": "America/New_York",
  imola: "Europe/Rome",
  "monte carlo": "Europe/Monaco",
  monaco: "Europe/Monaco",
  barcelona: "Europe/Madrid",
  "montmelo": "Europe/Madrid",
  madrid: "Europe/Madrid",
  montreal: "America/Toronto",
  spielberg: "Europe/Vienna",
  silverstone: "Europe/London",
  "spa-francorchamps": "Europe/Brussels",
  budapest: "Europe/Budapest",
  zandvoort: "Europe/Amsterdam",
  monza: "Europe/Rome",
  baku: "Asia/Baku",
  "marina bay": "Asia/Singapore",
  singapore: "Asia/Singapore",
  austin: "America/Chicago",
  "mexico city": "America/Mexico_City",
  "sao paulo": "America/Sao_Paulo",
  "las vegas": "America/Los_Angeles",
  lusail: "Asia/Qatar",
  "yas marina": "Asia/Dubai",
  "yas island": "Asia/Dubai",
  "abu dhabi": "Asia/Dubai",
};

/** The circuit's IANA zone, or null for a venue this table doesn't know. */
export function circuitTimeZone(location: string | null | undefined): string | null {
  if (!location) return null;
  return ZONES[normalizeText(location)] ?? null;
}

/** A pipeline session time (naive UTC) as track-local wall-clock time: "Sun 15:00 GMT+2". Pinned to en-GB and a
 * 23-hour clock so the server and every browser print the same string; null for an unknown venue or bad date. */
export function formatTrackTime(iso: string, location: string | null | undefined): string | null {
  const timeZone = circuitTimeZone(location);
  if (!timeZone) return null;
  const date = parseUtcDateTime(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" }).format(date).replace(",", "");
}
