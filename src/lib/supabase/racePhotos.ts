import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { isPublishable, nextFreeRank, type RacePhoto, type RacePhotoCandidate } from "@/lib/racePhotos";

/** Cache tag for approved photos: expired by approval changes and by the pipeline's weekly re-check. */
export const RACE_PHOTOS_TAG = "race-photos";

type PhotoRow = {
  id: number;
  race_id: string;
  image_url: string;
  thumbnail_url: string;
  source_url: string;
  photographer: string;
  license: string;
  license_url: string;
  alt_text: string;
  width: number;
  height: number;
};
type ApprovedRow = PhotoRow & { rank: number };
type CandidateRow = PhotoRow & {
  provider_id: string;
  taken_on: string | null;
  subject: RacePhotoCandidate["subject"];
  score: number;
  group_key: string;
  status: RacePhotoCandidate["status"];
};

const PHOTO_COLUMNS = "id, race_id, image_url, thumbnail_url, source_url, photographer, license, license_url, alt_text, width, height";

function toPhoto(r: PhotoRow) {
  return {
    id: r.id,
    raceId: r.race_id,
    imageUrl: r.image_url,
    thumbnailUrl: r.thumbnail_url,
    sourceUrl: r.source_url,
    photographer: r.photographer,
    license: r.license,
    licenseUrl: r.license_url,
    altText: r.alt_text,
    width: r.width,
    height: r.height,
  };
}

/** The race's approved photos, in rank order; empty when none were approved (the page then shows no section). */
export const getApprovedRacePhotos = unstable_cache(
  async (raceId: string): Promise<RacePhoto[]> => {
    const { data, error } = await queryWithRetry(() =>
      supabaseAdmin.from("race_photos").select(`${PHOTO_COLUMNS}, rank`).eq("race_id", raceId).order("rank"),
    );
    if (error) throw new Error(`getApprovedRacePhotos(${raceId}): ${error.message}`);
    return ((data ?? []) as ApprovedRow[]).map((r) => ({ ...toPhoto(r), rank: r.rank })).filter(isPublishable);
  },
  ["race-photos"],
  { revalidate: false, tags: [RACE_PHOTOS_TAG] },
);

// ------------------------------------------------------------------------------------- admin (uncached)

export type ReviewRace = { id: string; name: string; year: number; pending: number; approved: number };

/** Races that have candidates, newest first, with how many wait for review and how many are approved. */
export async function listReviewRaces(): Promise<ReviewRace[]> {
  const [{ data: cands, error: e1 }, { data: approved, error: e2 }] = await Promise.all([
    supabaseAdmin.from("race_photo_candidates").select("race_id, status"),
    supabaseAdmin.from("race_photos").select("race_id"),
  ]);
  if (e1 || e2) throw new Error(`listReviewRaces: ${(e1 ?? e2)!.message}`);
  const ids = [...new Set((cands ?? []).map((c) => c.race_id as string))];
  if (ids.length === 0) return [];
  const { data: races, error } = await supabaseAdmin.from("races").select("id, name, year, race_date").in("id", ids).order("race_date", { ascending: false });
  if (error) throw new Error(`listReviewRaces races: ${error.message}`);
  return (races ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    year: r.year as number,
    pending: (cands ?? []).filter((c) => c.race_id === r.id && c.status === "pending").length,
    approved: (approved ?? []).filter((a) => a.race_id === r.id).length,
  }));
}

