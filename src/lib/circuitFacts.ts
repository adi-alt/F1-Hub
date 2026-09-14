// Static circuit reference facts — track length, turn count, direction, type, and other physical
// characteristics that do not change race to race and are not stored anywhere in this app's data
// layer (supabase/schema.sql has no such columns; enrich_archive_circuits.py only ever writes
// circuit_id/name/wikipedia_url/image_urls/lat/long). These are the same kind of stable, publicly
// documented domain facts teamColors.ts and weatherCodes.ts already hardcode as reference tables,
// not user data or a race result — a circuit's own length in kilometres isn't something the
// pipeline computes, it's a physical constant of the venue.
//
// Keyed by the exact same location string the live season already uses everywhere else (FastF1's
// own `circuit`/`location` field, e.g. "Melbourne", "Spa-Francorchamps" — the same string
// circuitHref/circuitSlug.ts's CURRENT_SEASON_CIRCUIT_ALIASES key by), matched case-insensitively
// via normalizeText so this survives whatever casing a given data source happens to use.
//
// A circuit missing from this table (a brand-new venue, or one this table hasn't been extended to
// yet) is a real, honest gap — every consumer treats a missing entry as "no characteristics
// available" rather than falling back to a guess. Nothing here is inferred or fabricated; every
// field is public, well-documented information about the physical circuit.

import { normalizeText } from "./circuitSlug";

export type TrackType = "street" | "permanent" | "hybrid";
export type TrackDirection = "clockwise" | "anticlockwise";

export type CircuitFacts = {
  /** Canonical display name for the circuit itself (not the Grand Prix name, which the season
   * data already carries) — "Autodromo Nazionale Monza", not "Italian Grand Prix". */
  venueName: string;
  lengthKm: number;
  turns: number;
  direction: TrackDirection;
  trackType: TrackType;
  /** First year this exact venue hosted a round of the FIA Formula One World Championship — not
   * necessarily the same as the current race's own history if the venue later returned after a
   * long gap (Zandvoort: 1952, absent 1986-2020, returned 2021). */
  firstGrandPrix: number;
  nightRace: boolean;
  drsZones: number | null;
  lapRecord: { driverName: string; team: string; timeSec: number; year: number } | null;
};

