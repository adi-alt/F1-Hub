import { supabaseAdmin } from "@/lib/supabase/admin";
import { notify } from "@/lib/supabase/notifications";
import { getPredictionLockTimes } from "@/lib/supabase/groupPredictions";
import { getRaceById } from "@/lib/supabase/races";
import { predictionTypeLabels, type PredictionType } from "@/lib/groupPredictionTypes";
import { gradeCall, describeCall, type PostCall } from "@/lib/postCalls";
import { raceHref } from "@/lib/routes";

/**
 * The two race-weekend emails people turn on in Settings › Notifications: a reminder while picks and rounds are
 * still open before qualifying locks them, and how their picks did once the race is over. Run every hour by
 * .github/workflows/email-jobs.yml through /api/cron/emails; each is sent once per person per race (notify's
 * dedupe key), so overlapping runs and retries never send twice.
 */

/** How far ahead of the qualifying lock the reminder goes out. */
const REMIND_WITHIN_MS = 3 * 3_600_000;
/** How long after a race its results email may still go: long enough for late settling, short enough to stay news. */
const RESULTS_WITHIN_DAYS = 4;

type RaceRow = { id: string; year: number; round: number; name: string; status: string; race_date: string | null };

const label = (type: string) => predictionTypeLabels[type as PredictionType] ?? "Prediction";

async function racesOf(year: number): Promise<RaceRow[]> {
  const { data, error } = await supabaseAdmin.from("races").select("id, year, round, name, status, race_date").eq("year", year);
  if (error) throw new Error(`raceWeekendEmails: ${error.message}`);
  return (data ?? []) as RaceRow[];
}

export async function sendRaceWeekendEmails(now = Date.now()): Promise<{ reminders: number; results: number }> {
  const races = await racesOf(new Date(now).getUTCFullYear());
  let reminders = 0;
  let results = 0;

  const upcoming = races.filter((r) => r.status !== "completed");
  const locks = await getPredictionLockTimes(upcoming.map((r) => r.id));
  for (const race of upcoming) {
    const lockAt = locks.get(race.id);
    const ms = lockAt ? Date.parse(lockAt) - now : NaN;
    if (ms > 0 && ms <= REMIND_WITHIN_MS) reminders += await remind(race, ms);
  }

  for (const race of races) {
    const age = race.race_date ? now - Date.parse(race.race_date) : NaN;
    if (race.status === "completed" && age >= 0 && age <= RESULTS_WITHIN_DAYS * 86_400_000) results += await report(race);
  }
  return { reminders, results };
}

