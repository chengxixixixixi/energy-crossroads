// Default assumptions. Tier: HYPOTHETICAL (editable inputs) unless marked otherwise.
import { MARKET } from "./snapshot";

// Cost assumptions by use case (real 2026 USD).
// Basis: IRENA utility-scale PV total installed cost USD 691/kW (2024) and BNEF turnkey
// BESS USD 117/kWh (2025) are global benchmarks; island and C&I values add small-scale,
// logistics, EPC and grid-forming premiums. These premiums are assumptions.
export const COSTS = {
  island: {
    pvCapex: 1400, battCapex: 400, windCapex: 2500, pvOM: 18, windOM: 50, battOMpct: 0.02,
    battReplYear: 12, battReplFrac: 0.5, dieselVarOM: 25, dieselFixedOM: 20, dieselCapex: 700,
    gasVarOM: 4, gasCapex: 1000, wacc: 0.09, life: 25, baseLeadMonths: 6, exportCredit: 0, newBuildFossil: false,
  },
  industrial: {
    pvCapex: 750, battCapex: 250, windCapex: 1800, pvOM: 12, windOM: 40, battOMpct: 0.02,
    battReplYear: 12, battReplFrac: 0.5, dieselVarOM: 25, dieselFixedOM: 15, dieselCapex: 500,
    gasVarOM: 4, gasCapex: 1000, wacc: 0.1, life: 25, baseLeadMonths: 4, exportCredit: 0, newBuildFossil: false,
  },
  lng: {
    pvCapex: 650, battCapex: 200, windCapex: 2200, pvOM: 11, windOM: 45, battOMpct: 0.02,
    battReplYear: 13, battReplFrac: 0.5, dieselVarOM: 25, dieselFixedOM: 15, dieselCapex: 600,
    gasVarOM: 4, gasCapex: 1000, wacc: 0.07, life: 25, baseLeadMonths: 12, exportCredit: 0, newBuildFossil: false,
  },
};

// Technical assumptions (shared).
export const TECH = {
  rte: 0.88, socMin: 0.1, cRate: 0.5,
  dieselUnits: 4, minLoad: 0.3,
  noLoadL: 30, // L per MW of running capacity per hour (fuel-curve intercept)
  slopeL: 235, // L per MWh generated (fuel-curve slope) → 265 L/MWh at full load
  backupLperMWh: 300, dieselOff: true,
};

export const SIZING = {
  island: { pvRatio: 3.0, battHours: 5, windRatio: 0 },
  industrial: { pvRatio: 1.0, battHours: 1, windRatio: 0 },
  lng: { pvRatio: 1.2, battHours: 2, windRatio: 0.3 },
};

// Scenario presets. Prices for the "snapshot" preset are anchored to observed values;
// the disruption %, duration and normalisation are judgement calls, labelled as such.
export const PRESETS = {
  snapshot: {
    label: "Nov 2026 snapshot",
    blurb: "Anchored to observed prices on 6–10 Nov 2026. Disruption set to the ~50% shortfall Kpler reports for refined-product flows; 12 months remaining reflects Kpler's view of no full reopening within six months.",
    tier: "observed+hypothetical",
    sc: {
      brentShock: Math.round(MARKET.brentFutures.value), crackShock: 65, lngShock: MARKET.jkm.value,
      brentLR: 70, crackLR: 22, lngLR: 11, disruption: 0.5, durationDays: 365, normalizeMonths: 12,
      freightSurcharge: 0.06,
    },
  },
  prewar: {
    label: "No shock (pre-war)",
    blurb: "Feb-2026 price levels held flat. Use this to see project economics with no geopolitical premium.",
    tier: "hypothetical",
    sc: { brentShock: 70, crackShock: 22, lngShock: 11, brentLR: 70, crackLR: 22, lngLR: 11, disruption: 0, durationDays: 30, normalizeMonths: 0, freightSurcharge: 0 },
  },
  harass: {
    label: "Harassment, 60 days",
    blurb: "Tanker seizures and insurance spikes; flows mostly continue.",
    tier: "hypothetical",
    sc: { brentShock: 85, crackShock: 32, lngShock: 16, brentLR: 70, crackLR: 22, lngLR: 11, disruption: 0.1, durationDays: 60, normalizeMonths: 3, freightSurcharge: 0.03 },
  },
  closure: {
    label: "Full closure, 6 months",
    blurb: "Near-total stoppage; only bypass pipelines and strategic stocks offset the loss.",
    tier: "hypothetical",
    sc: { brentShock: 150, crackShock: 90, lngShock: 45, brentLR: 72, crackLR: 24, lngLR: 12, disruption: 1, durationDays: 180, normalizeMonths: 9, freightSurcharge: 0.12 },
  },
  protracted: {
    label: "Protracted conflict, 3 years",
    blurb: "Chronic partial disruption with a persistent risk premium.",
    tier: "hypothetical",
    sc: { brentShock: 110, crackShock: 45, lngShock: 22, brentLR: 75, crackLR: 25, lngLR: 12, disruption: 0.35, durationDays: 1095, normalizeMonths: 12, freightSurcharge: 0.05 },
  },
};

export const BASE_SCENARIO = {
  ...PRESETS.snapshot.sc,
  logisticsMult: 1,
  volatility: 0.3,
  recurProb: 0.1,
  substitution: 0.4,
  voll: 2500,
};

// Historical replay episodes (index into BRENT_MONTHLY_DATES; first month = pre-episode base)
export const EPISODES = [
  { id: "gulf1990", label: "1990 Gulf War", start: "1990-07", end: "1991-03", note: "Iraq's invasion of Kuwait; Brent more than doubled within three months." },
  { id: "libya2011", label: "2011 Libya", start: "2011-01", end: "2011-10", note: "Loss of Libyan light sweet crude; IEA coordinated stock release in June." },
  { id: "abqaiq2019", label: "2019 Abqaiq attack", start: "2019-08", end: "2019-11", note: "5.7 mb/d knocked offline for days; the monthly average barely moved." },
  { id: "russia2022", label: "2022 Russia–Ukraine", start: "2022-01", end: "2022-12", note: "Sanctions and rerouting; diesel cracks blew out more than crude." },
  { id: "hormuz2026", label: "2026 Hormuz war", start: "2026-02", end: "2026-10", note: "War began 28 Feb 2026; latest month in the EIA series is Oct 2026." },
];
