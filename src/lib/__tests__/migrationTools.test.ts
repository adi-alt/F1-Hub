// The safety properties of the migration tooling (audit R-12): a job pointed at the wrong database
// refuses before it connects, and production changes only through an approved run from main.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const run = (script: string, env: Record<string, string>, args: string[] = []) =>
  spawnSync(process.execPath, [path.join(ROOT, script), ...args], { env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv, encoding: "utf8", timeout: 20_000 });

// Never reaches a network: the guard throws before connecting.
const URL_FOR = (ref: string) => `postgresql://postgres.${ref}:pw@127.0.0.1:1/postgres`;

describe("project guard", () => {
  it("apply-pending refuses a DATABASE_URL for a different project than EXPECTED_PROJECT_REF", () => {
    const r = run("scripts/apply-pending.mjs", { DATABASE_URL: URL_FOR("wmdgbmlpvszyapewygvs"), EXPECTED_PROJECT_REF: "opnfquuowxkabtqxxraa" }, ["--dry"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /refusing to run: DATABASE_URL is project wmdgbmlpvszyapewygvs, expected opnfquuowxkabtqxxraa/);
  });

  it("the schema check and the single-file tool refuse the same way", () => {
    const env = { DATABASE_URL: URL_FOR("wmdgbmlpvszyapewygvs"), EXPECTED_PROJECT_REF: "opnfquuowxkabtqxxraa" };
    assert.match(run("scripts/schema-fingerprint.mjs", env).stderr, /refusing to run/);
    const single = run("scripts/apply-migration.mjs", env, ["--status"]);
    assert.notEqual(single.status, 0);
    assert.match(single.stderr, /refusing to run: target is project wmdgbmlpvszyapewygvs, expected opnfquuowxkabtqxxraa/);
  });

  it("apply-pending needs a DATABASE_URL at all", () => {
    const r = run("scripts/apply-pending.mjs", {});
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /DATABASE_URL is not set/);
  });

  it("the staging scripts refuse any project but staging", () => {
    const env = { STAGING_DATABASE_URL: URL_FOR("opnfquuowxkabtqxxraa"), STAGING_SUPABASE_URL: "https://opnfquuowxkabtqxxraa.supabase.co", STAGING_SUPABASE_SECRET_KEY: "x", STAGING_SEED_PASSWORD: "x", PRODUCTION_DATABASE_URL: URL_FOR("opnfquuowxkabtqxxraa") };
    assert.match(run("scripts/staging/seed.mjs", env).stderr, /not the staging project; refusing/);
    assert.match(run("scripts/staging/copy-reference-data.mjs", env).stderr, /target is not the staging project; refusing to write|source is the staging project/);
  });
});

describe("migrate.yml", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/migrate.yml"), "utf8");
  const staging = yml.slice(yml.indexOf("\n  staging:"), yml.indexOf("\n  production:"));
  const production = yml.slice(yml.indexOf("\n  production:"));

  it("staging runs on pull requests but never for a fork, in the staging environment, pinned to the staging project", () => {
    assert.match(staging, /head\.repo\.full_name == github\.repository/);
    assert.match(staging, /environment: staging/);
    assert.match(staging, /EXPECTED_PROJECT_REF: wmdgbmlpvszyapewygvs/);
  });

  it("production runs only after staging, only from main, behind the approval environment, pinned to the production project", () => {
    assert.match(production, /needs: staging/);
    assert.match(production, /environment: production-db/);
    assert.match(production, /EXPECTED_PROJECT_REF: opnfquuowxkabtqxxraa/);
    assert.match(production, /github\.event_name == 'push' \|\| \(github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'\)/);
    assert.doesNotMatch(production, /pull_request/);
  });

  it("migrations are serialized, never cancelled mid-run, and the token is read-only", () => {
    assert.match(yml, /concurrency:\n {2}group: database-migrations\n {2}cancel-in-progress: false/);
    assert.match(yml, /permissions:\n {2}contents: read/);
  });

  it("both jobs check the schema fingerprint after migrating", () => {
    assert.equal((yml.match(/schema-fingerprint\.mjs --check/g) ?? []).length, 2);
  });
});

describe("the committed schema fingerprint", () => {
  it("covers every migration's objects and has the sections the check compares", () => {
    const fp = JSON.parse(fs.readFileSync(path.join(ROOT, "supabase/schema.fingerprint.json"), "utf8")) as Record<string, Record<string, string>>;
    for (const section of ["tables", "columns", "constraints", "indexes", "rls", "policies", "functions", "triggers", "grants"]) assert.ok(section in fp, section);
    assert.ok("group_posts.media_name" in fp.columns, "attachment metadata migration");
    assert.ok("prediction_lock_at(text)" in fp.functions, "prediction lifecycle migration");
    assert.equal(fp.rls.otp_codes, "true force=false", "RLS lockdown migration");
    assert.ok(!Object.keys(fp.tables).includes("user_invites"), "an orphan table is not part of the expected schema");
  });
});
