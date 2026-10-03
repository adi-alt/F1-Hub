// The browser-test workflow can read staging and nothing else (audit R-21).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const yml = fs.readFileSync(path.join(process.cwd(), ".github/workflows/e2e.yml"), "utf8");
const globalSetup = fs.readFileSync(path.join(process.cwd(), "e2e/global-setup.ts"), "utf8");

describe("e2e.yml", () => {
  it("runs in the staging environment, never the production one, and not for forks", () => {
    assert.match(yml, /environment: staging\b/);
    assert.doesNotMatch(yml, /production-db|opnfquuowxkabtqxxraa/);
    assert.match(yml, /head\.repo\.full_name == github\.repository/);
  });

  it("uses a session secret that exists only for the run, and a model key that can call nothing", () => {
    assert.match(yml, /SESSION_SECRET: e2e-\$\{\{ github\.run_id \}\}-/);
    assert.match(yml, /NVIDIA_API_KEY: e2e-no-model-calls/);
  });

  it("has a read-only token", () => {
    assert.match(yml, /permissions:\n {2}contents: read/);
  });
});

describe("e2e global setup", () => {
  it("refuses any project but staging", () => {
    assert.match(globalSetup, /wmdgbmlpvszyapewygvs/);
    assert.match(globalSetup, /e2e runs against the staging project only/);
  });
});
