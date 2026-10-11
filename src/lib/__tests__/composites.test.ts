// Design system composites (DS-19) and the colour rule they share (spec §2.3): a mark that carries meaning
// has to be visible (3:1 against the surface), and a probability meter has to add up.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SURFACE_1, contrastRatio, ensureVisible, parseColor } from "../colorContrast";
import { meterSegments } from "../../components/ui/ProbabilityMeter";

describe("contrast", () => {
  it("reads hex, short hex, rgb() and the hsl() fallback teamColors produces", () => {
    assert.deepEqual(parseColor("#fff"), [1, 1, 1]);
    assert.deepEqual(parseColor("#000000"), [0, 0, 0]);
    assert.deepEqual(parseColor("rgb(255, 0, 0)"), [1, 0, 0]);
    const hsl = parseColor("hsl(0, 100%, 50%)")!;
    assert.ok(Math.abs(hsl[0] - 1) < 1e-9 && hsl[1] < 1e-9 && hsl[2] < 1e-9);
    assert.equal(parseColor("var(--team)"), null);
  });

  it("matches the WCAG ratio", () => {
    assert.equal(Math.round(contrastRatio("#ffffff", "#000000")), 21);
    assert.equal(contrastRatio("#777777", "#777777"), 1);
  });

  it("leaves a colour that is already visible alone", () => {
    assert.equal(ensureVisible("#3671c6"), "#3671c6", "Red Bull passes 3:1 on surface-1 (spec §2.3)");
    assert.equal(ensureVisible("#e8002d"), "#e8002d", "so does Ferrari");
  });

  it("lightens a colour too dark to see, just enough, and keeps its hue", () => {
    const tyrrell = "#002d62";
    assert.ok(contrastRatio(tyrrell, SURFACE_1) < 3);
    const fixed = ensureVisible(tyrrell);
    assert.notEqual(fixed, tyrrell);
    assert.ok(contrastRatio(fixed, SURFACE_1) >= 3, `${fixed} is ${contrastRatio(fixed, SURFACE_1).toFixed(2)}:1`);
    assert.ok(contrastRatio(fixed, SURFACE_1) < 3.6, "just enough, not washed out");
    const [r, g, b] = parseColor(fixed)!;
    assert.ok(b > r && b > g, `${fixed} is still blue`);
  });

  it("gives back what it can't read rather than inventing a team colour", () => {
    assert.equal(ensureVisible("not a colour"), "not a colour");
  });
});

describe("meterSegments", () => {
  const field = [
    { label: "NOR", value: 0.44 },
    { label: "HAM", value: 0.21 },
    { label: "VER", value: 0.15 },
    { label: "LEC", value: 0.1 },
    { label: "PIA", value: 0.1 },
  ];

  it("keeps the top few and sums the rest as Other", () => {
    const segments = meterSegments(field, 3);
    assert.deepEqual(segments.map((s) => s.label), ["NOR", "HAM", "VER", "Other"]);
    assert.ok(Math.abs(segments[3].share - 0.2) < 1e-9);
    assert.equal(segments[3].other, true);
  });

  it("always fills the bar exactly once, even if the inputs don't add to 1", () => {
    const sum = (xs: { share: number }[]) => xs.reduce((a, s) => a + s.share, 0);
    assert.ok(Math.abs(sum(meterSegments(field)) - 1) < 1e-9);
    assert.ok(Math.abs(sum(meterSegments([{ label: "A", value: 0.3 }, { label: "B", value: 0.3 }])) - 1) < 1e-9);
  });

  it("orders by value and needs no Other when everything fits", () => {
    assert.deepEqual(meterSegments([{ label: "B", value: 0.2 }, { label: "A", value: 0.8 }], 3).map((s) => s.label), ["A", "B"]);
  });

  it("ignores zero, negative and NaN values, and is empty when nothing is left", () => {
    assert.deepEqual(meterSegments([{ label: "A", value: 0 }, { label: "B", value: Number.NaN }, { label: "C", value: -1 }]), []);
  });

  it("uses a team colour only after making it visible, and a neutral token otherwise", () => {
    const [team, plain] = meterSegments([{ label: "TYR", value: 0.6, color: "#002d62" }, { label: "X", value: 0.4 }]);
    assert.ok(contrastRatio(team.color!, SURFACE_1) >= 3);
    assert.match(plain.color!, /^var\(--text-/);
  });
});
