// The race page's layout lookup: two parameterised queries (by archive id, by races.circuit alias), merged, and
// null - never an error - when anything fails. Run with --experimental-test-module-mocks (see the `test` script).
import { before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mockModule } from "./support/mockModule";

mockModule("next/cache", { revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn });

type Result = { data: unknown; error: { message: string; code?: string } | null };
let byFilter: (f: [string, string, unknown]) => Result;
let calls: [string, string, unknown][];
let getRaceLayout: typeof import("../supabase/circuitLayouts").getRaceLayout;

const outline = Array.from({ length: 60 }, (_, i) => [Math.round(1000 * Math.cos(i / 10)), Math.round(1000 * Math.sin(i / 10))]);
const drawn = { layout_id: "silverstone-8", seasons: [2010, 2011], race_name_match: null, source: "drawn", geometry: { path: "M0 0z", viewBox: "0 0 500 500" }, attribution: "x" };
const measured = { layout_id: "silverstone@2018", seasons: [2026], race_name_match: null, source: "measured", geometry: { outline, lapLengthM: 5891, startFinish: { x: 1, y: 1 }, rotation: null, corners: [] }, attribution: "y" };

before(async () => {
  const { supabaseAdmin } = await import("../supabase/admin");
  Object.assign(supabaseAdmin as unknown as Record<string, unknown>, {
    from: (table: string) => ({
      select: () => ({
        eq: async (col: string, val: unknown) => (calls.push([table, `eq:${col}`, val]), byFilter([table, `eq:${col}`, val])),
        contains: async (col: string, val: unknown) => (calls.push([table, `contains:${col}`, val]), byFilter([table, `contains:${col}`, val])),
      }),
    }),
  });
  getRaceLayout = (await import("../supabase/circuitLayouts")).getRaceLayout;
});
beforeEach(() => {
  calls = [];
  console.warn = () => {};
});

test("an archive race: one query by circuit id, the season's layout", async () => {
  byFilter = () => ({ data: [drawn], error: null });
  const l = await getRaceLayout({ circuitId: "silverstone", circuitName: null, year: 2010, raceName: "British Grand Prix" });
  assert.equal(l?.layoutId, "silverstone-8");
  assert.deepEqual(calls, [["circuit_layouts", "eq:circuit_id", "silverstone"]]);
});

test("a current-season race: by id and by alias, merged, measured preferred", async () => {
  byFilter = ([, f]) => ({ data: f.startsWith("eq") ? [drawn] : [measured, drawn], error: null });
  const l = await getRaceLayout({ circuitId: "silverstone", circuitName: "Silverstone", year: 2026, raceName: "British Grand Prix" });
  assert.equal(l?.layoutId, "silverstone@2018");
  assert.equal(calls.length, 2);
});

test("a circuit name with filter syntax in it is passed as a value, never parsed", async () => {
  byFilter = () => ({ data: [], error: null });
  await getRaceLayout({ circuitId: null, circuitName: 'Autódromo (Pace), "X"', year: 2026, raceName: "São Paulo Grand Prix" });
  assert.deepEqual(calls, [["circuit_layouts", "contains:aliases", ['Autódromo (Pace), "X"']]]);
});

test("no layout for the season, no circuit, or no table: null", async () => {
  byFilter = () => ({ data: [drawn], error: null });
  assert.equal(await getRaceLayout({ circuitId: "silverstone", circuitName: null, year: 1999, raceName: "British Grand Prix" }), null);
  assert.equal(await getRaceLayout({ circuitId: null, circuitName: null, year: 2010, raceName: "x" }), null);
  byFilter = () => ({ data: null, error: { code: "PGRST205", message: "Could not find the table 'public.circuit_layouts'" } });
  assert.equal(await getRaceLayout({ circuitId: "silverstone", circuitName: null, year: 2010, raceName: "x" }), null);
});
