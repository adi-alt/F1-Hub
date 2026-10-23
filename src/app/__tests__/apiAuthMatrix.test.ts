// The API auth matrix (audit R-21): every handler of every route under src/app/api is called with no
// session, no credential and an empty JSON body, and must refuse. Route files are enumerated from disk,
// so a new route is covered the moment it exists: it either refuses a signed-out caller with 401, or is
// listed below with the reason it answers differently.
//
// The session reads as signed out, the database client is replaced so nothing can be read past a missing
// check, and fetch is stubbed so no handler can reach the network. Run with --experimental-test-module-mocks
// (see the `test` script).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { mockModule } from "../../lib/__tests__/support/mockModule";

const API = path.join(process.cwd(), "src/app/api");

/** Routes that answer a signed-out caller with something other than 401, by design. Key: "<route> <METHOD>". */
const EXPECTED: Record<string, { status: number; reason: string } | { public: string }> = {
  // A credential other than the session.
  "/api/admin/revalidate POST": { status: 403, reason: "automation only: needs the CRON_SECRET bearer, never a session" },
  "/api/cron/emails POST": { status: 403, reason: "automation only: needs the CRON_SECRET bearer, never a session" },
  "/api/admin/race-photos POST": { status: 404, reason: "site admins only, and hidden: anyone else gets Not found" },
  // Public by design.
  "/api/health GET": { public: "uptime probe" },
  "/api/auth/start POST": { public: "sign-in flow: sends the email code (rate limited)" },
  "/api/auth/otp/verify POST": { public: "sign-in flow: checks the email code (rate limited)" },
  "/api/auth/complete-signup POST": { public: "sign-up flow: finishes a verified sign-up (rate limited)" },
  "/api/auth/signup-options GET": { public: "sign-up flow: the drivers/teams/tracks to choose from" },
  "/api/auth/me GET": { public: "answers { signedIn: false } for a visitor" },
  "/api/auth/session DELETE": { public: "sign-out is idempotent" },
  "/api/username/check GET": { public: "sign-up flow: is a username free (rate limited)" },
  "/api/notifications/unsubscribe GET": { public: "the email link: authorised by its signed token, not a session" },
  "/api/notifications/unsubscribe POST": { public: "one-click unsubscribe: authorised by its signed token, not a session" },
  "/api/groups GET": { public: "community discovery is open to visitors" },
  "/api/picks GET": { public: "answers { pick: null } for a visitor" },
  "/api/ai/homepage-intelligence POST": { public: "visitors get the anonymous, rate-limited summary" },
  "/api/ai/race-intelligence POST": { public: "visitors get the anonymous, rate-limited summary" },
};

const signedOut = { save: async () => {}, destroy: () => {}, updateConfig: () => {} };
mockModule("@/lib/session/getSession", { getSession: async () => signedOut });
// Anything that slips past a missing check fails loudly here instead of reading data.
const noDb = new Proxy(() => {}, { get: () => noDb, apply: () => { throw new Error("database reached without a session"); } });
mockModule("@/lib/supabase/admin", { supabaseAdmin: noDb });
globalThis.fetch = async () => {
  throw new Error("network reached without a session");
};
process.env.CRON_SECRET = "auth-matrix-test-cron-secret";

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? routeFiles(path.join(dir, e.name)) : e.name === "route.ts" ? [path.join(dir, e.name)] : []));
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const FAKE_ID = "00000000-0000-4000-8000-000000000000";

describe("API routes refuse a signed-out caller", () => {
  const files = routeFiles(API).sort();
  test("finds the route files", () => assert.ok(files.length > 50, `only ${files.length} route files found`));

  for (const file of files) {
    const route = "/api/" + path.relative(API, path.dirname(file)).split(path.sep).join("/");
    test(route, async () => {
      const mod = (await import(file)) as Record<string, unknown>;
      const handlers = METHODS.filter((m) => typeof mod[m] === "function");
      assert.ok(handlers.length > 0, `${route} exports no handler`);
      for (const method of handlers) {
        const key = `${route} ${method}`;
        const expected = EXPECTED[key];
        if (expected && "public" in expected) continue;
        const url = `http://localhost${route.replace(/\[[^\]]+\]/g, FAKE_ID)}`;
        const request = new Request(url, { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });
        const params = Promise.resolve(new Proxy({}, { get: () => FAKE_ID }));
        let status: number | string;
        try {
          status = ((await (mod[method] as (r: Request, c: unknown) => Promise<Response>)(request, { params })) as Response).status;
        } catch (err) {
          status = `threw: ${(err as Error).message}`;
        }
        assert.equal(status, expected?.status ?? 401, `${key} answered ${status} with no session`);
      }
    });
  }

  test("every allowlisted route still exists", () => {
    const keys = new Set<string>();
    for (const file of files) {
      const route = "/api/" + path.relative(API, path.dirname(file)).split(path.sep).join("/");
      for (const m of METHODS) if (new RegExp(`export (async )?(function|const) ${m}\\b`).test(fs.readFileSync(file, "utf8"))) keys.add(`${route} ${m}`);
    }
    assert.deepEqual(Object.keys(EXPECTED).filter((k) => !keys.has(k)), []);
  });
});
