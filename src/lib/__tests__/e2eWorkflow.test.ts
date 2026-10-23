// The browser-test workflow reads a disposable local database or staging, and nothing else (audit R-21).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const yml = fs.readFileSync(path.join(process.cwd(), ".github/workflows/e2e.yml"), "utf8");
const globalSetup = fs.readFileSync(path.join(process.cwd(), "e2e/global-setup.ts"), "utf8");
const local = yml.slice(yml.indexOf("\n  e2e:"), yml.indexOf("\n  e2e-staging:"));
const staging = yml.slice(yml.indexOf("\n  e2e-staging:"));

describe("e2e.yml", () => {
  it("runs on every pull request against a disposable database, with no secrets", () => {
    assert.doesNotMatch(local, /secrets\.|environment:|STAGING_ENABLED/);
    assert.match(local, /image: postgres:16/);
    assert.match(local, /E2E_LOCAL: "1"/);
    assert.match(local, /scripts\/local-db\/load\.ts/);
  });

  it("runs the staging variant in the staging environment only, never production, and not for forks", () => {
    assert.match(staging, /environment: staging\b/);
    assert.match(staging, /vars\.STAGING_ENABLED == 'true'/);
    assert.doesNotMatch(yml, /production-db|opnfquuowxkabtqxxraa/);
    assert.match(staging, /head\.repo\.full_name == github\.repository/);
  });

  it("uses a session secret that exists only for the run", () => {
    assert.match(local, /SESSION_SECRET: e2e-\$\{\{ github\.run_id \}\}-/);
    assert.match(staging, /SESSION_SECRET: e2e-\$\{\{ github\.run_id \}\}-/);
  });

  it("has a read-only token", () => {
    assert.match(yml, /permissions:\n {2}contents: read/);
  });
});

describe("e2e global setup", () => {
  it("refuses any project but the local test database or staging", () => {
    assert.match(globalSetup, /wmdgbmlpvszyapewygvs/);
    assert.match(globalSetup, /"127\.0\.0\.1", "localhost"/);
    assert.match(globalSetup, /e2e runs against the local test database or the staging project only/);
  });
});
