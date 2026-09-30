import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { getRaceById, promoteCalendarRace } from "@/lib/supabase/races";
import { getAllCurrentDrivers } from "@/lib/supabase/media";
import { canDo } from "@/lib/communities";
import { listPublicGroups, requireAdmin, requireMember } from "@/lib/supabase/groups";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ServiceError } from "@/services/errors";
import type { RaceDoc } from "@/lib/types/race";
// Types + predictionTypeLabels live in the pure groupPredictionTypes.ts, not here - see that
// file's own comment for why a client component importing them from *this* module (which reaches
// otp.ts's nodemailer import through groups.ts) crashed the production build. Re-exported so every
// existing server-side import of `@/lib/supabase/groupPredictions` keeps working unchanged.
export type { GroupPrediction, PredictionGuess, PredictionState, PredictionStatus, PredictionType, RaceCommunityCard } from "@/lib/groupPredictionTypes";
export { predictionTypeLabels } from "@/lib/groupPredictionTypes";
import type { GroupPrediction, PredictionGuess, PredictionStatus, PredictionType, RaceCommunityCard } from "@/lib/groupPredictionTypes";
import { predictionStateAt, predictionTypeLabels } from "@/lib/groupPredictionTypes";

export type FeedPrediction = Omit<GroupPrediction, "myEntry"> & {
  groupName: string;
  hasEntered: boolean;
  myGuess: PredictionGuess | null;
  /** The viewer's own pick, resolved to real driver names server-side ("Max Verstappen", not
   * "VER"). Null when they haven't entered - never a placeholder. */
  myGuessLabel: string | null;
  /** The real per-entry payout once resolved (0 for a wrong guess, a positive number for a
   * correct one), straight off the same entries row myGuess comes from. Null before resolution,
   * and null when the viewer never entered - `hasEntered` is what tells those two apart. */
  myPointsAwarded: number | null;
  /** `correctAnswer` resolved to a real driver name where the type names one, the same way
   * myGuessLabel resolves the viewer's own guess. Null until status is "resolved". */
  correctAnswerLabel: string | null;
};

/** The deadline (ISO instant) for each race's prediction rounds, straight from the database function
 * that ENFORCES it (prediction_lock_at: the start of the weekend's main Qualifying session) - never
 * re-derived in TypeScript, so what a card displays cannot drift from what the server accepts.
 * A race with no known deadline maps to null, which every consumer treats as closed.
 *
 * If the lookup itself fails (most likely: the lifecycle migration hasn't been applied yet), pages
 * still render - every round shows as closed - and entering still fails at the database, so nothing
 * is ever accepted on a guess. */
export async function getPredictionLockTimes(raceIds: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(raceIds)];
  const result = new Map<string, string | null>(unique.map((id) => [id, null]));
  if (unique.length === 0) return result;
  const { data, error } = await queryWithRetry(() => supabaseAdmin.rpc("prediction_lock_times", { p_race_ids: unique }));
  if (error) {
    console.error(`getPredictionLockTimes: ${error.message}`);
    return result;
  }
  for (const row of (data ?? []) as { race_id: string; lock_at: string | null }[]) result.set(row.race_id, row.lock_at);
  return result;
}

/** The database's named failures (see enter_prediction / settle_prediction in
 * 20260930_prediction_lifecycle.sql) as ServiceErrors with a stable `code` the UI can act on. Anything
 * unrecognised is a real bug and stays a plain Error (a 500), never guessed into a friendly message. */
function predictionError(error: { message: string; details?: string | null }): Error {
  const m = error.message;
  if (m.includes("prediction_not_found")) return new ServiceError("Prediction not found.", 404, "prediction_not_found");
  if (m.includes("not_a_member")) return new ServiceError("You're not a member of this group.", 403, "not_a_member");
  if (m.includes("prediction_resolved")) return new ServiceError("This prediction has already been resolved.", 409, "prediction_resolved");
  if (m.includes("prediction_locked")) return new ServiceError("Predictions closed when qualifying began.", 409, "prediction_locked");
  if (m.includes("lock_unknown")) return new ServiceError("This round's deadline isn't available yet, so it can't take entries right now.", 409, "lock_unknown");
  if (m.includes("invalid_guess")) return new ServiceError("That isn't a valid pick for this round.", 400, "invalid_guess");
  if (m.includes("invalid_answer")) return new ServiceError("The race data doesn't give a valid answer for this round yet.", 400, "invalid_answer");
  if (m.includes("insufficient_points")) {
    const balance = error.details?.match(/balance=(\d+)/)?.[1];
    const needed = error.details?.match(/needed=(\d+)/)?.[1];
    return new ServiceError(needed ? `You need at least ${needed} points to enter this prediction.${balance ? ` Current balance: ${balance} points.` : ""}` : "You don't have enough points to enter this prediction.", 400, "insufficient_points");
  }
  return new Error(`prediction: ${m}`);
}

