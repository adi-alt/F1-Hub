// Discover search escaping (audit SEC-21). Quotes, braces, asterisks and LIKE wildcards in a term
// used to 500 the request or turn into wildcards. The term now reaches PostgREST quoted and escaped,
// and the exact-tag clause is only added for a plain word. The fake records `.or()` without
// evaluating it, so these tests decode what was sent and check it means the literal term.
//
// Run with --experimental-test-module-mocks (see the `test` script).

import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase } from "./support/fakeSupabase";
import { mockModule } from "./support/mockModule";
import { ilikeContainsValue } from "../supabase/postgrestSearch";

mockModule("next/cache", { revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn });

let groups: typeof import("../supabase/groups");
let fake: FakeSupabase;

before(async () => {
  const { supabaseAdmin } = await import("../supabase/admin");
  groups = await import("../supabase/groups");
  Object.assign(supabaseAdmin as unknown as Record<string, unknown>, { from: (t: string) => fake.from(t) });
});

beforeEach(() => {
  fake = new FakeSupabase();
});

/** Reverses PostgREST's double-quoting and then LIKE's escaping, failing on anything that would
 * have been read as syntax: an unescaped quote inside the value, or a bare `%` / `_` / `*`. */
function literalOf(value: string): string {
  assert.ok(value.startsWith('"') && value.endsWith('"') && value.length >= 2, `quoted: ${value}`);
  let unquoted = "";
  const inner = value.slice(1, -1);
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '"') assert.fail(`unescaped quote in ${value}`);
    if (inner[i] === "\\") i++;
    unquoted += inner[i];
  }
  assert.ok(unquoted.startsWith("%") && unquoted.endsWith("%"), `contains-match: ${unquoted}`);
  const pattern = unquoted.slice(1, -1);
  let literal = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      literal += pattern[++i];
      continue;
    }
    assert.ok(c !== "%" && c !== "_" && c !== "*", `bare wildcard ${c} in ${pattern}`);
    literal += c;
  }
  return literal;
}

/** Splits an or() expression on the commas that separate clauses (not those inside a quoted value). */
function clausesOf(expr: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (quoted && c === "\\") {
      current += c + expr[++i];
      continue;
    }
    if (c === '"') quoted = !quoted;
    if (c === "," && !quoted) {
      out.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  return [...out, current];
}

const HOSTILE = ['Doe, John (F1): "quoted"', "100%_fans", "back\\slash", "{x},y}", "*", "a.b:c", "tags.cs.{admin}"];

describe("ilikeContainsValue", () => {
  test("always means the literal term (asterisks dropped)", () => {
    for (const term of [...HOSTILE, "ferrari"]) assert.equal(literalOf(ilikeContainsValue(term)), term.replace(/\*/g, ""), term);
  });
});

describe("discoverCommunities search", () => {
  test("a hostile term becomes three quoted ilike clauses and no tag clause", async () => {
    for (const term of HOSTILE) {
      fake.orCalls.length = 0;
      await groups.discoverCommunities({ query: term });
      assert.equal(fake.orCalls.length, 1, term);
      const clauses = clausesOf(fake.orCalls[0]);
      assert.deepEqual(
        clauses.map((c) => c.slice(0, c.indexOf(".ilike."))),
        ["name", "description", "topic"],
        fake.orCalls[0],
      );
      for (const clause of clauses) assert.equal(literalOf(clause.slice(clause.indexOf(".ilike.") + ".ilike.".length)), term.trim().replace(/\*/g, ""));
    }
  });

  test("a plain term also matches an exact tag", async () => {
    await groups.discoverCommunities({ query: "Ferrari Fans" });
    const clauses = clausesOf(fake.orCalls[0]);
    assert.equal(clauses.length, 4);
    assert.equal(clauses[3], "tags.cs.{ferrari fans}");
  });

  test("an over-long search is cut at 100 characters", async () => {
    await groups.discoverCommunities({ query: "a".repeat(5000) });
    const [name] = clausesOf(fake.orCalls[0]);
    assert.equal(literalOf(name.slice("name.ilike.".length)).length, 100);
  });
});
