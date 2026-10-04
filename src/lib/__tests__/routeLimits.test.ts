// Which routes are rate limited, and by which policy (audit R-14, SEC-13): pinned, so a limit can't be
// dropped from a route by accident. Each entry is the policy its handler must apply.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { POLICIES, type PolicyName } from "../rateLimit";

const API = path.join(process.cwd(), "src/app/api");
const ROUTES: Record<string, PolicyName> = {
  "username/check": "usernameCheck",
  "link-preview": "linkPreview",
  "gifs/search": "gifSearch",
  posts: "postCreate",
  "posts/media": "upload",
  "posts/[postId]/comments": "commentCreate",
  "posts/[postId]/vote": "vote",
  "posts/[postId]/comments/[commentId]/vote": "vote",
  groups: "groupCreate",
  "groups/[id]/posts": "postCreate",
  "groups/[id]/join": "groupJoin",
  "groups/[id]/visit": "groupVisit",
  "groups/[id]/invite": "invite",
  "groups/[id]/invites": "invite",
  "users/invite": "invite",
  "groups/[id]/avatar": "upload",
  "groups/[id]/banner": "upload",
  "groups/[id]/predictions": "predictionCreate",
};

describe("rate-limited routes", () => {
  for (const [route, policy] of Object.entries(ROUTES)) {
    it(`${route} applies ${policy}`, () => {
      const source = fs.readFileSync(path.join(API, route, "route.ts"), "utf8");
      assert.match(source, new RegExp(`limitRequest\\(request, "${policy}"`));
      assert.match(source, /if \(limited\) return limited;/);
    });
  }

  it("every policy is used by at least one route, or by the AI guard", () => {
    const aiPolicies = new Set(["aiBurst", "aiDaily", "aiAnonymous"]);
    const used = new Set(Object.values(ROUTES));
    for (const name of Object.keys(POLICIES)) assert.ok(used.has(name as PolicyName) || aiPolicies.has(name), `${name} is defined but nothing applies it`);
  });

  it("every AI route goes through the durable guard", () => {
    const aiDir = path.join(API, "ai");
    for (const dir of fs.readdirSync(aiDir)) {
      const source = fs.readFileSync(path.join(aiDir, dir, "route.ts"), "utf8");
      assert.match(source, /await (guardAIExecution|checkUserRateLimit)\(/, `${dir} has no durable AI limit`);
    }
  });
});
