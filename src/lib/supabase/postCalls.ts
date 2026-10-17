import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { getCalendarEntriesByYear } from "@/lib/supabase/calendar";
import { getAllCurrentDrivers } from "@/lib/supabase/media";
import { getRaceById, getRaceRoster, getRacesByYear } from "@/lib/supabase/races";
import { parseUtcDateTime } from "@/lib/countdown";
import { pickWeekend, sessionsOf } from "@/lib/communityWeekend";
import { callRecord, callSession, describeCall, gradeCall, parseCall, type CallVerdict, type PostCall } from "@/lib/postCalls";
import { ServiceError } from "@/services/errors";

// Takes with receipts, the server half: which race a call can be made on, storing one with its post, and attaching
// calls (graded) and their authors' records to the posts the feed lists. post_calls is new (20261021_post_calls.sql):
// until that migration is applied every read here returns nothing and a call is refused, never an error page.

/** The race calls can be made on now: the race weekend Communities is living in, while at least one of its locks
 * (qualifying for pole, the race for everything else) is still ahead. */
export type CallableRace = {
  raceId: string;
  raceName: string;
  locks: { Q: string | null; R: string | null };
  drivers: { code: string; name: string; team: string }[];
};

export async function getCallableRace(season: number, nowMs = Date.now()): Promise<CallableRace | null> {
  // Until 20261021_post_calls.sql is applied there is nowhere to store a call, so "Make a call" stays hidden rather
  // than offering something that would fail on Post. limit(0) reads no rows; a plain select, because a HEAD request
  // doesn't surface PostgREST's "no such table" error.
  const { error: tableError } = await supabaseAdmin.from("post_calls").select("post_id").limit(0);
  if (tableError) return null;
  const [entries, races] = await Promise.all([getCalendarEntriesByYear(season), getRacesByYear(season)]);
  const entry = pickWeekend(entries, nowMs);
  const race = entry ? races.find((r) => r.round === entry.round) : null;
  if (!entry || !race?.id) return null;
  const sessions = sessionsOf(entry);
  const at = (key: "Q" | "R") => {
    const s = sessions.find((x) => x.key === key);
    return s ? parseUtcDateTime(s.startsAt).toISOString() : null;
  };
  const locks = { Q: at("Q"), R: at("R") };
  if (![locks.Q, locks.R].some((t) => t && Date.parse(t) > nowMs)) return null;
  const roster = await getRaceRoster(race);
  return { raceId: race.id, raceName: entry.name ?? race.name, locks, drivers: roster.map((r) => ({ code: r.driver, name: r.driverName, team: r.team })) };
}

/** A call checked before its post is created: the race is the callable one, the call is valid for its roster, and its
 * session hasn't started. Throws the reason it's refused. */
export async function validateCall(raw: unknown, season: number, nowMs = Date.now()): Promise<PostCall> {
  const race = await getCallableRace(season, nowMs);
  const raceId = raw && typeof raw === "object" ? (raw as { raceId?: unknown }).raceId : null;
  if (!race || raceId !== race.raceId) throw new ServiceError("Calls can only be made on this weekend's race, before it starts.", 400);
  const parsed = parseCall(raw, new Set(race.drivers.map((d) => d.code)));
  if ("error" in parsed) throw new ServiceError(parsed.error, 400);
  const locksAt = race.locks[callSession(parsed.call.kind)];
  if (!locksAt || Date.parse(locksAt) <= nowMs) throw new ServiceError("That session has started, so this call is locked.", 400);
  return { ...parsed.call, raceId: race.raceId, locksAt };
}

/** Stores a validated call with its (just created) post. */
export async function saveCall(postId: string, uid: string, call: PostCall): Promise<void> {
  const { error } = await supabaseAdmin.from("post_calls").insert({
    post_id: postId,
    user_id: uid,
    race_id: call.raceId,
    kind: call.kind,
    driver: call.driver,
    rival: call.rival,
    threshold: call.threshold,
    locks_at: call.locksAt,
  });
  if (error) throw new Error(`saveCall(${postId}): ${error.message}`);
}