/** A stored guess rendered as something a person can read. Driver codes become real names where
 * the roster knows them and stay as the code where it doesn't, which is the honest outcome for a
 * driver who has since left the grid. */
export function describeGuess(type: PredictionType, guess: PredictionGuess, driverNameByCode: Map<string, string>): string {
  if (type === "dnf_count") return typeof guess === "number" ? `${guess} ${guess === 1 ? "retirement" : "retirements"}` : String(guess);
  if (type === "podium" && Array.isArray(guess)) return guess.map((code) => driverNameByCode.get(code) ?? code).join(", ");
  return typeof guess === "string" ? (driverNameByCode.get(guess) ?? guess) : String(guess);
}

/** One aggregated option in a prediction's community trend. `pct` is a real share of `total`,
 * rounded for display only. */
export type PredictionTrendOption = { key: string; label: string; count: number; pct: number };

export type PredictionTrend = {
  /** Real number of entries behind this aggregate. The UI decides what counts as "enough to
   * show" - this never hides or pads it. */
  total: number;
  options: PredictionTrendOption[];
};

/** How many distinct options a trend lists before the remainder is grouped into "Other". */
const TREND_TOP_N = 4;

/**
 * What the community has actually entered for one prediction round, aggregated server-side.
 *
 * Every number comes from real `group_prediction_entries` rows - there is no sampling, no
 * estimate, and no fallback that invents a distribution when nobody has entered yet (`total: 0`
 * with no options is a real, representable answer, and the card says so rather than drawing empty
 * bars).
 *
 * Individual entries are never returned, only counts: a member should be able to see which way the
 * community is leaning without seeing who picked what, which would leak other members' picks while
 * the round is still open. Membership is required to see even the aggregate.
 */
