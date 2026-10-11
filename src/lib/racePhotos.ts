/**
 * Race photos: Wikimedia Commons photos a person approved for a race (pipeline/race_photos.py finds the
 * candidates). Only metadata and Wikimedia's own thumbnail URLs are stored; the browser loads the images from
 * upload.wikimedia.org, so they cost no Supabase Storage or egress.
 *
 * Client-safe: types and pure rules shared by the race page, the admin review page and their tests.
 */

export type RacePhoto = {
  id: number;
  raceId: string;
  /** 1280px rendition, for the expanded view. */
  imageUrl: string;
  /** 500px rendition, for the gallery. */
  thumbnailUrl: string;
  /** The Commons file page: the attribution link. */
  sourceUrl: string;
  photographer: string;
  license: string;
  licenseUrl: string;
  altText: string;
  width: number;
  height: number;
  rank: number;
};

export type PhotoSubject = "car" | "podium" | "driver" | "atmosphere" | "general";

export type RacePhotoCandidate = Omit<RacePhoto, "rank"> & {
  providerId: string;
  takenOn: string | null;
  subject: PhotoSubject;
  score: number;
  groupKey: string;
  status: "pending" | "approved" | "rejected";
};

export const MAX_RACE_PHOTOS = 4;

/** The same allow-list the database enforces (race_photos_license_check): CC0, public domain, CC BY, CC BY-SA. */
export const ALLOWED_LICENCE = /^(CC0|Public domain|CC BY(-SA)? [0-9]\.[0-9])$/;

const WIKIMEDIA_UPLOAD = "https://upload.wikimedia.org/";
const COMMONS_FILE = "https://commons.wikimedia.org/wiki/File:";

/**
 * Whether a stored photo may be shown: an allowed licence, the full credit, and every URL on Wikimedia.
 * The database already refuses anything else; this is the read-side half, so a row that somehow got past it
 * is dropped rather than shown.
 */
export function isPublishable(p: Pick<RacePhoto, "imageUrl" | "thumbnailUrl" | "sourceUrl" | "photographer" | "license" | "licenseUrl">): boolean {
  return (
    ALLOWED_LICENCE.test(p.license) &&
    p.photographer.trim().length > 0 &&
    /^https?:\/\//.test(p.licenseUrl) &&
    p.imageUrl.startsWith(WIKIMEDIA_UPLOAD) &&
    p.thumbnailUrl.startsWith(WIKIMEDIA_UPLOAD) &&
    p.sourceUrl.startsWith(COMMONS_FILE)
  );
}

/** The lowest free rank 1-4, or null when the race already has four photos. */
export function nextFreeRank(taken: readonly number[]): number | null {
  for (let rank = 1; rank <= MAX_RACE_PHOTOS; rank++) if (!taken.includes(rank)) return rank;
  return null;
}

export type CandidateGroup = { groupKey: string; subject: PhotoSubject; best: RacePhotoCandidate; alternates: RacePhotoCandidate[] };

/**
 * Candidates grouped by burst (frames of one sequence share a groupKey), best frame first, groups in the order
 * the pipeline ranked them. The reviewer sees one photo per group and can swap in an alternate frame.
 */
export function groupCandidates(candidates: readonly RacePhotoCandidate[]): CandidateGroup[] {
  const groups = new Map<string, RacePhotoCandidate[]>();
  const sorted = [...candidates].sort((a, b) => b.score - a.score || a.providerId.localeCompare(b.providerId));
  for (const c of sorted) groups.set(c.groupKey, [...(groups.get(c.groupKey) ?? []), c]);
  return [...groups.entries()].map(([groupKey, [best, ...alternates]]) => ({ groupKey, subject: best.subject, best, alternates }));
}

/** "Photo: Yu Chu Chin, CC BY-SA 4.0" - the visible credit; the photographer links to the source page and the
 * licence to its deed. */
export function creditLabel(p: Pick<RacePhoto, "photographer" | "license">): string {
  return `Photo: ${p.photographer}, ${p.license}`;
}
