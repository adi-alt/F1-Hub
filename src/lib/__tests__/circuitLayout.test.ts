// The track library on the client: parsing rows, choosing a race's layout, and drawing a measured layout.
// Synthetic rows; the real library is built by pipeline/circuit_layouts.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseLayout, circuitEras, displayLayout, latestLayout, seasonLabel, layoutAsTrack, parseLayout, seasonRanges, type CircuitLayout } from "../circuitLayout";

const outline = Array.from({ length: 60 }, (_, i) => [Math.round(1000 * Math.cos(i / 10)), Math.round(1000 * Math.sin(i / 10))]);
const drawnRow = (id: string, seasons: number[], raceNameMatch: string | null = null) => ({
  layout_id: id, seasons, race_name_match: raceNameMatch, source: "drawn", geometry: { path: "M0 0L1 1z", viewBox: "0 0 500 500" }, attribution: "f1-circuits-svg by Jules Roy (MIT)",
});
const measuredRow = (id: string, seasons: number[]) => ({
  layout_id: id, seasons, race_name_match: null, source: "measured",
  geometry: { outline, lapLengthM: 5412, startFinish: { x: 1000, y: 0, verified: true }, rotation: 92, corners: [{ number: 1, letter: "", x: 0, y: 1000 }] },
  attribution: "Traced from F1 live timing car positions",
});
const parse = (rows: Record<string, unknown>[]) => rows.map(parseLayout).filter((l): l is CircuitLayout => l !== null);

test("parseLayout reads both sources and drops anything malformed", () => {
  assert.equal(parseLayout(drawnRow("bahrain-1", [2004]))?.source, "drawn");
  assert.equal(parseLayout(measuredRow("bahrain@2018", [2018]))?.source, "measured");
  assert.equal(parseLayout({ ...drawnRow("x", [2000]), geometry: { path: "" } }), null, "no path");
  assert.equal(parseLayout({ ...drawnRow("x", [2000]), geometry: { path: "M0 0", viewBox: "0 0 500" } }), null, "a bad viewBox");
  assert.equal(parseLayout({ ...measuredRow("x", [2020]), geometry: { ...measuredRow("x", [2020]).geometry, outline: outline.slice(0, 10) } }), null, "too few points");
  assert.equal(parseLayout({ ...drawnRow("x", []) }), null, "no seasons");
  assert.equal(parseLayout({ ...drawnRow("x", [2000]), source: "guessed" }), null, "an unknown source");
  assert.equal(parseLayout(undefined), null, "no row: null, never a throw");
  assert.equal(parseLayout(null), null);
});

test("chooseLayout: the race's season, measured before drawn, a named variant only for its race", () => {
  const bahrain = parse([drawnRow("bahrain-1", [2004, 2019, 2020, 2021]), drawnRow("bahrain-3", [2020], "sakhir"), measuredRow("bahrain@2018", [2018, 2019, 2020, 2021])]);
  assert.equal(chooseLayout(bahrain, 2020, "Bahrain Grand Prix")?.layoutId, "bahrain@2018", "measured over drawn");
  assert.equal(chooseLayout(bahrain, 2020, "Sakhir Grand Prix")?.layoutId, "bahrain-3", "the Sakhir GP gets the outer loop");
  assert.equal(chooseLayout(bahrain, 2004, "Bahrain Grand Prix")?.layoutId, "bahrain-1", "before measured data: the drawing");
  assert.equal(chooseLayout(bahrain, 2010, "Bahrain Grand Prix"), null, "no layout for the season: nothing, never a neighbouring season's");
  const variantOnly = parse([drawnRow("bahrain-3", [2020], "sakhir")]);
  assert.equal(chooseLayout(variantOnly, 2020, "Bahrain Grand Prix"), null, "a variant never stands in for another race");
});

test("layoutAsTrack draws a measured layout without claiming anything for this race", () => {
  const l = parseLayout(measuredRow("silverstone@2018", [2019]));
  assert.ok(l && l.source === "measured");
  const t = layoutAsTrack(l);
  assert.equal(t.startFinish.verified, false, "the timing line can move between seasons");
  assert.deepEqual(t.leadChanges, [], "no positions: nothing located");
  assert.equal(t.rotation, 92);
  assert.equal(t.corners.length, 1);
});

test("seasonRanges summarises seasons for a caption", () => {
  assert.equal(seasonRanges([1950, 1951, 1952, 1954, 1960, 1961]), "1950–1952, 1954, 1960–1961");
  assert.equal(seasonRanges([2021]), "2021");
  assert.equal(seasonRanges([2023, 2021, 2022, 2022]), "2021–2023");
});

test("latestLayout: a stand-in for a round no layout covers yet - recent, measured first, never a stale one", () => {
  const l = parse([drawnRow("sing-5", [2023, 2024, 2025]), measuredRow("sing@2023", [2023, 2024, 2025]), drawnRow("sing-old", [2008, 2009]), drawnRow("sakhir", [2025], "sakhir")]);
  assert.equal(latestLayout(l, 2026)?.layoutId, "sing@2023", "raced last season: measured over drawn, and not the variant");
  assert.equal(latestLayout(parse([drawnRow("old", [2008, 2009])]), 2026), null, "not raced for years: it may have changed");
  assert.equal(latestLayout([], 2026), null);
});

test("displayLayout: one answer for the circuits home and the circuit page - this season's, else the latest recent, else the last usual one", () => {
  const l = parse([drawnRow("sil-8", [2010, 2024, 2025]), measuredRow("sil@2023", [2023, 2024, 2025]), drawnRow("sil-1", [1950, 1951])]);
  assert.equal(displayLayout(l, 2025, "British Grand Prix")?.layoutId, "sil@2023", "this season's race: its own layout");
  assert.equal(displayLayout(l, 2026, "British Grand Prix")?.layoutId, "sil@2023", "a race to come: as last raced");
  const stale = parse([drawnRow("old-2", [2006, 2007]), drawnRow("old-1", [1990, 1991]), drawnRow("variant", [2007], "sakhir")]);
  assert.equal(displayLayout(stale, 2026, "Some Grand Prix")?.layoutId, "old-2", "data stops short of this season: the last usual layout, never a blank");
  assert.equal(displayLayout([], 2026, "Any Grand Prix"), null);
});

test("circuitEras: a drawing keeps only the seasons no measured layout covers; a variant is its own era", () => {
  const eras = circuitEras(parse([
    drawnRow("sil-8", [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]),
    drawnRow("sil-1", [1950, 1951]),
    measuredRow("sil@2018", [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]),
    drawnRow("sakhir", [2020], "sakhir"),
  ]));
  assert.deepEqual(eras.map((e) => [e.layoutId, Math.min(...e.seasons), Math.max(...e.seasons)]), [["sil-1", 1950, 1951], ["sil-8", 2010, 2017], ["sil@2018", 2018, 2026], ["sakhir", 2020, 2020]]);
  assert.deepEqual(circuitEras(parse([drawnRow("a", [2020, 2021]), measuredRow("m", [2018, 2019, 2020, 2021])])).map((e) => e.layoutId), ["m"], "a drawing wholly covered is dropped");
});

test("seasonLabel: ranges when short, the span when a circuit alternated venues", () => {
  assert.equal(seasonLabel([2010, 2011, 2012, 2017]), "2010–2012, 2017");
  assert.equal(seasonLabel([1950, 1951, 1952, 1954, 1956, 1958, 1960, 1963, 1965]), "1950–1965");
  assert.equal(seasonLabel([2021]), "2021");
});