export async function getPredictionTrend(predictionId: string, uid: string): Promise<PredictionTrend> {
  const { data: prediction, error: predictionError } = await queryWithRetry(() =>
    supabaseAdmin.from("group_predictions").select("id, group_id, type").eq("id", predictionId).maybeSingle(),
  );
  if (predictionError) throw new Error(`getPredictionTrend(${predictionId}): ${predictionError.message}`);
  if (!prediction) throw new ServiceError("That prediction doesn't exist.", 404);

  await requireMember(prediction.group_id as string, uid);

  const { data: entries, error } = await queryWithRetry(() => supabaseAdmin.from("group_prediction_entries").select("guess").eq("prediction_id", predictionId));
  if (error) throw new Error(`getPredictionTrend(${predictionId}): ${error.message}`);

  const rows = entries ?? [];
  if (rows.length === 0) return { total: 0, options: [] };

  const type = prediction.type as PredictionType;
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = trendKeyFor(type, row.guess as PredictionGuess);
    if (key === null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  if (total === 0) return { total: 0, options: [] };

  // Driver names only matter for the types whose key IS a driver code - a DNF-count trend's keys
  // are numbers, and looking up a roster for them would be a wasted query.
  const needsDriverNames = type === "winner" || type === "podium" || type === "fastest_lap" || type === "pole";
  const driverNameByCode = needsDriverNames ? new Map((await getAllCurrentDrivers()).map((d) => [d.code, d.name])) : new Map<string, string>();

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = sorted.slice(0, TREND_TOP_N);
  const restCount = sorted.slice(TREND_TOP_N).reduce((sum, [, n]) => sum + n, 0);

  const options: PredictionTrendOption[] = top.map(([key, count]) => ({
    key,
    label: labelForTrendKey(type, key, driverNameByCode),
    count,
    pct: Math.round((count / total) * 100),
  }));
  if (restCount > 0) options.push({ key: "__other__", label: "Other", count: restCount, pct: Math.round((restCount / total) * 100) });

  return { total, options };
}

/** The one facet of a guess a trend groups by. A podium guess is three drivers, which has no
 * single meaningful distribution - the winner pick is the part members actually compare, so that's
 * what's aggregated, and the card labels it as such rather than implying the whole podium matched. */
function trendKeyFor(type: PredictionType, guess: PredictionGuess): string | null {
  if (type === "podium") return Array.isArray(guess) && typeof guess[0] === "string" ? guess[0] : null;
  if (type === "dnf_count") return typeof guess === "number" ? String(guess) : null;
  return typeof guess === "string" ? guess : null;
}

function labelForTrendKey(type: PredictionType, key: string, driverNameByCode: Map<string, string>): string {
  if (type === "dnf_count") return `${key} ${key === "1" ? "retirement" : "retirements"}`;
  return driverNameByCode.get(key) ?? key;
}

/** A resolved round still worth seeing in the feed - a viewer who entered wants to know they won
 * or lost, not just have the round quietly disappear the moment an admin resolves it. Past this
 * window it drops out of the feed for good; the community's own Predictions tab
 * (GroupPredictions.tsx) stays the permanent record. */
const RECENT_RESOLVED_WINDOW_DAYS = 7;

/** Groups home's right-sidebar widget and main feed: every open prediction across every group the
 * user has joined, plus any of their groups' rounds resolved in the last RECENT_RESOLVED_WINDOW_DAYS
 * - a real cross-group query, not a per-group fetch repeated N times. Kept to a summary
 * (race/type/entry cost/whether they've already entered/the real outcome once resolved); actually
 * entering still happens in the real group's own Predictions tab (GroupPredictions.tsx already owns
 * the guess UI, the driver roster lookup, etc. - duplicating that into a feed widget would be a
 * second, parallel implementation of the same interaction for no real benefit).
 *
 * Callers that want ONLY genuinely open rounds (the right-sidebar's "Active predictions" widget)
 * filter `status === "open"` themselves rather than this function silently narrowing back down -
 * see ActivePredictions' own filter. */
export async function listMyPredictions(uid: string, limit = 5): Promise<FeedPrediction[]> {
  const { data: memberships, error: membershipsError } = await queryWithRetry(() => supabaseAdmin.from("group_members").select("group_id").eq("user_id", uid));
  if (membershipsError) throw new Error(`listMyPredictions: ${membershipsError.message}`);
  const groupIds = [...new Set((memberships ?? []).map((m) => m.group_id as string))];
  if (groupIds.length === 0) return [];

  const resolvedCutoff = new Date(Date.now() - RECENT_RESOLVED_WINDOW_DAYS * 86_400_000).toISOString();
  const { data: predictions, error } = await queryWithRetry(() =>
    supabaseAdmin
      .from("group_predictions")
      .select("*")
      .in("group_id", groupIds)
      .or(`status.in.(open,locked),and(status.eq.resolved,resolved_at.gte.${resolvedCutoff})`)
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  if (error) throw new Error(`listMyPredictions: ${error.message}`);
  if (!predictions?.length) return [];

  const predictionIds = predictions.map((p) => p.id as string);
  const raceIds = [...new Set(predictions.map((p) => p.race_id as string))];
  const predictionGroupIds = [...new Set(predictions.map((p) => p.group_id as string))];
  const [{ data: races, error: racesError }, { data: groupsData, error: groupsError }, { data: myEntries, error: entriesError }, { data: allEntries, error: allEntriesError }, lockAtByRace] = await Promise.all([
    queryWithRetry(() => supabaseAdmin.from("races").select("id, name, race_date, status").in("id", raceIds)),
    queryWithRetry(() => supabaseAdmin.from("groups").select("id, name").in("id", predictionGroupIds)),
    queryWithRetry(() => supabaseAdmin.from("group_prediction_entries").select("prediction_id, guess, points_awarded").eq("user_id", uid).in("prediction_id", predictionIds)),
    queryWithRetry(() => supabaseAdmin.from("group_prediction_entries").select("prediction_id").in("prediction_id", predictionIds)),
    getPredictionLockTimes(raceIds),
  ]);
  if (racesError) throw new Error(`listMyPredictions: ${racesError.message}`);
  if (groupsError) throw new Error(`listMyPredictions: ${groupsError.message}`);
  if (entriesError) throw new Error(`listMyPredictions: ${entriesError.message}`);
  if (allEntriesError) throw new Error(`listMyPredictions: ${allEntriesError.message}`);

  const raceById = new Map((races ?? []).map((r) => [r.id as string, r]));
  const groupNameById = new Map((groupsData ?? []).map((g) => [g.id as string, g.name as string]));
  const myGuessByPrediction = new Map((myEntries ?? []).map((e) => [e.prediction_id as string, (e.guess as PredictionGuess | null) ?? null]));
  const myPointsAwardedByPrediction = new Map((myEntries ?? []).map((e) => [e.prediction_id as string, (e.points_awarded as number | null) ?? null]));
  const entryCountByPrediction = new Map<string, number>();
  for (const e of allEntries ?? []) entryCountByPrediction.set(e.prediction_id as string, (entryCountByPrediction.get(e.prediction_id as string) ?? 0) + 1);

  // Only pay for the roster when it's actually needed - either the viewer entered something that
  // needs naming, or a resolved round's own correct answer names a driver. getAllCurrentDrivers is
  // itself cached, so even when it does run it is not a fresh round trip per request.
  const needsDriverNames =
    myGuessByPrediction.size > 0 ||
    predictions.some((p) => p.correct_answer !== null && (["winner", "podium", "fastest_lap", "pole"] as string[]).includes(p.type as string));
  const driverNameByCode = needsDriverNames ? new Map((await getAllCurrentDrivers()).map((d) => [d.code, d.name])) : new Map<string, string>();

  const nowMs = Date.now();
  return predictions.map((p) => {
    const type = p.type as PredictionType;
    const correctAnswer = (p.correct_answer as PredictionGuess | null) ?? null;
    const lockAt = lockAtByRace.get(p.race_id as string) ?? null;
    return {
      id: p.id as string,
      groupId: p.group_id as string,
      groupName: groupNameById.get(p.group_id as string) ?? "a group",
      raceId: p.race_id as string,
      raceName: (raceById.get(p.race_id as string)?.name as string | undefined) ?? (p.race_id as string),
      raceDate: (raceById.get(p.race_id as string)?.race_date as string | null | undefined) ?? null,
      raceStatus: (raceById.get(p.race_id as string)?.status as string | null | undefined) ?? null,
      type,
      entryPoints: p.entry_points as number,
      status: p.status as PredictionStatus,
      lockAt,
      state: predictionStateAt(p.status as PredictionStatus, lockAt, nowMs),
      correctAnswer,
      correctAnswerLabel: correctAnswer === null ? null : describeGuess(type, correctAnswer, driverNameByCode),
      createdAt: p.created_at as string,
      resolvedAt: (p.resolved_at as string | null) ?? null,
      entryCount: entryCountByPrediction.get(p.id as string) ?? 0,
      hasEntered: myGuessByPrediction.has(p.id as string),
      myGuess: myGuessByPrediction.get(p.id as string) ?? null,
      myGuessLabel: resolveMyGuessLabel(type, myGuessByPrediction.get(p.id as string) ?? null, driverNameByCode),
      myPointsAwarded: myPointsAwardedByPrediction.get(p.id as string) ?? null,
    };
  });
}

function resolveMyGuessLabel(type: PredictionType, guess: PredictionGuess | null, driverNameByCode: Map<string, string>): string | null {
  return guess === null ? null : describeGuess(type, guess, driverNameByCode);
}

/**
 * "Communities predicting this race" - real groups, filtered to public ones (or ones the viewer
 * already belongs to, so a private group's own name never leaks to someone outside it), ranked by
 * real entry counts on a real prediction tied to this exact raceId - never an invented "trending"
 * signal.
 *
 * Falls back to general discovery (listPublicGroups' own recommendation order) when literally
 * nothing has a prediction for this race yet - true for most races most of the time (predictions
 * open, but not every public group opens one for every round), and the section should still be
 * useful rather than empty in that case, just reframed ("communities to join" instead of
 * "communities predicting this race").
 */
export async function listRaceCommunities(raceId: string, uid: string | null, limit = 6): Promise<{ mode: "predicting" | "discover"; communities: RaceCommunityCard[] }> {
  const { data: predictionRows, error: predError } = await queryWithRetry(() => supabaseAdmin.from("group_predictions").select("*").eq("race_id", raceId));
  if (predError) throw new Error(`listRaceCommunities(${raceId}): ${predError.message}`);

  if (!predictionRows?.length) {
    const discovered = await listPublicGroups(undefined, uid ?? undefined);
    return { mode: "discover", communities: await hydrateCommunityCards(discovered.slice(0, limit).map((g) => ({ id: g.id, name: g.name, avatarUrl: g.avatarUrl, isMember: g.isMember })), uid, new Map()) };
  }

  const predictionGroupIds = [...new Set(predictionRows.map((p) => p.group_id as string))];
  const [{ data: groupsData, error: groupsError }, { data: myMemberships, error: membershipError }, { data: entryRows, error: entryError }] = await Promise.all([
    queryWithRetry(() => supabaseAdmin.from("groups").select("id, name, avatar_url, visibility").in("id", predictionGroupIds)),
    uid ? queryWithRetry(() => supabaseAdmin.from("group_members").select("group_id").eq("user_id", uid).in("group_id", predictionGroupIds)) : Promise.resolve({ data: [], error: null }),
    queryWithRetry(() =>
      supabaseAdmin
        .from("group_prediction_entries")
        .select("prediction_id")
        .in(
          "prediction_id",
          predictionRows.map((p) => p.id as string),
        ),
    ),
  ]);
  if (groupsError) throw new Error(`listRaceCommunities(${raceId}): ${groupsError.message}`);
  if (membershipError) throw new Error(`listRaceCommunities(${raceId}): ${membershipError.message}`);
  if (entryError) throw new Error(`listRaceCommunities(${raceId}): ${entryError.message}`);

  const myGroupIds = new Set((myMemberships ?? []).map((m) => m.group_id as string));
  // Public, or a private group the viewer already belongs to - never a private group's name shown
  // to someone outside it, the same visibility rule discoverCommunities already enforces.
  const visibleGroups = (groupsData ?? []).filter((g) => g.visibility === "public" || myGroupIds.has(g.id as string));
  if (visibleGroups.length === 0) return { mode: "discover", communities: [] };

  const entryCountByPrediction = new Map<string, number>();
  for (const e of entryRows ?? []) entryCountByPrediction.set(e.prediction_id as string, (entryCountByPrediction.get(e.prediction_id as string) ?? 0) + 1);

  const predictionByGroup = new Map(predictionRows.filter((p) => visibleGroups.some((g) => g.id === p.group_id)).map((p) => [p.group_id as string, p]));
  const ranked = visibleGroups
    .map((g) => ({ group: g, prediction: predictionByGroup.get(g.id as string), entryCount: entryCountByPrediction.get(predictionByGroup.get(g.id as string)?.id as string) ?? 0 }))
    .sort((a, b) => b.entryCount - a.entryCount)
    .slice(0, limit);

  const lockAt = (await getPredictionLockTimes([raceId])).get(raceId) ?? null;
  const communities = await hydrateCommunityCards(
    ranked.map((r) => ({ id: r.group.id as string, name: r.group.name as string, avatarUrl: r.group.avatar_url as string | null, isMember: myGroupIds.has(r.group.id as string) })),
    uid,
    new Map(
      ranked
        .filter((r) => r.prediction)
        .map((r) => [
          r.group.id as string,
          { id: r.prediction!.id as string, type: r.prediction!.type as PredictionType, status: r.prediction!.status as PredictionStatus, lockAt, entryCount: r.entryCount, entryPoints: r.prediction!.entry_points as number },
        ]),
    ),
  );
  return { mode: "predicting", communities };
}

/** Member count + a real, small member preview for each card - one batched query for however many
 * groups are being shown (never one round-trip per card). Most recently active member first
 * (last_visit_at), which is the closest real signal this schema has to "who'd actually show up in
 * an avatar stack" without inventing one. */
async function hydrateCommunityCards(
  groups: { id: string; name: string; avatarUrl: string | null; isMember: boolean }[],
  uid: string | null,
  predictionByGroup: Map<string, RaceCommunityCard["prediction"]>,
): Promise<RaceCommunityCard[]> {
  if (groups.length === 0) return [];
  const groupIds = groups.map((g) => g.id);
  const { data: memberRows, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_members").select("group_id, user_id, last_visit_at").in("group_id", groupIds).order("last_visit_at", { ascending: false, nullsFirst: false }),
  );
  if (error) throw new Error(`hydrateCommunityCards: ${error.message}`);

  const memberIdsByGroup = new Map<string, string[]>();
  const countByGroup = new Map<string, number>();
  for (const row of memberRows ?? []) {
    const gid = row.group_id as string;
    countByGroup.set(gid, (countByGroup.get(gid) ?? 0) + 1);
    const existing = memberIdsByGroup.get(gid) ?? [];
    if (existing.length < 3) existing.push(row.user_id as string);
    memberIdsByGroup.set(gid, existing);
  }
  const allPreviewIds = [...new Set([...memberIdsByGroup.values()].flat())];
  const { data: profileRows, error: profileError } = allPreviewIds.length
    ? await queryWithRetry(() => supabaseAdmin.from("profiles").select("id, display_name, username, first_name").in("id", allPreviewIds))
    : { data: [], error: null };
  if (profileError) throw new Error(`hydrateCommunityCards: ${profileError.message}`);
  const nameById = new Map((profileRows ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? (p.username as string | null) ?? (p.first_name as string | null) ?? "Member"]));

  return groups.map((g) => ({
    groupId: g.id,
    name: g.name,
    avatarUrl: g.avatarUrl,
    memberCount: countByGroup.get(g.id) ?? 0,
    memberPreview: (memberIdsByGroup.get(g.id) ?? []).map((id) => ({ id, name: nameById.get(id) ?? "Member" })),
    isMember: g.isMember,
    prediction: predictionByGroup.get(g.id) ?? null,
  }));
}

export async function createPrediction(
  groupId: string,
  uid: string,
  input: { raceId: string; type: PredictionType; entryPoints: number },
): Promise<{ id: string }> {
  // Permission-driven rather than hardcoded admin: a community can open this up to moderators or
  // all members. Defaults to admins, which is exactly what this was before.
  const role = await requireMember(groupId, uid);
  const { data: group, error: groupError } = await supabaseAdmin.from("groups").select("permissions").eq("id", groupId).maybeSingle();
  if (groupError) throw new Error(`createPrediction(${groupId}): ${groupError.message}`);
  if (!canDo(group?.permissions, "createPredictions", role)) {
    throw new ServiceError("Only certain roles can create prediction rounds in this community.", 403);
  }
  if (!Number.isInteger(input.entryPoints) || input.entryPoints < 0) throw new ServiceError("Entry value must be a non-negative whole number.", 400);

  // A round that hasn't had any FastF1 session yet only exists as a `calendar` placeholder, not a
  // real `races` row - promote it on first use instead of rejecting the pick (see
  // promoteCalendarRace's own comment for why).
  const race = (await getRaceById(input.raceId)) ?? (await promoteCalendarRace(input.raceId));
  if (!race) throw new ServiceError("That race doesn't exist.", 404);
  if (race.status === "completed") throw new ServiceError("That race has already finished.", 400);

  // A round opened after qualifying has begun would be born closed (or, worse, open to anyone who
  // already knows the grid). Refuse it, and refuse one whose schedule has no Qualifying session:
  // there is no authoritative deadline to enforce.
  const lockAt = (await getPredictionLockTimes([input.raceId])).get(input.raceId) ?? null;
  if (lockAt === null) throw new ServiceError("This race's qualifying time isn't published yet, so a prediction round can't be opened for it.", 409, "lock_unknown");
  if (Date.now() >= Date.parse(lockAt)) throw new ServiceError("Predictions for this race closed when qualifying began.", 409, "prediction_locked");

  const { data, error } = await supabaseAdmin
    .from("group_predictions")
    .insert({ group_id: groupId, race_id: input.raceId, type: input.type, entry_points: input.entryPoints, created_by: uid })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new ServiceError(`This group already has a ${predictionTypeLabels[input.type]} prediction for that race.`, 409);
    throw new Error(`createPrediction(${groupId}): ${error.message}`);
  }
  return { id: data.id as string };
}

