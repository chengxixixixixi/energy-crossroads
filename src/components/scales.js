import * as d3 from "d3";

// Sequential ramps for a dark surface: low = muted/dark, high = bright.
export const TEAL_RAMP = ["#14262f", "#16444a", "#196563", "#1f897f", "#3bb3a6", "#7fd8cc"];
export const AMBER_RAMP = ["#251f19", "#3f2f1b", "#5f421c", "#86591e", "#b97a24", "#e8a33a"];
export const DIVERGING = ["#c9821f", "#8a5d22", "#4a3d2c", "#2a3446", "#1e5552", "#1f8a80", "#45c2b5"]; // amber ← neutral → teal

export const pvoutScale = d3.scaleQuantize().domain([1000, 1900]).range(TEAL_RAMP);
export const exposureScale = d3.scaleQuantize().domain([0, 0.9]).range(AMBER_RAMP);
export const advantageScale = d3.scaleThreshold().domain([-60, -20, -5, 5, 40, 90]).range(DIVERGING);

// Bivariate 3×3: rows = security (exposure) low→high, cols = economics low→high
export const BIVAR = [
  ["#1f2838", "#1c4b4c", "#1b7b72"],
  ["#4a3b26", "#47574a", "#3d9483"],
  ["#8a5a1f", "#9b8240", "#f0cf6a"],
];
export const exposureTercile = (x) => (x == null ? null : x < 0.25 ? 0 : x < 0.55 ? 1 : 2);
export const advantageTercile = (a) => (a == null ? null : a < 0 ? 0 : a < 50 ? 1 : 2);
export const bivarColor = (exp, adv) => {
  const r = exposureTercile(exp), c = advantageTercile(adv);
  if (r == null || c == null) return null;
  return BIVAR[r][c];
};

export const NO_DATA = "#141c2b";
