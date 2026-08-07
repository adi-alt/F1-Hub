// Dark-surface values from the dataviz skill's validated reference palette (this app has no
// light mode, so these are used directly rather than switched per color-scheme).
export const chart = {
  surface: "#17171a",
  primaryInk: "#ffffff",
  secondaryInk: "#c3c2b7",
  mutedInk: "#898781",
  gridline: "#2c2c31",
  sequentialBlue: "#3987e5",
  divergingRed: "#e66767",
  neutralMidpoint: "#383835",
};

export const tooltipStyle = {
  background: chart.surface,
  border: `1px solid ${chart.gridline}`,
  borderRadius: 8,
  color: chart.primaryInk,
  fontSize: 13,
};
