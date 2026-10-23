import { defineConfig, devices } from "@playwright/test";

// Browser tests (audit R-21): the app, built and started for real, against a database holding the synthetic
// users (scripts/staging/seed-app.mjs). A test signs in by minting the app's own session cookie for a
// seeded user, with a SESSION_SECRET that exists only for this run, so nothing here can sign in to
// anything real. AI routes are blocked in the browser: a test can never trigger a model call.
//
// Two backends (e2e/README.md): E2E_LOCAL=1 is a disposable local Postgres + PostgREST behind the
// Supabase stand-in (scripts/local-db/), which this config starts; otherwise the staging project.
//
//   source <staging env>; npx next build; npx playwright test
const PORT = Number(process.env.E2E_PORT ?? 3100);
const LOCAL = process.env.E2E_LOCAL === "1";
process.env.SESSION_SECRET ??= "e2e-session-secret-only-for-this-run-000000";
const app = { command: `npx next start -p ${PORT}`, url: `http://localhost:${PORT}/`, reuseExistingServer: !process.env.CI, timeout: 120_000 };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  // Visual baselines (e2e/design-system.spec.ts): a missing one is written, not failed, so a new primitive
  // section records its first snapshot; an existing one is compared. Baselines are per platform (CI is Linux).
  updateSnapshots: "missing",
  // UTC and en-US, so times and number formats in snapshots are the same on every machine (CI runs in UTC).
  use: { baseURL: `http://localhost:${PORT}`, timezoneId: "UTC", locale: "en-US", contextOptions: { reducedMotion: "reduce" }, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } },
    { name: "phone", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  webServer: LOCAL ? [{ command: "node scripts/local-db/supabase.mjs", url: "http://127.0.0.1:54321/", reuseExistingServer: !process.env.CI }, app] : app,
});
