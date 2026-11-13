// Energy Crossroads game engine. A thin layer over the same model used in Analyst Mode:
// events → monthly price/disruption path → model/finance (evaluateLocation, evaluateCore)
// and model/dispatch (hourly simulation). Nothing here re-implements the economics.
import { COSTS, TECH } from "../data/defaults";
import { MAX_MONTHS, evaluateLocation, evaluateCore, deployMonths, dieselPriceAt, crf, reFixedOM, reCapex, L_PER_BBL } from "../model/finance";
import { runSims } from "../model/dispatch";
import { mulberry32 } from "../model/rng";
import { EVENT_TYPES, RANDOM_RATES, CYCLONE_SITES } from "./events";

export const GAME_MONTHS = 120; // Nov 2026 → Nov 2036
export const PATH_MONTHS = GAME_MONTHS + MAX_MONTHS + 2;

export const BASE = {
  brentLR: 70, crackLR: 22, lngLR: 11, // pre-war reference levels (Feb 2026 Brent avg $70.89; JKM ~$11; gasoil crack ~$20)
  recurProb: 0.1, volatility: 0.3, substitution: 0.4, voll: 2500, logisticsMult: 1,
  adaptTau: 6, // months: suppliers reroute and the physical gap closes with this time constant
  pvTrend: 0.02, battTrend: 0.03, // assumed annual real cost declines (BNEF expects ~3% battery pack decline in 2026)
};

export const OPTIONS = {
  diesel: { key: "diesel", title: "Keep Diesel", short: "Diesel", sizing: { pvRatio: 0, battHours: 0, windRatio: 0 }, color: "#c9821f", glow: "#e8a33a",
    tagline: "No upfront cost. Every litre is imported, so you ride every price swing and every supply cut." },
  hybrid: { key: "hybrid", title: "Build Hybrid System", short: "Hybrid", sizing: { pvRatio: 2.5, battHours: 4, windRatio: 0 }, color: "#5b88f0", glow: "#7aa2ff",
    tagline: "Solar and a mid-size battery carry the day; diesel runs nights and cloudy spells. Best return per dollar." },
  solar: { key: "solar", title: "Build Solar + Battery", short: "Solar + Battery", sizing: { pvRatio: 6, battHours: 16, windRatio: 0 }, color: "#1fa89b", glow: "#2ee6c9",
    tagline: "Solar-led with a large battery. Diesel stays on standby only as backup, so reliability is unchanged. Most independent, most capital." },
};