/** Each opted-in person: which of their rounds for this race are still open and whether they've entered, and their pick. */
async function remind(race: RaceRow, msLeft: number): Promise<number> {
  const { data: people } = await supabaseAdmin.from("profiles").select("id").eq("notify_before_qualifying", true);
  const ids = (people ?? []).map((p) => p.id as string);
  if (!ids.length) return 0;

  const [{ data: memberships }, { data: rounds }, { data: picks }] = await Promise.all([
    supabaseAdmin.from("group_members").select("user_id, group_id").in("user_id", ids),
    supabaseAdmin.from("group_predictions").select("id, group_id, type").eq("race_id", race.id).eq("status", "open"),
    supabaseAdmin.from("picks").select("user_id").eq("race_id", race.id).in("user_id", ids),
  ]);
  const roundIds = (rounds ?? []).map((r) => r.id as string);
  const groupIds = [...new Set((rounds ?? []).map((r) => r.group_id as string))];
  const [{ data: entries }, { data: groups }] = await Promise.all([
    roundIds.length ? supabaseAdmin.from("group_prediction_entries").select("user_id, prediction_id").in("prediction_id", roundIds) : Promise.resolve({ data: [] as { user_id: string; prediction_id: string }[] }),
    groupIds.length ? supabaseAdmin.from("groups").select("id, name").in("id", groupIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const groupName = new Map((groups ?? []).map((g) => [g.id as string, g.name as string]));
  const entered = new Set((entries ?? []).map((e) => `${e.user_id}:${e.prediction_id}`));
  const picked = new Set((picks ?? []).map((p) => p.user_id as string));
  const hours = Math.max(1, Math.round(msLeft / 3_600_000));
  const href = raceHref(race.year, race.round, race.name);

  let sent = 0;
  for (const uid of ids) {
    const mine = new Set((memberships ?? []).filter((m) => m.user_id === uid).map((m) => m.group_id as string));
    const rows = (rounds ?? [])
      .filter((r) => mine.has(r.group_id as string))
      .map((r) => ({ label: `${groupName.get(r.group_id as string) ?? "Community"} · ${label(r.type as string)}`, value: entered.has(`${uid}:${r.id}`) ? "Entered" : "Not entered" }));
    rows.unshift({ label: "Your race pick", value: picked.has(uid) ? "Made" : "Not made" });
    const open = rows.filter((r) => r.value.startsWith("Not")).length;
    await notify([uid], {
      kind: "race_reminder",
      title: `Picks close in ${hours} ${hours === 1 ? "hour" : "hours"}`,
      body: open ? `${race.name}: qualifying locks your picks. ${open} still to do.` : `${race.name}: qualifying locks your picks. You're all set.`,
      href,
      dedupeKey: `race_reminder:${race.id}`,
      email: {
        subject: `Picks close in ${hours}h: ${race.name}`,
        preheader: open ? `${open} still to do before qualifying` : "You're all set for qualifying",
        context: { label: `Round ${race.round} · ${race.name}` },
        eyebrow: "Race weekend",
        rows,
        cta: "Make your picks",
        reason: "You asked for a reminder before qualifying locks.",
      },
    });
    sent++;
  }
  return sent;
}

/** Each opted-in person who took part in this race: every settled round, their race pick against the result, their calls. */
async function report(race: RaceRow): Promise<number> {
  const { data: people } = await supabaseAdmin.from("profiles").select("id").eq("notify_on_results", true);
  const ids = (people ?? []).map((p) => p.id as string);
  if (!ids.length) return 0;

  const [doc, { data: rounds }, { data: picks }, { data: calls }] = await Promise.all([
    getRaceById(race.id),
    supabaseAdmin.from("group_predictions").select("id, group_id, type, status").eq("race_id", race.id),
    supabaseAdmin.from("picks").select("user_id, predicted_winner, predicted_podium").eq("race_id", race.id).in("user_id", ids),
    supabaseAdmin.from("post_calls").select("user_id, kind, race_id, driver, rival, threshold, locks_at").eq("race_id", race.id).in("user_id", ids),
  ]);
  const results = doc?.results ?? [];
  if (!results.length) return 0; // no classification yet: the next run tries again
  const winner = results.find((r) => r.finishPosition === 1)?.driver ?? null;
  const podium = results.filter((r) => r.finishPosition <= 3).map((r) => r.driver);

  const roundIds = (rounds ?? []).map((r) => r.id as string);
  const groupIds = [...new Set((rounds ?? []).map((r) => r.group_id as string))];
  const [{ data: entries }, { data: groups }] = await Promise.all([
    roundIds.length ? supabaseAdmin.from("group_prediction_entries").select("user_id, prediction_id, points_awarded").in("prediction_id", roundIds).in("user_id", ids) : Promise.resolve({ data: [] as { user_id: string; prediction_id: string; points_awarded: number | null }[] }),
    groupIds.length ? supabaseAdmin.from("groups").select("id, name").in("id", groupIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const roundById = new Map((rounds ?? []).map((r) => [r.id as string, r]));
  const groupName = new Map((groups ?? []).map((g) => [g.id as string, g.name as string]));
  const href = raceHref(race.year, race.round, race.name);

  let sent = 0;
  for (const uid of ids) {
    const mine = (entries ?? []).filter((e) => e.user_id === uid);
    const pick = (picks ?? []).find((p) => p.user_id === uid);
    const myCalls = (calls ?? []).filter((c) => c.user_id === uid);
    if (!mine.length && !pick && !myCalls.length) continue; // didn't take part
    // Wait until every round they entered is settled, so the email is the whole story.
    if (mine.some((e) => roundById.get(e.prediction_id as string)?.status !== "resolved")) continue;

    const rows: { label: string; value: string }[] = [];
    let points = 0;
    for (const e of mine) {
      const r = roundById.get(e.prediction_id as string)!;
      const won = (e.points_awarded as number | null) ?? 0;
      points += won;
      rows.push({ label: `${groupName.get(r.group_id as string) ?? "Community"} · ${label(r.type as string)}`, value: won > 0 ? `+${won}` : "0" });
    }
    if (pick) {
      rows.push({ label: `Your winner pick: ${pick.predicted_winner}`, value: pick.predicted_winner === winner ? "Right" : "Wrong" });
      const hits = ((pick.predicted_podium as string[]) ?? []).filter((d) => podium.includes(d)).length;
      rows.push({ label: "Your podium pick", value: `${hits} of 3` });
    }
    for (const c of myCalls) {
      const call: PostCall = { kind: c.kind as PostCall["kind"], raceId: c.race_id as string, driver: c.driver as string | null, rival: c.rival as string | null, threshold: c.threshold as number | null, locksAt: c.locks_at as string };
      const verdict = doc ? gradeCall(call, doc).status : "pending";
      if (verdict === "correct" || verdict === "incorrect") rows.push({ label: `Your call: ${describeCall(call)}`, value: verdict === "correct" ? "Right" : "Wrong" });
    }

    await notify([uid], {
      kind: "race_results",
      title: mine.length ? `Your ${race.name}: ${points > 0 ? `+${points} points` : "no points this time"}` : `How your ${race.name} picks did`,
      body: `Winner: ${winner ?? "-"}. Podium: ${podium.join(", ") || "-"}.`,
      href,
      dedupeKey: `race_results:${race.id}`,
      email: {
        subject: mine.length ? `Your ${race.name}: ${points > 0 ? `+${points} pts` : "no points this time"}` : `How your ${race.name} picks did`,
        preheader: `Winner ${winner ?? "-"} · ${rows.length} results for you`,
        context: { label: `Round ${race.round} · ${race.name}` },
        eyebrow: `Results · ${race.name}`,
        big: points > 0 ? { value: `+${points}`, unit: "points" } : undefined,
        rows,
        cta: "See the race",
        reason: "You asked for results after races you picked for.",
      },
    });
    sent++;
  }
  return sent;
}
