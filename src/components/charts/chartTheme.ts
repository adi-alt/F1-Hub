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

/** The one row-height formula every driver-set-driven horizontal bar chart in Session Analysis
 * uses (QualifyingBarChart/QualifyingGapChart, PitStopsTimeline) - sharing this constant, not each
 * component picking its own base/multiplier, is what makes two charts on the same shared Top 5/
 * 10/All filter land on the exact same pixel height for the exact same row count.
 *
 * 40px/row, not the tighter 28-32 the old independent formulas used - confirmed live that 32
 * genuinely wasn't enough room for Recharts' own category-axis tick labels at a small row count,
 * which silently auto-hides ticks it judges would collide rather than overlapping them, dropping
 * driver names off the chart. 100 (not the old 260/280 floor) - that floor existed when a chart
 * could show a full 20+ driver field with no filter at all; now every chart is always driver-set-
 * filtered, so the floor only needs to cover axis/label chrome for a genuinely tiny N (a 2-3
 * driver field), not pad out a 5-row chart to something oversized. */
export function rowChartHeight(rowCount: number): number {
  return Math.max(100, rowCount * 40);
}