export async function listPredictions(groupId: string, uid: string): Promise<GroupPrediction[]> {
  await requireMember(groupId, uid);

  const { data: predictions, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_predictions").select("*").eq("group_id", groupId).order("created_at", { ascending: false }),
  );
  if (error) throw new Error(`listPredictions(${groupId}): ${error.message}`);
  if (!predictions?.length) return [];

  const predictionIds = predictions.map((p) => p.id as string);
  const raceIds = [...new Set(predictions.map((p) => p.race_id as string))];
  const [{ data: entries, error: entriesError }, { data: races, error: racesError }, lockAtByRace] = await Promise.all([
    queryWithRetry(() => supabaseAdmin.from("group_prediction_entries").select("prediction_id, user_id, guess, points_wagered, points_awarded").in("prediction_id", predictionIds)),
    queryWithRetry(() => supabaseAdmin.from("races").select("id, name, race_date, status").in("id", raceIds)),
    getPredictionLockTimes(raceIds),
  ]);
  if (entriesError) throw new Error(`listPredictions(${groupId}): ${entriesError.message}`);
  if (racesError) throw new Error(`listPredictions(${groupId}): ${racesError.message}`);

  const raceById = new Map((races ?? []).map((r) => [r.id as string, r]));
  const entryCountByPrediction = new Map<string, number>();
  const myEntryByPrediction = new Map<string, { guess: PredictionGuess; pointsWagered: number; pointsAwarded: number | null }>();
  for (const e of entries ?? []) {
    const pid = e.prediction_id as string;
    entryCountByPrediction.set(pid, (entryCountByPrediction.get(pid) ?? 0) + 1);
    if (e.user_id === uid) {
      myEntryByPrediction.set(pid, { guess: e.guess as PredictionGuess, pointsWagered: e.points_wagered as number, pointsAwarded: e.points_awarded as number | null });
    }
  }

  const nowMs = Date.now();
  return predictions.map((p) => {
    const lockAt = lockAtByRace.get(p.race_id as string) ?? null;
    return {
    id: p.id as string,
    groupId: p.group_id as string,
    raceId: p.race_id as string,
    raceName: (raceById.get(p.race_id as string)?.name as string | undefined) ?? (p.race_id as string),
    raceDate: (raceById.get(p.race_id as string)?.race_date as string | null | undefined) ?? null,
    raceStatus: (raceById.get(p.race_id as string)?.status as string | null | undefined) ?? null,
    type: p.type as PredictionType,
    entryPoints: p.entry_points as number,
    status: p.status as PredictionStatus,
    lockAt,
    state: predictionStateAt(p.status as PredictionStatus, lockAt, nowMs),
    correctAnswer: (p.correct_answer as PredictionGuess | null) ?? null,
    createdAt: p.created_at as string,
    resolvedAt: (p.resolved_at as string | null) ?? null,
    entryCount: entryCountByPrediction.get(p.id as string) ?? 0,
    myEntry: myEntryByPrediction.get(p.id as string) ?? null,
    };
  });
}

