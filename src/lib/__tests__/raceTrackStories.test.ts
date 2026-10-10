// The race page's one story lookup and its fallbacks: every failure is null (the storyline's fallback route),
// never an error on the page. Run with --experimental-test-module-mocks (see the `test` script).
import { before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mockModule } from "./support/mockModule";

mockModule("next/cache", { revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn });

type Result = { data: unknown; error: { message: string; code?: string } | null };
let next: Result;
let calls: { table: string; filters: [string, unknown][]; columns: string }[];
let read: typeof import("../supabase/raceTrackStories").getRaceTrackStory;

before(async () => {
  const { supabaseAdmin } = await import("../supabase/admin");
  Object.assign(supabaseAdmin as unknown as Record<string, unknown>, {
    from: (table: string) => {
      const call = { table, filters: [] as [string, unknown][], columns: "" };
      calls.push(call);
      const q = {
        select: (columns: string) => ((call.columns = columns), q),
        eq: (col: string, val: unknown) => (call.filters.push([col, val]), q),
        maybeSingle: async () => next,
      };
      return q;
    },
  });
  read = (await import("../supabase/raceTrackStories")).getRaceTrackStory;
});
beforeEach(() => {
  calls = [];
  console.warn = () => {};
});

const outline = Array.from({ length: 60 }, (_, i) => [Math.round(1000 * Math.cos(i / 10)), Math.round(1000 * Math.sin(i / 10))]);
const good = { version: 1, lapLengthM: 628, outline, startFinish: { x: 1000, y: 0, verified: true }, rotation: null, corners: [], leadChanges: [] };

test("one query, for one race's story column only", async () => {
  next = { data: { story: good }, error: null };
  const story = await read("2026_r9_british");
  assert.equal(story?.outline.length, 60);
  assert.deepEqual(calls, [{ table: "race_track_stories", columns: "story", filters: [["race_id", "2026_r9_british"]] }]);
});

test("no story for the race: null", async () => {
  next = { data: null, error: null };
  assert.equal(await read("2026_r1_australian"), null);
});

test("the table not there yet (migration unapplied): null, not an error", async () => {
  next = { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.race_track_stories' in the schema cache" } };
  assert.equal(await read("2026_r9_british"), null);
});

test("a database error: null", async () => {
  next = { data: null, error: { code: "42501", message: "permission denied" } };
  assert.equal(await read("2026_r9_british"), null);
});

test("a malformed or unknown-version story: null, never half of it", async () => {
  next = { data: { story: { ...good, outline: outline.slice(0, 10) } }, error: null };
  assert.equal(await read("x"), null);
  next = { data: { story: { ...good, version: 2 } }, error: null };
  assert.equal(await read("x"), null);
  next = { data: { story: "not json" }, error: null };
  assert.equal(await read("x"), null);
});
