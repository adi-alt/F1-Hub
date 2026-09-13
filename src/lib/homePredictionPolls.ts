// The homepage's own read of group_predictions/group_prediction_entries — a real, existing
// backend (see supabase/schema.sql), just never aggregated into "% of entrants guessed X" before.
// Deliberately NOT added to groupPredictions.ts: that file is Groups' own data layer, off-limits
// for this redesign (see the homepage redesign brief's own scope boundary). This queries the same
// tables listMyOpenPredictions() already reads, the same way, just grouped into an option
// breakdown instead of a bare list — a narrowly-scoped new homepage data function, not a
// modification of Groups' implementation.

import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PredictionGuess, PredictionStatus, PredictionType } from "@/lib/groupPredictionTypes";
import { predictionTypeLabels } from "@/lib/groupPredictionTypes";

const RECENT_WINDOW_DAYS = 7;

export type PollOption = { label: string; count: number; pct: number };

export type PredictionPoll = {
  id: string;
  groupId: string;
  groupName: string;
  raceId: string;
  raceName: string;
  type: PredictionType;
  typeLabel: string;
  status: PredictionStatus;
  createdAt: string;
  totalEntries: number;
  options: PollOption[];
};

function guessLabel(type: PredictionType, guess: PredictionGuess): string {
  if (type === "podium") return (guess as [string, string, string]).join(" - ");
  if (type === "dnf_count") return `${guess} DNF${guess === 1 ? "" : "s"}`;
  return String(guess);
}

const MAX_OPTIONS_SHOWN = 4;

/** Real prediction polls from groups the user belongs to, created in the last 7 days — the
 * homepage's "Latest Prediction Polls" widget. Each option's count/pct comes straight from real
 * group_prediction_entries rows; a poll with zero entries still appears (real information: "no one
 * has entered yet"), just with an empty options list. */
export async function getRecentPredictionPolls(uid: string, limit = 4): Promise<PredictionPoll[]> {
  const { data: memberships, error: membershipsError } = await queryWithRetry(() =>
    supabaseAdmin.from("group_members").select("group_id").eq("user_id", uid),
  );
  if (membershipsError) throw new Error(`getRecentPredictionPolls: ${membershipsError.message}`);
  const groupIds = [...new Set((memberships ?? []).map((m) => m.group_id as string))];
  if (groupIds.length === 0) return [];

  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 86_400_000).toISOString();
  const { data: predictions, error } = await queryWithRetry(() =>
    supabaseAdmin
      .from("group_predictions")
      .select("*")
      .in("group_id", groupIds)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  if (error) throw new Error(`getRecentPredictionPolls: ${error.message}`);
  if (!predictions?.length) return [];

  const predictionIds = predictions.map((p) => p.id as string);
  const raceIds = [...new Set(predictions.map((p) => p.race_id as string))];
  const predictionGroupIds = [...new Set(predictions.map((p) => p.group_id as string))];
  const [{ data: races, error: racesError }, { data: groupsData, error: groupsError }, { data: entries, error: entriesError }] = await Promise.all([
    queryWithRetry(() => supabaseAdmin.from("races").select("id, name").in("id", raceIds)),
    queryWithRetry(() => supabaseAdmin.from("groups").select("id, name").in("id", predictionGroupIds)),
    queryWithRetry(() => supabaseAdmin.from("group_prediction_entries").select("prediction_id, guess").in("prediction_id", predictionIds)),
  ]);
  if (racesError) throw new Error(`getRecentPredictionPolls: ${racesError.message}`);
  if (groupsError) throw new Error(`getRecentPredictionPolls: ${groupsError.message}`);
  if (entriesError) throw new Error(`getRecentPredictionPolls: ${entriesError.message}`);

  const raceNameById = new Map((races ?? []).map((r) => [r.id as string, r.name as string]));
  const groupNameById = new Map((groupsData ?? []).map((g) => [g.id as string, g.name as string]));

  const entriesByPrediction = new Map<string, PredictionGuess[]>();
  for (const e of entries ?? []) {
    const pid = e.prediction_id as string;
    const list = entriesByPrediction.get(pid) ?? [];
    list.push(e.guess as PredictionGuess);
    entriesByPrediction.set(pid, list);
  }

  return predictions.map((p) => {
    const type = p.type as PredictionType;
    const guesses = entriesByPrediction.get(p.id as string) ?? [];
    const total = guesses.length;

    const countByLabel = new Map<string, number>();
    for (const g of guesses) {
      const label = guessLabel(type, g);
      countByLabel.set(label, (countByLabel.get(label) ?? 0) + 1);
    }
    const options: PollOption[] = [...countByLabel.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_OPTIONS_SHOWN)
      .map(([label, count]) => ({ label, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }));

    return {
      id: p.id as string,
      groupId: p.group_id as string,
      groupName: groupNameById.get(p.group_id as string) ?? "a group",
      raceId: p.race_id as string,
      raceName: raceNameById.get(p.race_id as string) ?? (p.race_id as string),
      type,
      typeLabel: predictionTypeLabels[type],
      status: p.status as PredictionStatus,
      createdAt: p.created_at as string,
      totalEntries: total,
      options,
    };
  });
}