/** A call as a post carries it: the call, its sentence, and its grade right now. */
export type PostCallView = PostCall & { label: string; verdict: CallVerdict };
/** An author's season record from their graded calls. */
export type AuthorRecord = { correct: number; settled: number };

type CallRow = { post_id: string; user_id: string; race_id: string; kind: string; driver: string | null; rival: string | null; threshold: number | null; locks_at: string };

function toCall(row: CallRow): PostCall {
  return { kind: row.kind as PostCall["kind"], raceId: row.race_id, driver: row.driver, rival: row.rival, threshold: row.threshold, locksAt: row.locks_at };
}

async function readCalls(build: () => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<CallRow[]> {
  try {
    const { data, error } = await queryWithRetry(build);
    if (error) {
      // Before the migration is applied the table doesn't exist: no calls, not a failure.
      console.warn(`post_calls read: ${error.message}`);
      return [];
    }
    return (data as CallRow[] | null) ?? [];
  } catch (err) {
    console.warn("post_calls read:", err);
    return [];
  }
}

const surname = (name: string) => name.trim().split(/\s+/).slice(-1)[0] || name;

/**
 * Attaches to each post its call (graded against the stored result) and its author's record for the season the post's
 * race belongs to. Grades use the cached race rows; names, the current drivers. Posts without a call are returned as
 * they are, with `call: null`.
 */
export async function withCalls<T extends { id: string; userId: string }>(posts: T[]): Promise<(T & { call: PostCallView | null; authorRecord: AuthorRecord | null })[]> {
  if (!posts.length) return [];
  const rows = await readCalls(() =>
    supabaseAdmin
      .from("post_calls")
      .select("post_id, user_id, race_id, kind, driver, rival, threshold, locks_at")
      .in("post_id", posts.map((p) => p.id)),
  );
  // Records: every call by these posts' authors in the seasons these calls are in (usually one).
  const authors = [...new Set(posts.map((p) => p.userId))];
  const seasons = [...new Set(rows.map((r) => r.race_id.slice(0, 4)))].filter((y) => /^\d{4}$/.test(y));
  const historyRows = seasons.length
    ? await readCalls(() =>
        supabaseAdmin
          .from("post_calls")
          .select("post_id, user_id, race_id, kind, driver, rival, threshold, locks_at")
          .in("user_id", authors)
          .or(seasons.map((y) => `race_id.like.${y}_*`).join(",")),
      )
    : [];

  const raceIds = [...new Set([...rows, ...historyRows].map((r) => r.race_id))];
  const raceById = new Map(await Promise.all(raceIds.map(async (id) => [id, await getRaceById(id).catch(() => null)] as const)));
  const names = rows.length ? new Map((await getAllCurrentDrivers().catch(() => [])).map((d) => [d.code, surname(d.name)])) : new Map<string, string>();
  const nameOf = (code: string) => names.get(code) ?? code;

  const recordByAuthor = new Map<string, AuthorRecord>();
  for (const author of authors) {
    const verdicts = historyRows.filter((r) => r.user_id === author).map((r) => gradeCall(toCall(r), raceById.get(r.race_id) ?? null));
    const rec = callRecord(verdicts);
    if (rec.settled > 0 || verdicts.length > 0) recordByAuthor.set(author, rec);
  }

  const callByPost = new Map(rows.map((r) => [r.post_id, r]));
  return posts.map((p) => {
    const row = callByPost.get(p.id);
    const call = row ? toCall(row) : null;
    return {
      ...p,
      call: call ? { ...call, label: describeCall(call, nameOf), verdict: gradeCall(call, raceById.get(call.raceId) ?? null) } : null,
      authorRecord: recordByAuthor.get(p.userId) ?? null,
    };
  });
}
