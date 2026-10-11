// Cache invalidation expires entries immediately (audit R-19). revalidateTag(tag, "max") is
// stale-while-revalidate in Next 16: the next read got the old value once - a user's own write
// looked lost after router.refresh(), a new account's cached "no profile" was served again, and a
// pipeline push looked stale to the first visitor after it.
//
// Run with --experimental-test-module-mocks (see the `test` script).

import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { mockModule } from "./support/mockModule";

const calls: unknown[][] = [];
mockModule("next/cache", { revalidateTag: (...args: unknown[]) => calls.push(args), unstable_cache: (fn: unknown) => fn });

let expireTag: typeof import("../cacheTags").expireTag;
let revalidateRoute: typeof import("../../app/api/admin/revalidate/route");
before(async () => {
  ({ expireTag } = await import("../cacheTags"));
  revalidateRoute = await import("../../app/api/admin/revalidate/route");
});
beforeEach(() => {
  calls.length = 0;
});

describe("expireTag", () => {
  it("expires the tag now (expire: 0), not stale-while-revalidate", () => {
    expireTag("user-profiles");
    assert.deepEqual(calls, [["user-profiles", { expire: 0 }]]);
  });
});

describe("POST /api/admin/revalidate", () => {
  const post = (secret: string | null, tag?: string) =>
    revalidateRoute.POST(
      new Request("http://localhost/api/admin/revalidate", {
        method: "POST",
        headers: secret ? { "x-cron-secret": secret, "content-type": "application/json" } : { "content-type": "application/json" },
        body: JSON.stringify(tag ? { tag } : {}),
      }),
    );

  it("expires the pipeline's tag immediately, so the next visitor sees the new results", async () => {
    process.env.CRON_SECRET = "test-secret";
    const res = await post("test-secret", "races");
    assert.equal(res.status, 200);
    assert.deepEqual(calls, [["races", { expire: 0 }]]);
  });

  it("refuses without the secret, and expires nothing", async () => {
    process.env.CRON_SECRET = "test-secret";
    assert.equal((await post(null, "races")).status, 403);
    assert.equal((await post("wrong", "races")).status, 403);
    assert.equal(calls.length, 0);
  });
});

it("nothing outside lib/cacheTags.ts calls revalidateTag directly", () => {
  const src = path.resolve(__dirname, "../..");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__" && entry.name !== "node_modules") walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !full.endsWith(path.join("lib", "cacheTags.ts"))) {
        const code = fs.readFileSync(full, "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
        if (/\brevalidateTag\s*\(/.test(code)) offenders.push(path.relative(src, full));
      }
    }
  };
  walk(src);
  assert.deepEqual(offenders, [], "use expireTag() from lib/cacheTags.ts");
});