function validateGuess(type: PredictionType, guess: unknown): PredictionGuess {
  if (type === "podium") {
    if (!Array.isArray(guess) || guess.length !== 3 || guess.some((d) => typeof d !== "string" || !d)) {
      throw new ServiceError("Pick 3 different drivers for the podium.", 400);
    }
    if (new Set(guess).size !== 3) throw new ServiceError("Pick 3 different drivers for the podium.", 400);
    return guess as [string, string, string];
  }
  if (type === "dnf_count") {
    if (typeof guess !== "number" || !Number.isInteger(guess) || guess < 0) throw new ServiceError("Enter a whole number of DNFs.", 400);
    return guess;
  }
  if (typeof guess !== "string" || !guess) throw new ServiceError("Select a driver.", 400);
  return guess;
}

/** Enter, or change, a pick - the whole decision is made by enter_prediction() in the database
 * (20260930_prediction_lifecycle.sql), in ONE transaction: membership, round state, the deadline
 * (start of the weekend's main Qualifying session, exclusive), the guess's shape, the entry fee and
 * its ledger row. Nothing is charged unless the entry is stored, so there is no refund path to get
 * wrong, and once the deadline has passed neither a new entry nor an edit is accepted.
 *
 * A second call for the same (predictionId, uid) before the deadline changes the existing pick
 * without re-charging - the fee was paid the first time and the round's entryPoints can't have
 * changed since. That is what makes "Change prediction" work.
 *
 * validateGuess still runs first: it gives the friendlier messages and spares a round trip. The
 * database re-validates, so it isn't the only line of defence. */
