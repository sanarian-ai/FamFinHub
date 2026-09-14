import type { CSSProperties } from "react";

// Shared chart styling for the Insights screen — validated categorical palette
// (light-mode, this app has no dark mode) per the dataviz skill's reference palette.
// Order is the CVD-safety mechanism: always assign in this fixed order, never cycle/re-sort.
export const CATEGORICAL = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
];

export const SINGLE_SERIES = CATEGORICAL[0];
export const OTHER_SLOT = "#898781"; // muted gray for a rolled-up "Other" bucket

export const CHART_INK = {
  surface: "#fcfcfb",
  primary: "#0b0b0b",
  secondary: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  goodText: "#006300",
  badText: "#d03b3b",
};

export const tooltipStyle: CSSProperties = {
  background: "#ffffff",
  border: `1px solid ${CHART_INK.grid}`,
  borderRadius: 8,
  fontSize: 12,
  color: CHART_INK.primary,
  boxShadow: "0 2px 8px rgba(11,11,11,0.08)",
};

export const axisTick = { fontSize: 11, fill: CHART_INK.muted };
