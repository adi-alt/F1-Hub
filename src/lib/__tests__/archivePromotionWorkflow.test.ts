// The December archive-promotion job (audit R-22): scheduled for the season's end only, one run at a time,
// bounded, and never able to run with a year or flag injected into the shell.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const yml = fs.readFileSync(path.join(process.cwd(), ".github/workflows/archive-promotion.yml"), "utf8");

describe("archive-promotion.yml", () => {
  it("runs Mondays in December and January, and on demand", () => {
    assert.match(yml, /cron: "0 6 \* 12,1 1"/);
    assert.match(yml, /workflow_dispatch:/);
  });

  it("is serialized, time-limited and read-only", () => {
    assert.match(yml, /concurrency:\n {2}group: archive-promotion\n {2}cancel-in-progress: false/);
    assert.match(yml, /timeout-minutes: \d+/);
    assert.match(yml, /permissions:\n {2}contents: read/);
  });

  it("passes the manual inputs through env vars, never interpolated into the script", () => {
    const run = yml.slice(yml.indexOf("run: |"), yml.indexOf("env:", yml.indexOf("run: |")));
    assert.ok(!run.includes("${{"), "workflow expressions inside a run: block are a shell injection");
    assert.match(yml, /YEAR: \$\{\{ github\.event\.inputs\.year \}\}/);
  });

  it("is wired to the script that decides by data, and the script runs the archive steps in order", () => {
    assert.match(yml, /python promote_season\.py/);
    const script = fs.readFileSync(path.join(process.cwd(), "pipeline/promote_season.py"), "utf8");
    const order = ["fetch_archive.py", "enrich_archive.py", "enrich_archive_circuits.py", "enrich_archive_laps.py", "enrich_archive_entities.py"].map((s) => script.indexOf(`"${s}"`));
    assert.ok(order.every((i) => i > 0) && [...order].sort((a, b) => a - b).join() === order.join(), "steps out of order or missing");
  });
});
