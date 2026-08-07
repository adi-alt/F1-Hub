import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import type { RaceDoc } from "@/lib/types/race";

const COLLECTION = "races";
// Data only changes when the refresh pipeline runs (cron, at most every few hours) — cache reads
// for a few minutes rather than hitting Firestore on every request. This lives at the data layer
// (not route-level revalidate) because query-param routes read searchParams, which Next always
// treats as dynamic — caching here is what keeps those pages fast regardless.
const REVALIDATE_SECONDS = 300;

export function raceId(year: number, slug: string): string {
  return `${year}_${slug}`;
}

export async function saveRace(race: RaceDoc): Promise<void> {
  await adminDb.collection(COLLECTION).doc(race.id).set(race);
}

export const getRace = unstable_cache(
  async (year: number, slug: string): Promise<RaceDoc | null> => {
    const snap = await adminDb.collection(COLLECTION).doc(raceId(year, slug)).get();
    return snap.exists ? (snap.data() as RaceDoc) : null;
  },
  ["get-race"],
  { revalidate: REVALIDATE_SECONDS },
);

/** A season's races in calendar order. Needs the (year, round) composite index. */
export const getRacesByYear = unstable_cache(
  async (year: number): Promise<RaceDoc[]> => {
    const snap = await adminDb.collection(COLLECTION).where("year", "==", year).orderBy("round").get();
    return snap.docs.map((d) => d.data() as RaceDoc);
  },
  ["get-races-by-year"],
  { revalidate: REVALIDATE_SECONDS },
);

/** A circuit's full history across seasons, oldest first. Needs the (circuit, year) index. */
export const getRacesByCircuit = unstable_cache(
  async (circuit: string): Promise<RaceDoc[]> => {
    const snap = await adminDb.collection(COLLECTION).where("circuit", "==", circuit).orderBy("year").get();
    return snap.docs.map((d) => d.data() as RaceDoc);
  },
  ["get-races-by-circuit"],
  { revalidate: REVALIDATE_SECONDS },
);

/** The next race on the calendar that isn't marked completed yet, for the home page's hero card. */
export const getNextUpcomingRace = unstable_cache(
  async (year: number): Promise<RaceDoc | null> => {
    const snap = await adminDb
      .collection(COLLECTION)
      .where("year", "==", year)
      .where("status", "==", "upcoming")
      .orderBy("round")
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0].data() as RaceDoc);
  },
  ["get-next-upcoming-race"],
  { revalidate: REVALIDATE_SECONDS },
);
