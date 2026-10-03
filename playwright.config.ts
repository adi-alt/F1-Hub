import { defineConfig, devices } from "@playwright/test";

// Browser tests (audit R-21): the app, built and started for real, against the STAGING database and its
// synthetic users (scripts/staging/seed.mjs). A test signs in by minting the app's own session cookie
// for a seeded user, with a SESSION_SECRET that exists only for this run, so nothing here can sign in to
// anything real. AI routes are blocked in the browser: a test can never trigger a model call.
//
//   source <staging env>; npx next build; npx playwright test
const PORT = Number(process.env.E2E_PORT ?? 3100);
process.env.SESSION_SECRET ??= "e2e-session-secret-only-for-this-run-000000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, contextOptions: { reducedMotion: "reduce" }, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } },
    { name: "phone", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  webServer: { command: `npx next start -p ${PORT}`, url: `http://localhost:${PORT}/`, reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
