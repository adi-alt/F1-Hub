import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import type {
  FinishStatus,
  PolePrediction,
  RaceDoc,
  RaceInputEntry,
  RacePrediction,
  RaceResultEntry,
  RaceSimulation,
  SessionWeather,
  TireStint,
} from "@/lib/types/race";

const COLLECTION = "races";
// Data only changes when the pipeline runs (GitHub Actions, every few hours) — cache reads for a
// few minutes rather than hitting Firestore on every request. This lives at the data layer (not
// route-level revalidate) because query-param routes read searchParams, which Next always treats
// as dynamic — caching here is what keeps those pages fast regardless.
const REVALIDATE_SECONDS = 300;

// The document exactly as pipeline/fetch_races.py writes it — see that file for the source of
// truth. Nothing here is optional-chained defensively; if this shape drifts from the pipeline,
// that's a real bug to see at the type level, not paper over.
type FirestoreQualifyingEntry = {
  driver: string;
  driverName: string;
  team: string;
  gridPosition: number;
  qualifyingGapSec: number | null;
};

type FirestoreResultEntry = {
  driver: string;
  driverName: string;
  team: string;
  gridPosition: number | null;
  finishPosition: number;
  status: FinishStatus;
  points: number;
  finishGapSec: number | null;
  fastestLapSec: number | null;
};

type FirestoreRaceDoc = {
  year: number;
  round: number;
  status: "completed" | "upcoming";
  fetchedAt: string;
  eventName: string;
  location: string;
  country: string;
  qualifying: { session: "Q"; grid: FirestoreQualifyingEntry[]; poleTimeSec: number | null } | null;
  race: {
    session: "R";
    results: FirestoreResultEntry[];
    weather: SessionWeather;
    tireStints: TireStint[];
  } | null;
  // Written by pipeline/train_predict.py — a separate pass from the one that writes everything
  // else above, via partial update, so it's optional here independent of `status`/`qualifying`.
  prediction?: RacePrediction;
  polePrediction?: PolePrediction;
  simulation?: RaceSimulation;
};

// pipeline/sync_calendar.py's schema — the full season schedule, published the moment FastF1
// knows it (long before any session runs), independent of whether `races` has a doc for this
// round yet. Used only to fill in rounds `races` doesn't have yet, never to override one it does.
type FirestoreCalendarDoc = {
  year: number;
  round: number;
  eventName: string;
  location: string;
  raceDate: string | null;
};

/**
 * The one place the raw FastF1-native document gets translated into the shape every page/
 * component actually uses. Keeping this translation here — rather than letting each component
 * read `race.race.results` / `race.qualifying.grid` directly — means the pipeline's schema can
 * keep evolving (new session types, new fields) without touching every consumer.
 */
function toRaceDoc(id: string, raw: FirestoreRaceDoc): RaceDoc {
  const inputs: RaceInputEntry[] | undefined = raw.qualifying?.grid.map((g) => ({
    driver: g.driver,
    driverName: g.driverName,
    team: g.team,
    grid: g.gridPosition,
    qualifyingGapSec: g.qualifyingGapSec,
  }));

  const results: RaceResultEntry[] | undefined = raw.race?.results.map((r) => ({
    driver: r.driver,
    driverName: r.driverName,
    team: r.team,
    grid: r.gridPosition,
    finishPosition: r.finishPosition,
    finishGapSec: r.finishGapSec,
    status: r.status,
    fastestLapSec: r.fastestLapSec,
    points: r.points,
  }));

  return {
    id,
    year: raw.year,
    round: raw.round,
    name: raw.eventName,
    circuit: raw.location,
    status: raw.status,
    updatedAt: raw.fetchedAt,
    results,
    poleSitter: raw.qualifying?.grid.find((g) => g.gridPosition === 1)?.driver,
    poleTimeSec: raw.qualifying?.poleTimeSec ?? undefined,
    inputs,
    weather: raw.race?.weather,
    tireStints: raw.race?.tireStints,
    prediction: raw.prediction,
    polePrediction: raw.polePrediction,
    simulation: raw.simulation,
  };
}

/** A minimal, non-clickable stand-in for a round `races` has no doc for yet — there's nothing to
 * show but the name and date, since no session has run. */
function toCalendarPlaceholder(id: string, raw: FirestoreCalendarDoc): RaceDoc {
  return {
    id,
    year: raw.year,
    round: raw.round,
    name: raw.eventName,
    circuit: raw.location,
    status: "scheduled",
    updatedAt: raw.raceDate ?? "",
    raceDate: raw.raceDate ?? undefined,
  };
}

