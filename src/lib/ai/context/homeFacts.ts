import type { PersonalHomeData, PublicHomeData } from "@/lib/homeData";
import { formatSessionSchedule } from "./raceWeekend";

/**
 * The signed-in home page's own numbers, for Ask Apex. The home scope used to send only the AI
 * briefing, which is prose and deliberately doesn't repeat what's on screen (homepagePrompt.ts) -
 * so "what's the model's win chance for Norris?", "what did I pick?" and "when's qualifying?" all
 * failed on a page showing the answers. Compact on purpose: it travels with that briefing inside the
 * route's 6,000-character cap for a client context, and goes first so trimming never touches it.
 *
 * Built in the browser from what PersonalHome already has; nothing here is fetched.
 */
export type HomeApexFacts = {
  nextRace?: string;
  /** In the viewer's own time zone, as the page shows it. */
  schedule?: string[];
  /** The model's top five: "NOR win 44%, podium 81%". */
  modelChances?: string[];
  /** The top ten of the starting grid, once qualifying has run. */
  grid?: string[];
  yourPick: string;
  yourPredictionRecord?: string;
  /** The leader, and where the user's favourites stand. */
  championship?: string[];
  /** The page's own headline facts ("Kimi Antonelli leads the 2026 championship"). */
  headlines?: string[];
};

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function buildHomeApexFacts(publicData: PublicHomeData, personalData: PersonalHomeData, timeZone?: string): HomeApexFacts {
  const race = publicData.nextRace;
  const recap = publicData.seasonRecap;
  const facts: HomeApexFacts = {
    yourPick: personalData.myPick
      ? `You picked ${personalData.myPick.predictedWinner} to win, with a podium of ${personalData.myPick.predictedPodium.join(", ")}.`
      : "You haven't made a pick for the next race.",
  };

  if (race) {
    facts.nextRace = `${race.name}, round ${race.round}${recap?.totalRounds ? ` of ${recap.totalRounds}` : ""}`;
    const sessions = publicData.calendarEntry?.sessions;
    if (sessions?.length) facts.schedule = formatSessionSchedule(sessions, timeZone);
    const sim = race.simulation?.drivers;
    if (sim?.length) {
      facts.modelChances = [...sim]
        .sort((a, b) => b.p1 - a.p1)
        .slice(0, 5)
        .map((d) => `${d.driver} win ${pct(d.p1)}, podium ${pct(d.podium)}`);
    } else if (race.prediction?.finishOrder?.length) {
      facts.modelChances = [...race.prediction.finishOrder]
        .sort((a, b) => a.predictedPosition - b.predictedPosition)
        .slice(0, 5)
        .map((d) => `predicted P${d.predictedPosition} ${d.driver}`);
    }
    if (race.inputs?.length) {
      facts.grid = [...race.inputs]
        .sort((a, b) => a.grid - b.grid)
        .slice(0, 10)
        .map((entry) => `P${entry.grid} ${entry.driver}`);
    }
  }

  const record = personalData.predictionPerformance;
  if (record?.winner.total) {
    facts.yourPredictionRecord = `Winner right ${record.winner.correct} of ${record.winner.total}; podium places right ${record.podiumSlots.correct} of ${record.podiumSlots.total}.`;
  }

  if (recap) {
    const lines: string[] = [];
    if (recap.driverLeader) {
      lines.push(`Leader: ${recap.driverLeader.driverName}, ${recap.driverLeader.points} pts${recap.driverGapToSecond != null ? ` (${recap.driverGapToSecond} clear)` : ""}`);
    }
    if (recap.teamLeader) lines.push(`Leading team: ${recap.teamLeader.team}, ${recap.teamLeader.points} pts`);
    for (const d of recap.favoriteDriverRanks ?? []) lines.push(`Your driver ${d.name}: P${d.rank}, ${d.points} pts`);
    for (const t of recap.favoriteTeamRanks ?? []) lines.push(`Your team ${t.name}: P${t.rank}, ${t.points} pts`);
    lines.push(`${recap.roundsCompleted} of ${recap.totalRounds} rounds run`);
    facts.championship = lines;
  }

  const headlines = publicData.facts?.map((f) => f.text).filter(Boolean);
  if (headlines?.length) facts.headlines = headlines;
  return facts;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Fits the home page's client context into `budget` characters by trimming its AI briefing
 * (`snapshot`, prose): long strings first, then whole sections from the end. The page's own numbers
 * (`facts`) are never trimmed. Without this the route's final hard slice cut the JSON mid-value, so
 * a long briefing reached the model with its last sections - and broken JSON - missing.
 */
export function fitHomeContext(context: Record<string, unknown>, budget: number): Record<string, unknown> {
  const size = (c: Record<string, unknown>) => JSON.stringify(c).length;
  if (size(context) <= budget || !isObject(context.snapshot)) return context;
  const clip = (value: unknown, max: number): unknown =>
    typeof value === "string"
      ? value.length > max
        ? `${value.slice(0, max)}…`
        : value
      : Array.isArray(value)
        ? value.map((v) => clip(v, max))
        : isObject(value)
          ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clip(v, max)]))
          : value;
  let snapshot = context.snapshot;
  for (const max of [400, 240, 160]) {
    snapshot = clip(context.snapshot, max) as Record<string, unknown>;
    if (size({ ...context, snapshot }) <= budget) return { ...context, snapshot };
  }
  const trimmed = { ...snapshot };
  const keys = Object.keys(trimmed);
  while (keys.length && size({ ...context, snapshot: trimmed }) > budget) delete trimmed[keys.pop() as string];
  return { ...context, snapshot: trimmed };
}
