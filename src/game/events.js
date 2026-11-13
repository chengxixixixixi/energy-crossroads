// Event catalogue. Every event states exactly which model variables it moves.
// type: "temporary" shocks expire; "structural" changes persist for the rest of the game.
// tier: "observed" (anchored to dated data), "historical" (replays a real price path), "hypothetical".
import { BRENT_MONTHLY, BRENT_MONTHLY_DATES } from "../data/history";
import { MARKET } from "../data/snapshot";

const series = (a, b) => {
  const i = BRENT_MONTHLY_DATES.indexOf(a), j = BRENT_MONTHLY_DATES.indexOf(b);
  const s = BRENT_MONTHLY.slice(i, j + 1);
  return s.map((v) => v / s[0]);
};

export const EVENT_TYPES = {
  hormuz2026: {
    title: "Hormuz disruption",
    icon: "⚠",
    tier: "observed",
    type: "temporary",
    blurb: "War has disrupted the Strait of Hormuz since 28 February 2026. Gulf crude is moving again through bypass routes, but refined-product flows remain about half of normal.",
    make: (p) => ({ kind: "disruption", months: p.months, normalize: 12, disruption: 0.5, brent: p.brent, crack: 65, lng: MARKET.jkm.value, surcharge: 0.06, adaptStart: -8.5 }),
    effects: (e) => [
      `Hormuz-linked fuel supply ${Math.round(e.disruption * 100)}% disrupted for ${e.months} more months (your control)`,
      `Brent $${e.brent}/bbl while it lasts (your control; ICE front-month settled $92.57 on 10 Nov)`,
      `Diesel refining margin $${e.crack}/bbl (pre-war ≈ $20; Singapore crack neared $70 in Oct)`,
      `War-risk freight +$${e.surcharge.toFixed(2)}/L × site exposure`,
      `Prices glide back to long-run levels over ${e.normalize} months after it ends`,
    ],
  },
  blockade: {
    title: "Hormuz Blockade",
    icon: "⛔",
    tier: "hypothetical",
    type: "temporary",
    blurb: "Escalation closes the strait to almost all traffic. Only bypass pipelines and strategic stocks keep oil moving.",
    make: () => ({ kind: "disruption", months: 6, normalize: 9, disruption: 1, brent: 150, crack: 90, lng: 45, surcharge: 0.12 }),
    effects: (e) => [
      `Hormuz-linked supply ${Math.round(e.disruption * 100)}% disrupted for ${e.months} months: physical shortages where tanks run dry`,
      `Brent $${e.brent}/bbl, diesel margin $${e.crack}/bbl (set separately, not derived from the disruption %)`,
      `War-risk freight +$${e.surcharge.toFixed(2)}/L × site exposure`,
      `Normalises over ${e.normalize} months`,
    ],
  },
  spike: {
    title: "Oil Price Spike",
    icon: "↗",
    tier: "hypothetical",
    type: "temporary",
    blurb: "A financial and sentiment shock lifts crude without cutting physical supply. Bills rise; tanks stay full.",
    make: () => ({ kind: "spike", months: 4, pct: 0.4, crackAdd: 10 }),
    effects: (e) => [`Brent ×${(1 + e.pct).toFixed(2)} for ${e.months} months`, `Diesel margin +$${e.crackAdd}/bbl`, "No physical supply loss: reliability unaffected"],
  },
  solarTech: {
    title: "Solar Technology Breakthrough",
    icon: "☀",
    tier: "hypothetical",
    type: "structural",
    blurb: "A step change in module efficiency and installation methods lowers the cost of new solar projects for good.",
    make: () => ({ kind: "tech", pvMult: 0.85, battMult: 1 }),
    effects: (e) => [`Solar capital cost ×${e.pvMult} for projects started from now on`, "Projects already built are unaffected"],
  },
  batteryTech: {
    title: "Battery Cost Breakthrough",
    icon: "▮",
    tier: "hypothetical",
    type: "structural",
    blurb: "New cell chemistry and factory overcapacity cut storage prices beyond the expected trend.",
    make: () => ({ kind: "tech", pvMult: 1, battMult: 0.8 }),
    effects: (e) => [`Battery capital cost ×${e.battMult} for new projects`, "Stacks on top of the baseline −3%/yr battery trend"],
  },
  cyclone: {
    title: "Extreme Weather: Cyclone",
    icon: "🌀",
    tier: "hypothetical",
    type: "temporary",
    blurb: "A tropical cyclone closes the harbour and clouds the island for weeks.",
    make: (p) => ({ kind: "weather", months: 1, siteId: p.siteId, blockDays: 21, pvLoss: 0.35 }),
    effects: (e) => [`Fuel deliveries to this island suspended for ${e.blockDays} days`, `Solar output −${Math.round(e.pvLoss * 100)}% this month (diesel covers the gap)`, "Tank size and fuel burn decide whether lights stay on"],
  },
  ceasefire: {
    title: "Ceasefire: Strait Reopens",
    icon: "✓",
    tier: "hypothetical",
    type: "temporary",
    blurb: "A negotiated ceasefire ends the active disruption. Prices start to normalise.",
    make: () => ({ kind: "peace", normalize: 6 }),
    effects: (e) => ["Ends every active Hormuz disruption this month", `Prices glide back to long-run levels over ${e.normalize} months`],
  },
  riskPremium: {
    title: "Structural Chokepoint Risk",
    icon: "◆",
    tier: "hypothetical",
    type: "structural",
    blurb: "Markets decide Gulf supply is permanently riskier. A lasting premium enters long-run prices.",
    make: () => ({ kind: "structural", brentAdd: 8, recurAdd: 0.05 }),
    effects: (e) => [`Long-run Brent +$${e.brentAdd}/bbl from now on`, `Repeat-disruption probability +${Math.round(e.recurAdd * 100)} points per year`],
  },
  gulf1990: {
    title: "History repeats: 1990 Gulf War prices",
    icon: "⟲",
    tier: "historical",
    type: "temporary",
    blurb: "Replays the month-by-month % moves of Brent from July 1990 to March 1991 (EIA), starting now.",
    make: () => ({ kind: "replay", ratios: series("1990-07", "1991-03"), crackAdd: 0 }),
    effects: (e) => [`Brent follows the 1990–91 path: peak ×${Math.max(...e.ratios).toFixed(2)} the starting level`, `${e.ratios.length} months; crude only, no physical shortage modelled`],
  },
  russia2022: {
    title: "History repeats: 2022 energy crisis prices",
    icon: "⟲",
    tier: "historical",
    type: "temporary",
    blurb: "Replays Brent's month-by-month % moves through 2022 (EIA), starting now.",
    make: () => ({ kind: "replay", ratios: series("2022-01", "2022-12"), crackAdd: 0 }),
    effects: (e) => [`Brent follows the 2022 path: peak ×${Math.max(...e.ratios).toFixed(2)} the starting level`, `${e.ratios.length} months; crude only`],
  },
};

// Monthly probabilities for random events (hypothetical, disclosed in the UI)
export const RANDOM_RATES = {
  spike: 0.012,
  blockade: 0.008,
  solarTech: 0.008,
  batteryTech: 0.008,
  cyclone: 0.02, // per month, sites flagged as cyclone-exposed only
  ceasefire: 0.05, // per month, only while a disruption is active
  riskPremium: 0.004,
};

export const CYCLONE_SITES = new Set(["to-tongatapu", "fj-vanualevu", "mh-majuro", "pw-koror", "ph-romblon", "mu-rodrigues", "km-ngazidja", "bb-barbados", "us-molokai", "in-andaman", "id-sumba", "custom"]);