export async function enterPrediction(groupId: string, predictionId: string, uid: string, rawGuess: unknown): Promise<{ created: boolean; lockAt: string | null }> {
  await requireMember(groupId, uid);

  const { data: prediction, error } = await supabaseAdmin.from("group_predictions").select("type").eq("id", predictionId).eq("group_id", groupId).maybeSingle();
  if (error) throw new Error(`enterPrediction(${predictionId}): ${error.message}`);
  if (!prediction) throw new ServiceError("Prediction not found.", 404, "prediction_not_found");

  const guess = validateGuess(prediction.type as PredictionType, rawGuess);
  const { data, error: enterError } = await supabaseAdmin.rpc("enter_prediction", { p_prediction_id: predictionId, p_group_id: groupId, p_user_id: uid, p_guess: guess });
  if (enterError) throw predictionError(enterError);
  const result = data as { created: boolean; lockAt: string | null };
  return { created: result.created, lockAt: result.lockAt ?? null };
}

// PAYOUT MODEL (implemented in settle_prediction(), supabase/migrations/20260930_prediction_lifecycle.sql -
// the only place scoring lives now, so it cannot drift from what actually gets paid): every entry
// pays back double its wager for a fully correct guess - a simple "double or nothing" model rather
// than a pari-mutuel pool. Podium reuses the 3/1/0-per-slot convention pipeline/compute_group_scores.py
// established for the personal-picks leaderboard (exact slot = 3, right driver/wrong slot = 1, miss
// = 0, out of 9), scaled into a fraction of the double-payout ceiling.
//
// The helpers below only work out WHAT the correct answer is from a race's results.
function resolveWinner(race: RaceDoc): string | null {
  return race.results?.find((r) => r.finishPosition === 1)?.driver ?? null;
}
function resolvePole(race: RaceDoc): string | null {
  return race.poleSitter ?? null;
}
function resolveFastestLap(race: RaceDoc): string | null {
  const withTime = (race.results ?? []).filter((r) => r.fastestLapSec !== null);
  if (!withTime.length) return null;
  return withTime.reduce((best, r) => (r.fastestLapSec! < best.fastestLapSec! ? r : best)).driver;
}
function resolveDnfCount(race: RaceDoc): number {
  return (race.results ?? []).filter((r) => r.status === "dnf").length;
}
function resolvePodium(race: RaceDoc): [string, string, string] | null {
  const top3 = (race.results ?? [])
    .filter((r) => r.finishPosition <= 3)
    .sort((a, b) => a.finishPosition - b.finishPosition)
    .map((r) => r.driver);
  return top3.length === 3 ? (top3 as [string, string, string]) : null;
}