/** Fills in any round `races` has no doc for yet with a `calendar` placeholder, so a season's
 * back half isn't simply invisible before its first session runs. `races` entries always win —
 * `calendar` is a fallback, never an override. */
async function withCalendarPlaceholders(year: number, races: RaceDoc[]): Promise<RaceDoc[]> {
  const knownRounds = new Set(races.map((r) => r.round));
  // No `.orderBy("round")` here on purpose — that would need a (year, round) composite index this
  // collection doesn't have (unlike `races`), and the merge below sorts the combined list anyway.
  const calendarSnap = await adminDb.collection("calendar").where("year", "==", year).get();
  const placeholders = calendarSnap.docs
    .filter((d) => !knownRounds.has((d.data() as FirestoreCalendarDoc).round))
    .map((d) => toCalendarPlaceholder(d.id, d.data() as FirestoreCalendarDoc));
  return [...races, ...placeholders].sort((a, b) => a.round - b.round);
}

/** A single race by (year, round) — round, not a slug, is the stable key a URL can carry. */
export const getRace = unstable_cache(
  async (year: number, round: number): Promise<RaceDoc | null> => {
    const snap = await adminDb
      .collection(COLLECTION)
      .where("year", "==", year)
      .where("round", "==", round)
      .limit(1)
      .get();
    return snap.empty ? null : toRaceDoc(snap.docs[0].id, snap.docs[0].data() as FirestoreRaceDoc);
  },
  ["get-race"],
  { revalidate: REVALIDATE_SECONDS },
);

/** A season's races in calendar order, including rounds `races` has no doc for yet (see
 * `withCalendarPlaceholders`) — otherwise the back half of an in-progress season is invisible.
 * Needs the (year, round) composite index. */
export const getRacesByYear = unstable_cache(
  async (year: number): Promise<RaceDoc[]> => {
    const snap = await adminDb.collection(COLLECTION).where("year", "==", year).orderBy("round").get();
    const races = snap.docs.map((d) => toRaceDoc(d.id, d.data() as FirestoreRaceDoc));
    return withCalendarPlaceholders(year, races);
  },
  ["get-races-by-year"],
  { revalidate: REVALIDATE_SECONDS },
);

/**
 * A circuit's full history across seasons, oldest first. Queries FastF1's `location` field
 * (e.g. "Budapest") rather than a derived slug — event names can and do change across eras for
 * the same physical track (e.g. "Brazilian Grand Prix" -> "São Paulo Grand Prix"), but the city
 * hosting it doesn't. Needs the (location, year) composite index.
 */
export const getRacesByCircuit = unstable_cache(
  async (circuit: string): Promise<RaceDoc[]> => {
    const snap = await adminDb.collection(COLLECTION).where("location", "==", circuit).orderBy("year").get();
    return snap.docs.map((d) => toRaceDoc(d.id, d.data() as FirestoreRaceDoc));
  },
  ["get-races-by-circuit"],
  { revalidate: REVALIDATE_SECONDS },
);

/** The next race on the calendar that isn't marked completed yet, for the home page's hero card —
 * built on the same merged (`races` + `calendar` placeholder) list `getRacesByYear` returns, so
 * this doesn't go blank just because the immediate next round hasn't had a session yet. */
export const getNextUpcomingRace = unstable_cache(
  async (year: number): Promise<RaceDoc | null> => {
    const races = await getRacesByYear(year);
    return races.find((r) => r.status !== "completed") ?? null;
  },
  ["get-next-upcoming-race"],
  { revalidate: REVALIDATE_SECONDS },
);

/** The current grid — driver/team pairs from the most recent race with real results or a real
 * qualifying-based grid, so this never needs a hardcoded roster that goes stale the moment a
 * seat changes. Shared by the personalization page and the signup form. */
export async function getCurrentEntrants(year: number): Promise<{ driver: string; driverName: string; team: string }[]> {
  const races = await getRacesByYear(year);
  const withEntrants = [...races].reverse().find((r) => (r.results?.length ?? 0) > 0 || (r.inputs?.length ?? 0) > 0);
  if (!withEntrants) return [];
  return withEntrants.results?.length
    ? withEntrants.results.map((r) => ({ driver: r.driver, driverName: r.driverName, team: r.team }))
    : (withEntrants.inputs ?? []).map((i) => ({ driver: i.driver, driverName: i.driverName, team: i.team }));
}
