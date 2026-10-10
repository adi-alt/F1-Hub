// Synthetic fixtures only (a circle for a circuit). These pin the parsing, matching and geometry; the
// real-data validation against the 2026 British and Bahrain GPs is a separate manual run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchLeadChange, parseTrackStory, projectTrack, smoothClosedPath, stretchAround, TRACK_STORY_VERSION, type RaceTrackStory } from "../raceTrackStory";

const R = 10_000; // decimetres: a 1 km radius, 6.28 km lap
const circle = (n: number): [number, number][] => Array.from({ length: n }, (_, i) => [Math.round(R * Math.cos((2 * Math.PI * i) / n)), Math.round(R * Math.sin((2 * Math.PI * i) / n))]);

function story(over: Partial<RaceTrackStory> = {}): RaceTrackStory {
  return {
    version: TRACK_STORY_VERSION,
    lapLengthM: 6283,
    outline: circle(200),
    startFinish: { x: R, y: 0, verified: true },
    rotation: null,
    corners: [{ number: 1, letter: "", x: 0, y: R }],
    leadChanges: [
      { lap: 2, from: "VER", to: "PIA", kind: "pass", x: 0, y: R, alongM: 1571, precision: "verified", uncertaintyM: 8, near: "into Turn 1", battle: false, recordedLaterS: 0 },
      { lap: 3, from: "PIA", to: "ANT", kind: "pit" },
      { lap: 13, from: "ANT", to: "VER", kind: "pass", x: -R, y: 0, alongM: 3142, precision: "approximate", uncertaintyM: 60, near: null, battle: true, recordedLaterS: 17 },
    ],
    ...over,
  };
}

test("parseTrackStory accepts a well-formed story and keeps it whole", () => {
  const s = parseTrackStory(JSON.parse(JSON.stringify(story())));
  assert.ok(s);
  assert.equal(s.outline.length, 200);
  assert.equal(s.leadChanges.length, 3);
});

test("parseTrackStory drops anything malformed or from another version, rather than drawing half of it", () => {
  assert.equal(parseTrackStory(null), null);
  assert.equal(parseTrackStory({ ...story(), version: 2 }), null, "unknown version");
  assert.equal(parseTrackStory({ ...story(), outline: circle(10) }), null, "too few points to be a lap");
  assert.equal(parseTrackStory({ ...story(), outline: [...circle(100), [1, "x"]] }), null, "a bad point");
  assert.equal(parseTrackStory({ ...story(), startFinish: { x: 1, y: 2 } }), null, "start/finish without its verified flag");
  assert.equal(parseTrackStory({ ...story(), leadChanges: [{ lap: 2, from: "A", to: "B", kind: "pass" }] }), null, "a pass without a location");
  assert.equal(parseTrackStory({ ...story(), rotation: "92" })?.rotation, null, "a non-numeric rotation is ignored, not trusted");
  const [verified, pit, approximate] = story().leadChanges;
  assert.equal(parseTrackStory({ ...story(), leadChanges: [verified, pit, { ...approximate, near: "into Turn 6" }] }), null, "an approximate location may not name a turn");
  assert.equal(parseTrackStory({ ...story(), leadChanges: [{ ...verified, precision: "exact" }] }), null, "an unknown precision");
  assert.equal(parseTrackStory({ ...story(), leadChanges: [{ ...verified, uncertaintyM: undefined }] }), null, "a pass without its uncertainty");
});

test("matchLeadChange pairs a chapter with the same new leader on its lap, or one either side at the line", () => {
  const s = story();
  assert.equal(matchLeadChange(s, 13, "VER")?.lap, 13);
  assert.equal(matchLeadChange(s, 14, "VER")?.lap, 13, "one lap off at the line");
  assert.equal(matchLeadChange(s, 15, "VER"), null, "two laps off is a different lead change");
  assert.equal(matchLeadChange(s, 13, "HAM"), null, "a different driver");
  assert.equal(matchLeadChange(s, 3, "ANT")?.kind, "pit");
});

test("projectTrack fits the circuit in its box, flips y for SVG and applies F1's rotation", () => {
  const p = projectTrack(story(), 600);
  const auto = projectTrack(story());
  assert.ok(Number(auto.viewBox.split(" ")[2]) > 2 * R * 1.15, "the default margin scales with the circuit");
  const [, , w, h] = p.viewBox.split(" ").map(Number);
  assert.ok(Math.abs(w - (2 * R + 1200)) <= 2 && Math.abs(h - (2 * R + 1200)) <= 2);
  for (const [x, y] of p.points) assert.ok(x >= 599 && x <= w - 599 && y >= 599 && y <= h - 599);
  // The feed's y points up: the top of the circle (y = +R) is at the top of the SVG.
  assert.ok(Math.abs(p.toSvg(0, R)[1] - 600) < 1);
  // 90° of rotation (FastF1's convention) takes the circle's right-hand point (R, 0) to its top (0, R).
  const r = projectTrack(story({ rotation: 90 }), 600);
  const [x, y] = r.toSvg(R, 0);
  assert.ok(Math.abs(x - (R + 600)) < 1 && Math.abs(y - 600) < 1, `${x},${y}`);
});

test("smoothClosedPath passes through every sample and closes", () => {
  const pts: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const d = smoothClosedPath(pts);
  assert.ok(d.startsWith("M0,0") && d.endsWith("Z"));
  for (const [x, y] of pts) assert.ok(d.includes(` ${x},${y}`) || d.startsWith(`M${x},${y}`), `${x},${y}`);
});

test("stretchAround uses real distance, in order, and wraps through the line", () => {
  // Uneven sampling: half the points crowd into the first quarter of the lap, as samples do in slow corners.
  const uneven: [number, number][] = [];
  for (let i = 0; i < 100; i++) uneven.push([R * Math.cos((Math.PI / 2) * (i / 100)), R * Math.sin((Math.PI / 2) * (i / 100))]);
  for (let i = 0; i < 100; i++) uneven.push([R * Math.cos(Math.PI / 2 + 1.5 * Math.PI * (i / 100)), R * Math.sin(Math.PI / 2 + 1.5 * Math.PI * (i / 100))]);
  const lap = 2 * Math.PI * (R / 10);
  const near = stretchAround(uneven, lap, lap * 0.6, 200); // well into the sparse part
  const arc = (p: [number, number]) => ((Math.atan2(p[1], p[0]) / (2 * Math.PI)) * lap + lap) % lap;
  for (const p of near) assert.ok(Math.abs(arc(p) - lap * 0.6) <= 201, `point ${arc(p).toFixed(0)} m is outside ±200 m of ${(lap * 0.6).toFixed(0)}`);
  const wrap = stretchAround(circle(200), lap, 10, 100); // straddles the line
  const d = wrap.map((p) => ((arc(p) + lap / 2) % lap) - lap / 2);
  assert.ok(d.length > 5 && d[0] < 0 && d[d.length - 1] > 0, "ordered from before the line to after it");
  for (let i = 1; i < d.length; i++) assert.ok(d[i] > d[i - 1], "monotonic, no jump across the circuit");
});
