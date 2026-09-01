// Dark-surface values from the dataviz skill's validated reference palette (this app has no
// light mode, so these are used directly rather than switched per color-scheme). `gridline` stays
// a plain neutral on purpose — it's the reading aid inside a chart (axis lines, CartesianGrid),
// used in a dozen chart components; making every one of those red-tinted like the site's own
// card borders would be loud, not "considered."
export const chart = {
  surface: "#18181b", // zinc-900, matches --f1-carbon
  primaryInk: "#ffffff",
  secondaryInk: "#c3c2b7",
  mutedInk: "#898781",
  gridline: "#2c2c31",
  sequentialBlue: "#3987e5",
  divergingRed: "#e66767",
  neutralMidpoint: "#383835",
};

// Translucent + blurred, not a flat fill, so every tooltip on the site (a chart's hover tooltip,
// the export menu's dropdown) reads consistently rather than one being a plain opaque box.
export const tooltipStyle = {
  background: "var(--tooltip-surface-strong)",
  backdropFilter: "blur(var(--tooltip-blur))",
  WebkitBackdropFilter: "blur(var(--tooltip-blur))",
  border: "1px solid var(--tooltip-border)",
  borderRadius: 8,
  color: chart.primaryInk,
  fontSize: 13,
};

/** The one row height every driver-set-filtered visualization in Session Analysis shares
 * (QualifyingBarChart/QualifyingGapChart's Recharts bands, PitStopsTimeline's Recharts scatter
 * rows, TireStintTimeline's plain CSS rows) - what actually makes "20 drivers" line up to the same
 * pixel height on both sides isn't syncing the two PANELS, it's syncing the two DRIVER-LIST BODIES
 * - the part that scales with row count - while letting each side's own header/summary/legend
 * chrome sit outside that synced measurement, on its own.
 *
 * 37, not the tighter 28-32 earlier formulas used - confirmed live that 32 genuinely wasn't enough
 * room for Recharts' own category-axis tick labels at a small row count, which silently auto-hides
 * ticks it judges would collide rather than overlapping them, dropping driver names off the chart. */
export const SESSION_ROW_HEIGHT = 37;

// A Recharts bar/scatter chart's plot area is smaller than its own ResponsiveContainer height by
// this much regardless of row count (margin.top + margin.bottom + the X-axis line/tick labels/
// title, none of which scale with N) - a plain CSS row list (TireStintTimeline) has none of this,
// so its own body height is exactly rowCount * SESSION_ROW_HEIGHT with no equivalent addition.
// Calibrated against the actual rendered chrome (margin={{top:8,bottom:20}} + a ~12px tick label
// row), not a guess baked into a single Math.max floor the way the old formula conflated "minimum
// chart height" with "axis chrome," which is what made small-N charts crowd their own labels.
const RECHARTS_AXIS_CHROME = 48;

export function sessionRowListHeight(rowCount: number): number {
  return rowCount * SESSION_ROW_HEIGHT;
}

export function sessionChartHeight(rowCount: number): number {
  return sessionRowListHeight(rowCount) + RECHARTS_AXIS_CHROME;
}