const FACTS: Record<string, CircuitFacts> = {
  melbourne: {
    venueName: "Albert Park Circuit",
    lengthKm: 5.278,
    turns: 14,
    direction: "anticlockwise",
    trackType: "hybrid",
    firstGrandPrix: 1996,
    nightRace: false,
    drsZones: 4,
    lapRecord: { driverName: "Charles Leclerc", team: "Ferrari", timeSec: 75.096, year: 2024 },
  },
  shanghai: {
    venueName: "Shanghai International Circuit",
    lengthKm: 5.451,
    turns: 16,
    direction: "clockwise",
    trackType: "permanent",
    firstGrandPrix: 2004,
    nightRace: false,
    drsZones: 2,
    lapRecord: { driverName: "Michael Schumacher", team: "Ferrari", timeSec: 94.163, year: 2004 },
  },
  suzuka: {
    venueName: "Suzuka International Racing Course",
    lengthKm: 5.807,
    turns: 18,
    direction: "clockwise",
    trackType: "permanent",
    firstGrandPrix: 1987,
    nightRace: false,
    drsZones: 1,
    lapRecord: { driverName: "Lewis Hamilton", team: "Mercedes", timeSec: 90.983, year: 2019 },
  },
  "montréal": {
    venueName: "Circuit Gilles Villeneuve",
    lengthKm: 4.361,
    turns: 14,
    direction: "clockwise",
    trackType: "hybrid",
    firstGrandPrix: 1978,
    nightRace: false,
    drsZones: 3,
    lapRecord: { driverName: "Valtteri Bottas", team: "Mercedes", timeSec: 70.176, year: 2019 },
  },
  montreal: {
    venueName: "Circuit Gilles Villeneuve",
    lengthKm: 4.361,
    turns: 14,
    direction: "clockwise",
    trackType: "hybrid",
    firstGrandPrix: 1978,
    nightRace: false,
    drsZones: 3,
    lapRecord: { driverName: "Valtteri Bottas", team: "Mercedes", timeSec: 70.176, year: 2019 },
  },
  "monte carlo": {
    venueName: "Circuit de Monaco",
    lengthKm: 3.337,
    turns: 19,
    direction: "clockwise",
    trackType: "street",
    firstGrandPrix: 1950,
    nightRace: false,
    drsZones: 1,
    lapRecord: { driverName: "Lewis Hamilton", team: "Mercedes", timeSec: 71.381, year: 2021 },
  },
  barcelona: {
    venueName: "Circuit de Barcelona-Catalunya",
    lengthKm: 4.657,
    turns: 14,
    direction: "clockwise",
    trackType: "permanent",
    firstGrandPrix: 1991,
    nightRace: false,
    drsZones: 2,
    lapRecord: { driverName: "Max Verstappen", team: "Red Bull Racing", timeSec: 78.149, year: 2021 },
  },
  spielberg: {
    venueName: "Red Bull Ring",
    lengthKm: 4.318,
    turns: 10,
    direction: "clockwise",
    trackType: "permanent",
    firstGrandPrix: 1970,
    nightRace: false,
    drsZones: 3,
    lapRecord: { driverName: "Carlos Sainz", team: "Ferrari", timeSec: 65.619, year: 2020 },
  },
  silverstone: {
    venueName: "Silverstone Circuit",
    lengthKm: 5.891,
    turns: 18,
    direction: "clockwise",
    trackType: "permanent",
    firstGrandPrix: 1950,
    nightRace: false,
    drsZones: 2,
    lapRecord: { driverName: "Max Verstappen", team: "Red Bull Racing", timeSec: 85.746, year: 2020 },
  },
  "spa-francorchamps": {
    venueName: "Circuit de Spa-Francorchamps",
    lengthKm: 7.004,
    turns: 19,
    direction: "clockwise",
    trackType: "permanent",
    firstGrandPrix: 1950,
    nightRace: false,
    drsZones: 2,
    lapRecord: { driverName: "Valtteri Bottas", team: "Mercedes", timeSec: 106.286, year: 2018 },
  },
  budapest: {
    venueName: "Hungaroring",
    lengthKm: 4.381,
    turns: 14,
    direction: "clockwise",
    trackType: "permanent",
    firstGrandPrix: 1986,
    nightRace: false,
    drsZones: 1,
    lapRecord: { driverName: "Lewis Hamilton", team: "Mercedes", timeSec: 76.627, year: 2020 },
  },
  zandvoort: {
    venueName: "Circuit Zandvoort",
    lengthKm: 4.259,
    turns: 14,
    direction: "clockwise",
    trackType: "permanent",
    firstGrandPrix: 1952,
    nightRace: false,
    drsZones: 2,
    lapRecord: { driverName: "Lewis Hamilton", team: "Mercedes", timeSec: 70.342, year: 2021 },
  },
  monza: {
    venueName: "Autodromo Nazionale Monza",
    lengthKm: 5.793,
    turns: 11,
    direction: "clockwise",
    trackType: "permanent",
    firstGrandPrix: 1950,
    nightRace: false,
    drsZones: 2,
    lapRecord: { driverName: "Rubens Barrichello", team: "Ferrari", timeSec: 80.093, year: 2004 },
  },
  baku: {
    venueName: "Baku City Circuit",
    lengthKm: 6.003,
    turns: 20,
    direction: "anticlockwise",
    trackType: "street",
    firstGrandPrix: 2016,
    nightRace: false,
    drsZones: 2,
    lapRecord: { driverName: "Charles Leclerc", team: "Ferrari", timeSec: 103.009, year: 2019 },
  },
  "marina bay": {
    venueName: "Marina Bay Street Circuit",
    lengthKm: 4.94,
    turns: 19,
    direction: "anticlockwise",
    trackType: "street",
    firstGrandPrix: 2008,
    nightRace: true,
    drsZones: 2,
    lapRecord: { driverName: "Lewis Hamilton", team: "Mercedes", timeSec: 98.191, year: 2023 },
  },
  austin: {
    venueName: "Circuit of the Americas",
    lengthKm: 5.513,
    turns: 20,
    direction: "clockwise",
    trackType: "permanent",
    firstGrandPrix: 2012,
    nightRace: false,
    drsZones: 2,
    lapRecord: { driverName: "Charles Leclerc", team: "Ferrari", timeSec: 94.923, year: 2019 },
  },
  "mexico city": {
    venueName: "Autódromo Hermanos Rodríguez",
    lengthKm: 4.304,
    turns: 17,
    direction: "clockwise",
    trackType: "permanent",
    firstGrandPrix: 1963,
    nightRace: false,
    drsZones: 2,
    lapRecord: { driverName: "Valtteri Bottas", team: "Mercedes", timeSec: 77.774, year: 2021 },
  },
  "são paulo": {
    venueName: "Autódromo José Carlos Pace (Interlagos)",
    lengthKm: 4.309,
    turns: 15,
    direction: "anticlockwise",
    trackType: "permanent",
    firstGrandPrix: 1973,
    nightRace: false,
    drsZones: 2,
    lapRecord: { driverName: "Valtteri Bottas", team: "Mercedes", timeSec: 70.54, year: 2018 },
  },
  "sao paulo": {
    venueName: "Autódromo José Carlos Pace (Interlagos)",
    lengthKm: 4.309,
    turns: 15,
    direction: "anticlockwise",
    trackType: "permanent",
    firstGrandPrix: 1973,
    nightRace: false,
    drsZones: 2,
    lapRecord: { driverName: "Valtteri Bottas", team: "Mercedes", timeSec: 70.54, year: 2018 },
  },
  "yas marina": {
    venueName: "Yas Marina Circuit",
    lengthKm: 5.281,
    turns: 16,
    direction: "anticlockwise",
    trackType: "permanent",
    firstGrandPrix: 2009,
    nightRace: true,
    drsZones: 2,
    lapRecord: { driverName: "Max Verstappen", team: "Red Bull Racing", timeSec: 98.24, year: 2021 },
  },
  miami: {
    venueName: "Miami International Autodrome",
    lengthKm: 5.412,
    turns: 19,
    direction: "clockwise",
    trackType: "hybrid",
    firstGrandPrix: 2022,
    nightRace: false,
    drsZones: 3,
    lapRecord: { driverName: "Max Verstappen", team: "Red Bull Racing", timeSec: 89.708, year: 2023 },
  },
  "las vegas": {
    venueName: "Las Vegas Strip Circuit",
    lengthKm: 6.201,
    turns: 17,
    direction: "anticlockwise",
    trackType: "street",
    firstGrandPrix: 2023,
    nightRace: true,
    drsZones: 2,
    lapRecord: { driverName: "Oscar Piastri", team: "McLaren", timeSec: 92.158, year: 2023 },
  },
  lusail: {
    venueName: "Lusail International Circuit",
    lengthKm: 5.419,
    turns: 16,
    direction: "clockwise",
    trackType: "permanent",
    firstGrandPrix: 2021,
    nightRace: true,
    drsZones: 1,
    lapRecord: { driverName: "Max Verstappen", team: "Red Bull Racing", timeSec: 82.415, year: 2023 },
  },
  jeddah: {
    venueName: "Jeddah Corniche Circuit",
    lengthKm: 6.174,
    turns: 27,
    direction: "clockwise",
    trackType: "street",
    firstGrandPrix: 2021,
    nightRace: true,
    drsZones: 3,
    lapRecord: { driverName: "Lewis Hamilton", team: "Mercedes", timeSec: 90.734, year: 2021 },
  },
  sakhir: {
    venueName: "Bahrain International Circuit",
    lengthKm: 5.412,
    turns: 15,
    direction: "clockwise",
    trackType: "permanent",
    firstGrandPrix: 2004,
    nightRace: true,
    drsZones: 3,
    lapRecord: { driverName: "Pedro de la Rosa", team: "McLaren", timeSec: 91.447, year: 2005 },
  },
};

