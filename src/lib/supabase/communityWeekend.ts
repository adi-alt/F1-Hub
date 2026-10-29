import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { getCalendarEntriesByYear } from "@/lib/supabase/calendar";
import { getQualifyingStages, getRace, getRaceById, getRaceRoster } from "@/lib/supabase/races";
import type { PredictionGuess, PredictionType } from "@/lib/groupPredictionTypes";
import {
  comparableDriver,
  crowdModelRecord,
  modelPickFor,
  pickWeekend,
  sessionResults,
  sessionsOf,
  type CommunitySession,
  type CrowdModelRound,
  type ModelPick,
  type ResultLine,
  type SessionKey,
} from "@/lib/communityWeekend";

// Read-only. Nothing here writes: the weekend and the record are derived from the calendar, the races the pipeline
// stores, and the rounds and entries communities already have.

/** Below this many entries there is no crowd to speak of, the same floor the rounds' own trends use. */
const MIN_CROWD = 3;

/** How a community did on a settled round, for a session's result card: "3 of 7 called pole". */
export type CalledIt = { label: string; correct: number; total: number };

export type CommunityWeekendData = {
  year: number;
  round: number;
  raceId: string | null;
  raceName: string;
  sessions: CommunitySession[];
  results: Partial<Record<SessionKey, ResultLine[]>>;
  calledIt: Partial<Record<SessionKey, CalledIt>>;
} | null;

async function memberGroupIds(uid: string): Promise<string[]> {
  const { data, error } = await queryWithRetry(() => supabaseAdmin.from("group_members").select("group_id").eq("user_id", uid));
  if (error) throw new Error(`memberGroupIds: ${error.message}`);
  return [...new Set((data ?? []).map((m) => m.group_id as string))];
}

/** The plurality pick of a set of guesses, by the one driver each names; ties go to the alphabetically first code (the
 * same tie-break the rounds' trends use). Null below MIN_CROWD. */
