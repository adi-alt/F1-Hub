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

// Translucent + blurred, not a flat fill — same glass treatment as the calendar heatmap's own
// tooltip (SeasonCalendarHeatmap.tsx), so every tooltip on the site (a chart's hover tooltip or a
// static one) reads consistently rather than one being a plain opaque box. White-tinted (test —
// see globals.css's --glass-surface-strong) rather than the old flat carbon fill.
export const tooltipStyle = {
  background: "var(--glass-surface-strong)",
  backdropFilter: "blur(var(--glass-blur))",
  WebkitBackdropFilter: "blur(var(--glass-blur))",
  border: "1px solid var(--f1-line)",
  borderRadius: 8,
  color: chart.primaryInk,
  fontSize: 13,
};