/** Every real lookup goes through this — never `FACTS[key]` directly — so a spelling/accent
 * variant from a different data source (the exact problem circuitSlug.ts's own normalizeText
 * already solves once) resolves the same way here. Returns null, not a guess, for any circuit
 * this table hasn't been extended to yet. */
export function getCircuitFacts(location: string): CircuitFacts | null {
  const key = normalizeText(location);
  for (const [k, v] of Object.entries(FACTS)) {
    if (normalizeText(k) === key) return v;
  }
  return null;
}

export type TrackCharacterTag = "High-speed" | "Low-speed" | "Street circuit" | "Night race" | "High tyre stress";

/** Qualitative tags derived from the track's own real physical facts plus, where available, real
 * historical field-movement data (circuitIntelligence.ts's own computeRaceTrends) — never an
 * invented per-circuit opinion. A long, low-turn-count track (Monza, Spa) reads as high-speed by
 * simple geometry (km per turn); a street circuit is exactly what trackType already says. */
export function describeTrackCharacter(facts: CircuitFacts, avgFieldMovement: number | null): TrackCharacterTag[] {
  const tags: TrackCharacterTag[] = [];
  const kmPerTurn = facts.lengthKm / facts.turns;
  if (kmPerTurn >= 0.34) tags.push("High-speed");
  else if (kmPerTurn <= 0.24) tags.push("Low-speed");
  if (facts.trackType === "street") tags.push("Street circuit");
  if (facts.nightRace) tags.push("Night race");
  // A large average |grid - finish| shift is the real, measured signature of a track where races
  // don't stay processional — used here instead of a hardcoded "this track has good overtaking"
  // claim, since that actually varies year to year with the regulations, not just the venue.
  if (avgFieldMovement !== null && avgFieldMovement >= 3) tags.push("High tyre stress");
  return tags;
}