export async function getReview(raceId: string): Promise<{ candidates: RacePhotoCandidate[]; approved: RacePhoto[] }> {
  const [{ data: cands, error: e1 }, { data: approved, error: e2 }] = await Promise.all([
    supabaseAdmin
      .from("race_photo_candidates")
      .select(`${PHOTO_COLUMNS}, provider_id, taken_on, subject, score, group_key, status`)
      .eq("race_id", raceId)
      .order("score", { ascending: false }),
    supabaseAdmin.from("race_photos").select(`${PHOTO_COLUMNS}, rank`).eq("race_id", raceId).order("rank"),
  ]);
  if (e1 || e2) throw new Error(`getReview(${raceId}): ${(e1 ?? e2)!.message}`);
  return {
    candidates: ((cands ?? []) as CandidateRow[]).map((r) => ({
      ...toPhoto(r),
      providerId: r.provider_id,
      takenOn: r.taken_on,
      subject: r.subject,
      score: r.score,
      groupKey: r.group_key,
      status: r.status,
    })),
    approved: ((approved ?? []) as ApprovedRow[]).map((r) => ({ ...toPhoto(r), rank: r.rank })),
  };
}

export class ReviewError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Copies a candidate into race_photos at the lowest free rank. The database caps a race at four and re-checks
 * the licence and credit; a race already holding four is refused with a message, not an error page. */
export async function approveCandidate(candidateId: number, adminUid: string): Promise<string> {
  const { data: c, error } = await supabaseAdmin
    .from("race_photo_candidates")
    .select("id, race_id, provider_id, image_url, thumbnail_url, source_url, photographer, license, license_url, alt_text, width, height, status")
    .eq("id", candidateId)
    .maybeSingle();
  if (error) throw new Error(`approveCandidate: ${error.message}`);
  if (!c) throw new ReviewError("That candidate no longer exists.", 404);
  const { data: taken, error: e2 } = await supabaseAdmin.from("race_photos").select("rank, provider_id").eq("race_id", c.race_id);
  if (e2) throw new Error(`approveCandidate ranks: ${e2.message}`);
  if ((taken ?? []).some((t) => t.provider_id === c.provider_id)) throw new ReviewError("This photo is already approved.", 409);
  const rank = nextFreeRank((taken ?? []).map((t) => t.rank as number));
  if (rank === null) throw new ReviewError("This race already has four photos. Remove one first.", 409);
  const { error: insertError } = await supabaseAdmin.from("race_photos").insert({
    race_id: c.race_id,
    candidate_id: c.id,
    provider: "wikimedia",
    provider_id: c.provider_id,
    image_url: c.image_url,
    thumbnail_url: c.thumbnail_url,
    source_url: c.source_url,
    photographer: c.photographer,
    license: c.license,
    license_url: c.license_url,
    alt_text: c.alt_text,
    width: c.width,
    height: c.height,
    rank,
    approved_by: adminUid,
  });
  // 23505: a concurrent approval took the same rank or photo; 23514: a check constraint refused it.
  if (insertError) {
    if (insertError.code === "23505") throw new ReviewError("Someone else just changed this race's photos. Reload and try again.", 409);
    if (insertError.code === "23514") throw new ReviewError("The database refused this photo's licence or credit.", 422);
    throw new Error(`approveCandidate insert: ${insertError.message}`);
  }
  await setCandidateStatus(c.id, "approved", adminUid);
  return c.race_id as string;
}

export async function rejectCandidate(candidateId: number, adminUid: string): Promise<string> {
  return setCandidateStatus(candidateId, "rejected", adminUid);
}

/** Takes a photo off the race page; its candidate goes back to pending so it can be approved again later. */
export async function removeApproved(photoId: number, adminUid: string): Promise<string> {
  const { data, error } = await supabaseAdmin.from("race_photos").delete().eq("id", photoId).select("race_id, candidate_id").maybeSingle();
  if (error) throw new Error(`removeApproved: ${error.message}`);
  if (!data) throw new ReviewError("That photo was already removed.", 404);
  if (data.candidate_id) await setCandidateStatus(data.candidate_id as number, "pending", adminUid);
  return data.race_id as string;
}

async function setCandidateStatus(candidateId: number, status: RacePhotoCandidate["status"], adminUid: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("race_photo_candidates")
    .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: adminUid })
    .eq("id", candidateId)
    .select("race_id")
    .maybeSingle();
  if (error) throw new Error(`setCandidateStatus: ${error.message}`);
  if (!data) throw new ReviewError("That candidate no longer exists.", 404);
  return data.race_id as string;
}