function crowdPick(type: PredictionType, guesses: readonly PredictionGuess[]): string | null {
  const counts = new Map<string, number>();
  for (const g of guesses) {
    const d = comparableDriver(type, g);
    if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total < MIN_CROWD) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

/**
 * The weekend Communities is living in (see pickWeekend): its sessions with which have results, each session's top
 * three, and, for the sessions your communities ran settled rounds on (pole for qualifying, the winner for the race),
 * how many of their entries called it. Pass `groupIds` to count one community's entries rather than all of yours.
 */
export async function getCommunityWeekend(uid: string, season: number, nowMs = Date.now(), { groupIds }: { groupIds?: string[] } = {}): Promise<CommunityWeekendData> {
  const entries = await getCalendarEntriesByYear(season);
  const entry = pickWeekend(entries, nowMs);
  if (!entry) return null;
  const race = await getRace(season, entry.round);
  const [stages, roster, calledIt] = await Promise.all([
    race?.id ? getQualifyingStages(race.id) : Promise.resolve([]),
    race ? getRaceRoster(race).catch(() => []) : Promise.resolve([]),
    race?.id ? calledItFor(uid, race.id, groupIds) : Promise.resolve({}),
  ]);
  const sessions = sessionsOf(entry, {
    FP1: !!race?.practice?.FP1,
    FP2: !!race?.practice?.FP2,
    FP3: !!race?.practice?.FP3,
    SQ: stages.some((r) => r.session === "SQ"),
    S: !!race?.sprintResults?.length,
    Q: stages.some((r) => r.session === "Q") || !!race?.poleSitter,
    R: race?.status === "completed" && !!race.results?.length,
  });
  const results = sessionResults(race, stages, new Map(roster.map((r) => [r.driver, { name: r.driverName, team: r.team }])));
  return { year: entry.year, round: entry.round, raceId: race?.id ?? null, raceName: entry.name ?? race?.name ?? "", sessions, results, calledIt };
}

/** How your communities' entries did on this race's settled rounds: pole for qualifying; the winner (a winner round,
 * else a podium's winner slot) for the race. `scope` narrows it to given communities (one community's own page). */
async function calledItFor(uid: string, raceId: string, scope?: string[]): Promise<Partial<Record<SessionKey, CalledIt>>> {
  const groupIds = scope ?? (await memberGroupIds(uid));
  if (!groupIds.length) return {};
  const { data: rounds, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_predictions").select("id, type, correct_answer").eq("race_id", raceId).eq("status", "resolved").in("group_id", groupIds).in("type", ["pole", "winner", "podium"]),
  );
  if (error) throw new Error(`calledItFor(${raceId}): ${error.message}`);
  if (!rounds?.length) return {};
  const { data: entries, error: entriesError } = await queryWithRetry(() => supabaseAdmin.from("group_prediction_entries").select("prediction_id, guess").in("prediction_id", rounds.map((r) => r.id as string)));
  if (entriesError) throw new Error(`calledItFor(${raceId}): ${entriesError.message}`);

  const tally = (types: PredictionType[]) => {
    let correct = 0;
    let total = 0;
    for (const r of rounds.filter((x) => types.includes(x.type as PredictionType))) {
      const type = r.type as PredictionType;
      const answer = comparableDriver(type, (r.correct_answer as PredictionGuess | null) ?? null);
      if (!answer) continue;
      for (const e of (entries ?? []).filter((x) => x.prediction_id === r.id)) {
        total++;
        if (comparableDriver(type, e.guess as PredictionGuess) === answer) correct++;
      }
    }
    return total ? { correct, total } : null;
  };
  const out: Partial<Record<SessionKey, CalledIt>> = {};
  const pole = tally(["pole"]);
  if (pole) out.Q = { label: "called pole", ...pole };
  const win = tally(["winner"]) ?? tally(["podium"]);
  if (win) out.R = { label: "called the win", ...win };
  return out;
}

export type CrowdVsModel = {
  season: number;
  overall: { crowd: number; model: number; rounds: number };
  byCommunity: { id: string; name: string; avatarUrl: string | null; crowd: number; model: number; rounds: number }[];
};

/**
 * Your communities against the Apex model, this season: over every settled round (winner, pole, fastest lap, and a
 * podium's winner slot) where the community had a crowd (MIN_CROWD entries) and the model had a pick, who called it.
 * The model's race picks come from after qualifying while the crowd locks in before it, which the widget says.
 */
export async function getCrowdVsModel(groups: readonly { id: string; name: string; avatarUrl: string | null }[], season: number): Promise<CrowdVsModel> {
  const empty: CrowdVsModel = { season, overall: { crowd: 0, model: 0, rounds: 0 }, byCommunity: [] };
  if (!groups.length) return empty;
  const { data: rounds, error } = await queryWithRetry(() =>
    supabaseAdmin
      .from("group_predictions")
      .select("id, group_id, race_id, type, correct_answer")
      .in("group_id", groups.map((g) => g.id))
      .eq("status", "resolved")
      .like("race_id", `${season}_%`)
      .in("type", ["winner", "pole", "fastest_lap", "podium"]),
  );
  if (error) throw new Error(`getCrowdVsModel: ${error.message}`);
  if (!rounds?.length) return empty;

  const { data: entries, error: entriesError } = await queryWithRetry(() => supabaseAdmin.from("group_prediction_entries").select("prediction_id, guess").in("prediction_id", rounds.map((r) => r.id as string)));
  if (entriesError) throw new Error(`getCrowdVsModel: ${entriesError.message}`);
  const guessesByRound = new Map<string, PredictionGuess[]>();
  for (const e of entries ?? []) guessesByRound.set(e.prediction_id as string, [...(guessesByRound.get(e.prediction_id as string) ?? []), e.guess as PredictionGuess]);

  const raceIds = [...new Set(rounds.map((r) => r.race_id as string))];
  const raceById = new Map(await Promise.all(raceIds.map(async (id) => [id, await getRaceById(id).catch(() => null)] as const)));

  const settled: CrowdModelRound[] = rounds.map((r) => {
    const type = r.type as PredictionType;
    return {
      groupId: r.group_id as string,
      crowd: crowdPick(type, guessesByRound.get(r.id as string) ?? []),
      model: modelPickFor(type, raceById.get(r.race_id as string) ?? null)?.driver ?? null,
      answer: comparableDriver(type, (r.correct_answer as PredictionGuess | null) ?? null),
    };
  });

  return {
    season,
    overall: crowdModelRecord(settled),
    byCommunity: groups
      .map((g) => ({ id: g.id, name: g.name, avatarUrl: g.avatarUrl, ...crowdModelRecord(settled.filter((s) => s.groupId === g.id)) }))
      .filter((g) => g.rounds > 0)
      .sort((a, b) => b.crowd - b.model - (a.crowd - a.model) || b.rounds - a.rounds),
  };
}

/** The Apex model's pick for each round type of these races, for the feed's cards. */
export async function getModelPicks(raceIds: readonly string[]): Promise<Record<string, Partial<Record<PredictionType, ModelPick>>>> {
  const out: Record<string, Partial<Record<PredictionType, ModelPick>>> = {};
  await Promise.all(
    [...new Set(raceIds)].map(async (id) => {
      const race = await getRaceById(id).catch(() => null);
      const picks: Partial<Record<PredictionType, ModelPick>> = {};
      for (const type of ["winner", "podium", "pole", "fastest_lap"] as PredictionType[]) {
        const pick = modelPickFor(type, race);
        if (pick) picks[type] = pick;
      }
      out[id] = picks;
    }),
  );
  return out;
}