export function monthDate(m) {
  const d = new Date(Date.UTC(2026, 10 + m, 1));
  return d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

// ---- events → path ---------------------------------------------------------------
export function makeEvent(type, start, params = {}) {
  const T = EVENT_TYPES[type];
  return { id: `${type}-${start}-${Math.round(Math.random() * 1e6)}`, type, start, title: T.title, tier: T.tier, structural: T.type === "structural", ...T.make(params), params };
}

export function gamePath(events, base) {
  const N = PATH_MONTHS;
  const brent = new Float64Array(N), crack = new Float64Array(N), lng = new Float64Array(N), surch = new Float64Array(N), dis = new Float64Array(N), recur = new Float64Array(N), lrAdd = new Float64Array(N), age = new Float64Array(N);
  const peaces = events.filter((e) => e.kind === "peace");
  const dEv = events.filter((e) => e.kind === "disruption").map((e) => {
    let end = e.start + e.months, norm = e.normalize;
    for (const p of peaces) if (p.start >= e.start && p.start < end) { end = p.start; norm = Math.min(norm, p.normalize); }
    return { ...e, end, norm };
  });
  const spikes = events.filter((e) => e.kind === "spike");
  const replays = events.filter((e) => e.kind === "replay");
  const structs = events.filter((e) => e.kind === "structural");
  for (let m = 0; m < N; m++) {
    let add = 0, rAdd = 0;
    for (const s of structs) if (m >= s.start) { add += s.brentAdd; rAdd += s.recurAdd; }
    const LR = base.brentLR + add;
    let pb = 0, pc = 0, pl = 0, ps = 0, pd = 0;
    const t = m + 0.5;
    for (const e of dEv) {
      if (m < e.start) continue;
      const w = t < e.end ? 1 : e.norm > 0 && t < e.end + e.norm ? 1 - (t - e.end) / e.norm : 0;
      if (w <= 0) continue;
      pb = Math.max(pb, w * (e.brent - LR));
      pc = Math.max(pc, w * (e.crack - base.crackLR));
      pl = Math.max(pl, w * (e.lng - base.lngLR));
      ps = Math.max(ps, w * e.surcharge);
      if (t < e.end && e.disruption >= pd) { pd = e.disruption; age[m] = m - (e.adaptStart ?? e.start); }
    }
    let mult = 1, cadd = 0;
    for (const e of spikes) if (m >= e.start && m < e.start + e.months) { mult *= 1 + e.pct; cadd += e.crackAdd; }
    for (const e of replays) { const k = m - e.start; if (k >= 0 && k < e.ratios.length) mult *= e.ratios[k]; }
    brent[m] = (LR + pb) * mult;
    crack[m] = base.crackLR + pc + cadd;
    lng[m] = base.lngLR + pl;
    surch[m] = ps;
    dis[m] = pd;
    recur[m] = Math.min(0.9, base.recurProb + rAdd);
    lrAdd[m] = add;
  }
  return { brent, crack, lng, surch, dis, recur, lrAdd, age, dEv };
}

// Market adaptation: the share of lost Hormuz-linked supply that is replaced rises over time.
export function subEff(path, base, m) {
  return 1 - (1 - base.substitution) * Math.exp(-(path.age[m] || 0) / base.adaptTau);
}
export function shortfall(path, base, loc, m) {
  return path.dis[m] * (loc.hzOil ?? 0) * (1 - subEff(path, base, m));
}

export function activeDisruption(path, m) {
  const live = path.dEv.filter((e) => m >= e.start && m < e.end);
  if (!live.length) return null;
  return live.reduce((a, b) => (b.disruption > a.disruption ? b : a));
}
export function weatherAt(events, siteId, m) {
  let blockDays = 0, pvLoss = 0;
  for (const e of events) if (e.kind === "weather" && e.siteId === siteId && m >= e.start && m < e.start + e.months) { blockDays = Math.max(blockDays, e.blockDays); pvLoss = Math.max(pvLoss, e.pvLoss); }
  return { blockDays, pvLoss };
}

// Shifted view of the path starting at month m0, in the shape model/finance expects.
export function shiftPath(path, m0) {
  const d = activeDisruption(path, m0);
  const D = d ? d.end - m0 : 0;
  return { brent: path.brent.subarray(m0), crack: path.crack.subarray(m0), lng: path.lng.subarray(m0), surch: path.surch.subarray(m0), w: path.dis.subarray(m0), D, R: d ? d.norm : 0, kind: "game" };
}

// Scenario object for the shared model at month m0 (long-run levels + the latest disruption archetype for repeats)
export function scAt(path, base, events, m0) {
  const arche = [...path.dEv].reverse().find((e) => e.start <= m0) || path.dEv[0];
  const d = activeDisruption(path, m0);
  return {
    brentLR: base.brentLR + path.lrAdd[m0], crackLR: base.crackLR, lngLR: base.lngLR,
    brentShock: arche ? arche.brent : base.brentLR, crackShock: arche ? arche.crack : base.crackLR, lngShock: arche ? arche.lng : base.lngLR,
    freightSurcharge: arche ? arche.surcharge : 0,
    durationDays: Math.max(30, (d ? d.end - m0 : arche ? arche.months : 1) * 30.4375),
    normalizeMonths: arche ? arche.norm : 6,
    disruption: d ? d.disruption : 0,
    logisticsMult: base.logisticsMult, volatility: base.volatility, recurProb: path.recur[m0], substitution: subEff(path, base, m0), voll: base.voll,
  };
}

export function capexMults(events, base, m) {
  let pv = (1 - base.pvTrend) ** (m / 12), batt = (1 - base.battTrend) ** (m / 12);
  for (const e of events) if (e.kind === "tech" && m >= e.start) { pv *= e.pvMult; batt *= e.battMult; }
  return { pv, batt };
}
export function costsAt(costsBase, events, base, m) {
  const k = capexMults(events, base, m);
  return { ...costsBase, pvCapex: costsBase.pvCapex * k.pv, battCapex: costsBase.battCapex * k.batt };
}

// ---- option evaluation (forward-looking from month m0) --------------------------------
export function evaluateOption(loc, optKey, m0, G, { withMC = true, withSens = false } = {}) {
  const opt = OPTIONS[optKey];
  const costs = costsAt(G.costs, G.events, G.base, m0);
  const sp = shiftPath(G.path, m0);
  const sc = scAt(G.path, G.base, G.events, m0);
  const ctx = { sc, path: sp, costsFor: () => costs, sizingFor: () => opt.sizing, tech: G.tech, timing: "reactive" };
  const r = evaluateLocation(loc, ctx, { withMC: withMC && optKey !== "diesel", withSens });
  return { ...r, opt, sc, sp, m0 };
}

// ---- monthly ledger of what actually happens at a site ---------------------------------
export function ledger(loc, decision, G, upTo) {
  const costsBase = G.costs;
  const base = runSims(loc, OPTIONS.diesel.sizing, G.tech).base;
  const optSims = decision && decision.option !== "diesel" ? runSims(loc, OPTIONS[decision.option].sizing, G.tech).hyb : null;
  const V = ((loc.storageDays ?? 30) * base.fuelL) / 365;
  const E = base.loadMWh / 12;
  const hz = loc.hzOil ?? 0;
  const annuity = decision && optSims ? (decision.capex * crf(costsBase.wacc, costsBase.life)) / 12 : 0;
  const reOM = optSims ? reFixedOM(optSims, costsBase) / 12 : 0;
  const fixedDiesel = (base.dieselCapMW * 1000 * costsBase.dieselFixedOM) / 12;
  let stock = V, stockCf = V;
  const rows = [];
  for (let m = 0; m <= upTo; m++) {
    const built = optSims && m >= decision.month + decision.lead;
    const building = optSims && m >= decision.month && !built;
    const sys = built ? optSims : base;
    const w = weatherAt(G.events, loc.id, m);
    const extra = built ? w.pvLoss * (sys.reUsedMWh / 12) * 0.265 * 1000 : 0; // diesel covers lost solar
    const R = sys.fuelL / 12 + extra;
    const Rcf = base.fuelL / 12;
    const p = dieselPriceAt(loc, G.base, G.path.brent[m], G.path.crack[m], G.path.surch[m]);
    const cost = R * p + ((sys.dieselMWh / 12) + (extra / 265)) * costsBase.dieselVarOM + fixedDiesel + (built ? reOM + annuity : 0);
    const cfCost = Rcf * p + (base.dieselMWh / 12) * costsBase.dieselVarOM + fixedDiesel;
    const s = G.path.dis[m] * hz * (1 - subEff(G.path, G.base, m));
    const sw = Math.min(1, w.blockDays / 30.44);
    const seff = 1 - (1 - s) * (1 - sw);
    const step = (st, req, ePerL) => {
      // in a shortfall suppliers deliver only part of the normal requirement; tanks refill once supply is normal
      const delivered = seff > 1e-6 ? (1 - seff) * req : req + Math.max(0, V - st);
      st = st + delivered - req;
      let ue = 0;
      if (st < 0) { ue = -st * ePerL; st = 0; }
      return [st, ue];
    };
    let ue, ueCf;
    [stock, ue] = step(stock, R, sys.fuelL > 0 ? sys.dieselMWh / sys.fuelL : 0);
    [stockCf, ueCf] = step(stockCf, Rcf, base.dieselMWh / base.fuelL);
    rows.push({
      m, p, brent: G.path.brent[m], built, building,
      cost, cfCost, perMWh: cost / E, cfPerMWh: cfCost / E,
      served: 1 - ue / E, cfServed: 1 - ueCf / E, ue, ueCf,
      stockDays: (stock / (R || 1)) * 30.44, cfStockDays: (stockCf / Rcf) * 30.44,
      re: built ? optSims.reFraction : 0, fuelL: R, cfFuelL: Rcf, seff,
    });
  }
  return { rows, base, optSims, E, V };
}

// Standardised stress test: a fresh full Hormuz closure lasting `months`, system already built.
export function blockadeTest(loc, optKey, G, months = 6) {
  const base = runSims(loc, OPTIONS.diesel.sizing, G.tech).base;
  const sys = optKey === "diesel" ? base : runSims(loc, OPTIONS[optKey].sizing, G.tech).hyb;
  const V = ((loc.storageDays ?? 30) * base.fuelL) / 365;
  const R = sys.fuelL / 12, E = base.loadMWh / 12, ePerL = sys.fuelL > 0 ? sys.dieselMWh / sys.fuelL : 0;
  let st = V, ue = 0, firstShort = null;
  for (let k = 0; k < months * 4; k++) { // weekly steps
    const sub = 1 - (1 - G.base.substitution) * Math.exp(-(k / 4) / G.base.adaptTau);
    const s = (loc.hzOil ?? 0) * (1 - sub);
    st += (1 - s) * (R / 4) - R / 4;
    if (st < 0) { ue += -st * ePerL; st = 0; if (firstShort === null) firstShort = k * 7; }
  }
  return { served: 1 - ue / (E * months), outageDays: (ue / (E * months)) * months * 30.44, firstShortDay: firstShort };
}

export function preCrisisCost(loc, G) {
  const base = runSims(loc, OPTIONS.diesel.sizing, G.tech).base;
  const p = dieselPriceAt(loc, G.base, G.base.brentLR, G.base.crackLR, 0);
  const c = G.costs;
  return (base.fuelL * p + base.dieselMWh * c.dieselVarOM + base.dieselCapMW * 1000 * c.dieselFixedOM) / base.loadMWh;
}

// Mark-to-market NPV of a decision: same cash-flow engine, current knowledge of events.
export function markToMarket(loc, decision, G) {
  if (!decision || decision.option === "diesel") return null;
  const costs = costsAt(G.costs, G.events, G.base, decision.month); // capex locked at the decision-month price
  const sims = runSims(loc, OPTIONS[decision.option].sizing, G.tech);
  const core = evaluateCore(loc, sims, scAt(G.path, G.base, G.events, decision.month), costs, shiftPath(G.path, decision.month), "reactive", decision.lead);
  return { npv: core.npv, payback: core.payback, core };
}

// ---- random events ------------------------------------------------------------------
export function rollEvents(m, seed, path, siteIds) {
  const rng = mulberry32(seed * 1000003 + m * 7919);
  const out = [];
  const active = activeDisruption(path, m);
  const chance = (r) => rng() < r;
  if (active && chance(RANDOM_RATES.ceasefire)) out.push(["ceasefire", {}]);
  if (!active || active.disruption < 0.9) if (chance(RANDOM_RATES.blockade)) out.push(["blockade", {}]);
  if (chance(RANDOM_RATES.spike)) out.push(["spike", {}]);
  if (chance(RANDOM_RATES.solarTech)) out.push(["solarTech", {}]);
  if (chance(RANDOM_RATES.batteryTech)) out.push(["batteryTech", {}]);
  if (chance(RANDOM_RATES.riskPremium)) out.push(["riskPremium", {}]);
  const exposed = siteIds.filter((id) => CYCLONE_SITES.has(id));
  if (exposed.length && chance(RANDOM_RATES.cyclone * exposed.length)) out.push(["cyclone", { siteId: exposed[Math.floor(rng() * exposed.length)] }]);
  return out;
}

export { TECH, COSTS, L_PER_BBL, reCapex };