export type ResolveResult = { alreadyResolved: boolean; paidCount: number; paidTotal: number };

/** Admin-triggered, not an automatic pipeline step - deliberately, for this v1: every input this
 * needs (results, pole, per-driver fastest lap) already sits on `races` the moment a race's status
 * flips to "completed" via the existing fetch_races.py write, so "resolve" is a pure read+compute
 * over data this app already has in Postgres.
 *
 * The correct answer is computed here, next to the results model; everything that must be atomic
 * is done by settle_prediction() in the database: claim the round (row lock), score every entry,
 * credit balances, write ledger rows, mark it resolved - all or nothing. Resolving again (a double
 * click, a retry, a second admin) is a safe no-op that reports `alreadyResolved: true` and moves no
 * points; a concurrent second call waits on the row lock and then sees the same. */
export async function resolvePrediction(groupId: string, predictionId: string, uid: string): Promise<ResolveResult> {
  await requireAdmin(groupId, uid);

  const { data: prediction, error } = await supabaseAdmin.from("group_predictions").select("*").eq("id", predictionId).eq("group_id", groupId).maybeSingle();
  if (error) throw new Error(`resolvePrediction(${predictionId}): ${error.message}`);
  if (!prediction) throw new ServiceError("Prediction not found.", 404, "prediction_not_found");
  if (prediction.status === "resolved") return { alreadyResolved: true, paidCount: 0, paidTotal: 0 };

  const race = await getRaceById(prediction.race_id as string);
  if (!race || race.status !== "completed" || !race.results?.length) {
    throw new ServiceError("This race hasn't finished yet - results aren't available to resolve against.", 400);
  }

  const type = prediction.type as PredictionType;
  let correctAnswer: PredictionGuess | null;
  if (type === "winner") correctAnswer = resolveWinner(race);
  else if (type === "pole") correctAnswer = resolvePole(race);
  else if (type === "fastest_lap") correctAnswer = resolveFastestLap(race);
  else if (type === "dnf_count") correctAnswer = resolveDnfCount(race);
  else correctAnswer = resolvePodium(race);
  if (correctAnswer === null) throw new ServiceError("This race's data doesn't have what's needed to resolve this prediction type yet.", 400);

  const { data, error: settleError } = await supabaseAdmin.rpc("settle_prediction", {
    p_prediction_id: predictionId,
    p_group_id: groupId,
    p_correct_answer: correctAnswer,
    // Recorded so a round paid out against preliminary results can be found and reviewed later.
    p_results_source: race.resultsSource ?? null,
  });
  if (settleError) throw predictionError(settleError);
  return data as ResolveResult;
}
