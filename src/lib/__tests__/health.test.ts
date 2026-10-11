import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateHealth, STALE_AFTER_MINUTES, type PipelineRunRow } from "../observability/health";

const NOW = new Date("2026-10-04T12:00:00Z");
const run = (job: string, status: PipelineRunRow["status"], startedAt: string, finishedAt: string | null = startedAt): PipelineRunRow => ({ job, status, started_at: startedAt, finished_at: finishedAt });

describe("evaluateHealth (audit R-13)", () => {
  it("is ok, without inventing pipeline health, while no runs are recorded yet", () => {
    const h = evaluateHealth([], "ok", NOW);
    assert.equal(h.status, "ok");
    assert.equal(h.pipeline, null);
  });

  it("reports the age of each job's last success", () => {
    const h = evaluateHealth([run("fetch-races", "success", "2026-10-04T10:30:00Z")], "ok", NOW);
    assert.equal(h.status, "ok");
    assert.equal(h.pipeline?.["fetch-races"].lastSuccessAgeMinutes, 90);
  });

  it("degrades when the last success is older than the job's limit", () => {
    const h = evaluateHealth([run("fetch-races", "success", "2026-10-04T01:00:00Z")], "ok", NOW);
    assert.equal(h.status, "degraded");
    assert.match(h.problems[0], /fetch-races last succeeded 11h ago \(limit 8h\)/);
  });

  it("counts consecutive failures since the last success, and degrades at three", () => {
    const rows = [
      run("fetch-races", "success", "2026-10-04T08:00:00Z"),
      run("fetch-races", "failed", "2026-10-04T09:00:00Z"),
      run("fetch-races", "failed", "2026-10-04T10:00:00Z"),
      run("fetch-races", "failed", "2026-10-04T11:00:00Z"),
    ];
    const h = evaluateHealth(rows, "ok", NOW);
    assert.equal(h.pipeline?.["fetch-races"].failuresSinceSuccess, 3);
    assert.equal(h.pipeline?.["fetch-races"].lastStatus, "failed");
    assert.ok(h.problems.some((p) => /failed 3 times in a row/.test(p)));
  });

  it("a job that has only ever failed is degraded", () => {
    const h = evaluateHealth([run("sync-calendar", "failed", "2026-10-04T11:00:00Z")], "ok", NOW);
    assert.ok(h.problems.some((p) => /sync-calendar has no successful run recorded/.test(p)));
  });

  it("a database that doesn't answer is degraded", () => {
    const h = evaluateHealth([], "error", NOW);
    assert.equal(h.status, "degraded");
    assert.deepEqual(h.problems, ["the database did not answer"]);
  });
  it("knows every job the pipeline records, and a weekly job isn't stale between its runs", () => {
    for (const job of ["fetch-races", "train-predict", "group-scores", "data-audit", "sync-calendar"]) {
      assert.ok(STALE_AFTER_MINUTES[job], `${job} needs its own staleness limit`);
    }
    // sync-calendar ran last Monday 00:00; on Sunday evening that is ~6.8 days ago: still healthy
    const h = evaluateHealth([run("sync-calendar", "success", "2026-09-28T00:00:00Z")], "ok", new Date("2026-10-04T20:00:00Z"));
    assert.deepEqual(h.problems, []);
  });
});
