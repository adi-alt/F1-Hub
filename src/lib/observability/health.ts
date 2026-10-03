/** One row of pipeline_runs, as /api/health reads it. */
export type PipelineRunRow = { job: string; status: "running" | "success" | "failed"; started_at: string; finished_at: string | null };

export type JobHealth = {
  /** When the most recent run that succeeded finished (or started, if it didn't record an end). */
  lastSuccessAt: string | null;
  lastSuccessAgeMinutes: number | null;
  /** How the most recent run of any kind ended. */
  lastStatus: PipelineRunRow["status"] | null;
  /** Consecutive failed runs since the last success. */
  failuresSinceSuccess: number;
};

export type Health = {
  status: "ok" | "degraded";
  checkedAt: string;
  database: "ok" | "error";
  /** Null until the pipeline starts recording runs: absence of data is not reported as health. */
  pipeline: Record<string, JobHealth> | null;
  /** Why the status is degraded, in words an alert can carry. */
  problems: string[];
};

/** A job is stale once its last success is older than this. GitHub's own schedule runs the 15-minute
 * workflows every few hours in practice (audit OPS), so these are set to what that really delivers. */
export const STALE_AFTER_MINUTES: Record<string, number> = { "fetch-races": 8 * 60, "sync-calendar": 36 * 60 };
const DEFAULT_STALE_MINUTES = 36 * 60;

export function evaluateHealth(rows: readonly PipelineRunRow[], database: "ok" | "error", now: Date): Health {
  const problems: string[] = [];
  if (database === "error") problems.push("the database did not answer");

  const byJob = new Map<string, PipelineRunRow[]>();
  for (const row of rows) byJob.set(row.job, [...(byJob.get(row.job) ?? []), row]);

  let pipeline: Health["pipeline"] = null;
  if (byJob.size > 0) {
    pipeline = {};
    for (const [job, jobRows] of byJob) {
      const newestFirst = [...jobRows].sort((a, b) => b.started_at.localeCompare(a.started_at));
      const lastSuccess = newestFirst.find((r) => r.status === "success");
      const stamp = lastSuccess ? (lastSuccess.finished_at ?? lastSuccess.started_at) : null;
      const age = stamp ? Math.max(0, Math.round((now.getTime() - new Date(stamp).getTime()) / 60_000)) : null;
      const failures = newestFirst.findIndex((r) => r.status === "success");
      const failuresSinceSuccess = (failures === -1 ? newestFirst : newestFirst.slice(0, failures)).filter((r) => r.status === "failed").length;
      pipeline[job] = { lastSuccessAt: stamp, lastSuccessAgeMinutes: age, lastStatus: newestFirst[0]?.status ?? null, failuresSinceSuccess };

      const limit = STALE_AFTER_MINUTES[job] ?? DEFAULT_STALE_MINUTES;
      if (age === null) problems.push(`${job} has no successful run recorded`);
      else if (age > limit) problems.push(`${job} last succeeded ${Math.round(age / 60)}h ago (limit ${Math.round(limit / 60)}h)`);
      if (failuresSinceSuccess >= 3) problems.push(`${job} has failed ${failuresSinceSuccess} times in a row`);
    }
  }
  return { status: problems.length ? "degraded" : "ok", checkedAt: now.toISOString(), database, pipeline, problems };
}
