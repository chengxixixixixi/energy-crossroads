// Price paths, cash flows, NPV, LCOE, break-even, Monte Carlo, resilience, deployment.
// Everything here is CALCULATED from explicit inputs; nothing is fitted to data.
import { mulberry32, gaussFactory, hashSeed } from "./rng";
import { runSims } from "./dispatch";

export const L_PER_BBL = 158.987;
export const MAX_MONTHS = 480;

export const crf = (r, n) => (r === 0 ? 1 / n : (r * (1 + r) ** n) / ((1 + r) ** n - 1));
const monthlyRate = (wacc) => (1 + wacc) ** (1 / 12) - 1;

// ---- price paths -----------------------------------------------------------------
// Step shock for the remaining disruption window, linear normalisation, then a flat
// real long-run level. Prices are in real 2026 USD.
export function buildScenarioPath(sc, months = MAX_MONTHS) {
  const D = sc.durationDays / 30.4375;
  const R = Math.max(0, sc.normalizeMonths);
  const brent = new Float64Array(months), crack = new Float64Array(months), lng = new Float64Array(months), surch = new Float64Array(months), w = new Float64Array(months);
  for (let m = 0; m < months; m++) {
    const t = m + 0.5;
    let k = 0;
    if (t < D) k = 1;
    else if (R > 0 && t < D + R) k = 1 - (t - D) / R;
    w[m] = k;
    brent[m] = sc.brentLR + k * (sc.brentShock - sc.brentLR);
    crack[m] = sc.crackLR + k * (sc.crackShock - sc.crackLR);
    lng[m] = sc.lngLR + k * (sc.lngShock - sc.lngLR);
    surch[m] = k * sc.freightSurcharge;
  }
  return { brent, crack, lng, surch, w, D, R, kind: "scenario" };
}

// Historical replay: the episode's monthly Brent applied either as observed nominal
// levels or as ratios to the pre-episode month, rescaled to today's long-run level.
export function buildReplayPath(sc, episodeSeries, ratioMode = true, months = MAX_MONTHS) {
  const p0 = episodeSeries[0];
  const n = episodeSeries.length;
  const R = Math.max(1, sc.normalizeMonths);
  const brent = new Float64Array(months), crack = new Float64Array(months), lng = new Float64Array(months), surch = new Float64Array(months), w = new Float64Array(months);
  let last = sc.brentLR;
  for (let m = 0; m < months; m++) {
    let b;
    if (m < n) {
      b = ratioMode ? (sc.brentLR * episodeSeries[m]) / p0 : episodeSeries[m];
      last = b;
    } else if (m < n + R) {
      const f = (m - n + 0.5) / R;
      b = last + f * (sc.brentLR - last);
    } else b = sc.brentLR;
    brent[m] = b;
    crack[m] = sc.crackLR; // historical product cracks are not replayed (crude only)
    lng[m] = sc.lngLR * (b / sc.brentLR); // oil-indexed LNG proxy, labelled in the UI
    surch[m] = 0;
    w[m] = m < n ? 1 : 0;
  }
  return { brent, crack, lng, surch, w, D: n, R, kind: "replay" };
}

export function flatPath(sc, months = MAX_MONTHS, over = {}) {
  const b = over.brentLR ?? sc.brentLR;
  const l = over.lngLR ?? sc.lngLR;
  return buildScenarioPath({ ...sc, brentLR: b, brentShock: b, crackShock: sc.crackLR, lngLR: l, lngShock: l, freightSurcharge: 0, durationDays: 0, normalizeMonths: 0 }, months);
}

// ---- unit prices -----------------------------------------------------------------
export function dieselPrice(loc, sc, path, m) {
  return (path.brent[m] + path.crack[m]) / L_PER_BBL + loc.logistics * sc.logisticsMult + path.surch[m] * (loc.hzOil ?? 0) + (loc.margin ?? 0.08) + (loc.tax ?? 0);
}
export function dieselPriceAt(loc, sc, brent, crack, surch) {
  return (brent + crack) / L_PER_BBL + loc.logistics * sc.logisticsMult + surch * (loc.hzOil ?? 0) + (loc.margin ?? 0.08) + (loc.tax ?? 0);
}
export function gridTariff(loc, sc, path, m, tariffOverride) {
  const t0 = tariffOverride ?? loc.tariff;
  const idx = loc.gridFuel === "oil" ? path.brent[m] / sc.brentLR : path.lng[m] / sc.lngLR;
  return t0 * (1 - loc.tariffLink + loc.tariffLink * idx);
}
export function gasCostPerMWh(loc, costs, path, m) {
  return loc.heatRate * (path.lng[m] + (loc.regas ?? 1)) + costs.gasVarOM;
}

// Monthly operating cost of one simulated system. Fixed fleet costs are identical in
// both cases (fleet retained) and are included so LCOE is a full cost of supply.
function opCost(sys, loc, sc, costs, path, m, isHybrid, tariffOverride) {
  let c = 0;
  if (loc.useCase === "island") {
    c += (sys.fuelL / 12) * dieselPrice(loc, sc, path, m);
    c += (sys.dieselMWh / 12) * costs.dieselVarOM;
    c += (sys.dieselCapMW * 1000 * costs.dieselFixedOM) / 12;
  } else if (loc.useCase === "industrial") {
    c += (sys.gridMWh / 12) * gridTariff(loc, sc, path, m, tariffOverride);
    c += (sys.backupFuelL / 12) * dieselPrice(loc, sc, path, m);
    c += (sys.backupMWh / 12) * costs.dieselVarOM;
    c -= (sys.exportMWh / 12) * (costs.exportCredit || 0);
  } else {
    c += (sys.gasMWh / 12) * gasCostPerMWh(loc, costs, path, m);
  }
  if (isHybrid) c += reFixedOM(sys, costs) / 12;
  return c;
}

export function reFixedOM(sys, costs) {
  return sys.pvMW * 1000 * costs.pvOM + sys.windMW * 1000 * (costs.windOM || 0) + sys.battMWh * 1000 * costs.battCapex * costs.battOMpct;
}
export function reCapex(sys, costs) {
  return sys.pvMW * 1000 * costs.pvCapex + sys.windMW * 1000 * (costs.windCapex || 0) + sys.battMWh * 1000 * costs.battCapex;
}

// ---- deployment ------------------------------------------------------------------
export function deployMonths(loc, sizing, costs, sc) {
  const mw = sizing.pvRatio * loc.avgMW + (sizing.windRatio || 0) * loc.avgMW;
  const base = costs.baseLeadMonths + 3 + 4 * Math.log10(1 + mw / 5);
  const stress = 1 + 0.25 * (sc.disruption || 0); // shipping/supply-chain stress during a disruption
  const mid = base * stress;
  return { mid, low: mid * 0.75, high: mid * 1.35 };
}

// ---- core evaluation ---------------------------------------------------------------
export function evaluateCore(loc, sims, sc, costs, path, timing, deployM, tariffOverride) {
  const { base, hyb } = sims;
  const lead = timing === "preemptive" ? 0 : Math.round(deployM);
  const life = costs.life;
  const H = Math.min(MAX_MONTHS - 1, lead + life * 12);
  const rm = monthlyRate(costs.wacc);
  const capex = reCapex(hyb, costs);
  const repl = hyb.battMWh * 1000 * costs.battCapex * costs.battReplFrac;
  const replM = lead + Math.round(costs.battReplYear * 12);
  const baseCost = new Float64Array(H), hybCost = new Float64Array(H), capexFlow = new Float64Array(H), net = new Float64Array(H), df = new Float64Array(H);
  capexFlow[0] += capex * 0.5;
  capexFlow[Math.min(H - 1, lead)] += capex * 0.5;
  if (replM < H && costs.battReplYear < life) capexFlow[replM] += repl;
  let npv = 0, cum = 0, cumD = 0, payback = null, paybackD = null;
  for (let m = 0; m < H; m++) {
    df[m] = 1 / (1 + rm) ** (m + 1);
    baseCost[m] = opCost(base, loc, sc, costs, path, m, false, tariffOverride);
    hybCost[m] = m < lead ? baseCost[m] : opCost(hyb, loc, sc, costs, path, m, true, tariffOverride);
    net[m] = baseCost[m] - hybCost[m] - capexFlow[m];
    npv += net[m] * df[m];
    const prevCum = cum, prevCumD = cumD;
    cum += net[m];
    cumD += net[m] * df[m];
    if (payback === null && m > lead && prevCum < 0 && cum >= 0) payback = (m + 1) / 12;
    if (paybackD === null && m > lead && prevCumD < 0 && cumD >= 0) paybackD = (m + 1) / 12;
  }
  return { npv, baseCost, hybCost, capexFlow, net, df, H, lead, capex, repl, replM, payback, paybackD };
}

// Levelized cost of reliable supply, technology view: both systems commissioned at
// month 0 and run for the project life on the given price path.
export function lcoe(loc, sims, sc, costs, path) {
  const { base, hyb } = sims;
  const N = costs.life * 12;
  const rm = monthlyRate(costs.wacc);
  let pvE = 0;
  const parts = { base: { fuel: 0, om: 0, capex: 0, pv: 0, batt: 0, repl: 0 }, hyb: { fuel: 0, om: 0, capex: 0, pv: 0, batt: 0, repl: 0 } };
  for (let m = 0; m < N; m++) {
    const d = 1 / (1 + rm) ** (m + 1);
    pvE += (base.loadMWh / 12) * d;
    for (const [k, sys] of [["base", base], ["hyb", hyb]]) {
      const total = opCost(sys, loc, sc, costs, path, m, false);
      const om = fixedAndVarOM(sys, loc, costs) / 12;
      parts[k].fuel += (total - om) * d;
      parts[k].om += om * d;
      if (k === "hyb") parts[k].om += (reFixedOM(sys, costs) / 12) * d;
    }
  }
  const d0 = 1;
  parts.hyb.pv += (hyb.pvMW * 1000 * costs.pvCapex + hyb.windMW * 1000 * (costs.windCapex || 0)) * d0;
  parts.hyb.batt += hyb.battMWh * 1000 * costs.battCapex * d0;
  if (costs.battReplYear < costs.life) parts.hyb.repl += hyb.battMWh * 1000 * costs.battCapex * costs.battReplFrac / (1 + costs.wacc) ** costs.battReplYear;
  if (costs.newBuildFossil) {
    const fossilCapex = (loc.useCase === "lng" ? costs.gasCapex : costs.dieselCapex) * base.peakMW * 1.15 * 1000;
    parts.base.capex += fossilCapex;
    parts.hyb.capex += fossilCapex; // same firm fleet in both cases
  }
  const per = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v / pvE]));
  const b = per(parts.base), h = per(parts.hyb);
  const sum = (o) => Object.values(o).reduce((a, c) => a + c, 0);
  return { base: b, hyb: h, baseTotal: sum(b), hybTotal: sum(h) };
}

function fixedAndVarOM(sys, loc, costs) {
  if (loc.useCase === "island") return sys.dieselMWh * costs.dieselVarOM + sys.dieselCapMW * 1000 * costs.dieselFixedOM;
  if (loc.useCase === "industrial") return sys.backupMWh * costs.dieselVarOM;
  return sys.gasMWh * costs.gasVarOM;
}

// ---- break-even -----------------------------------------------------------------
// NPV is linear in the long-run price driver, so two flat-price evaluations solve it.
export function breakEven(loc, sims, sc, costs, timing, deployM) {
  if (loc.useCase === "island") {
    const f = (b) => evaluateCore(loc, sims, sc, costs, flatPath(sc, MAX_MONTHS, { brentLR: b }), timing, deployM).npv;
    const x1 = 40, x2 = 140;
    const y1 = f(x1), y2 = f(x2);
    const brent = x1 - (y1 * (x2 - x1)) / (y2 - y1);
    const diesel = dieselPriceAt(loc, sc, brent, sc.crackLR, 0);
    return { driver: "brent", value: brent, diesel, slope: (y2 - y1) / (x2 - x1) };
  }
  if (loc.useCase === "industrial") {
    const f = (t) => evaluateCore(loc, sims, sc, costs, flatPath(sc), timing, deployM, t).npv;
    const x1 = 50, x2 = 200;
    const y1 = f(x1), y2 = f(x2);
    return { driver: "tariff", value: x1 - (y1 * (x2 - x1)) / (y2 - y1), slope: (y2 - y1) / (x2 - x1) };
  }
  const f = (g) => evaluateCore(loc, sims, { ...sc, lngLR: g }, costs, flatPath(sc, MAX_MONTHS, { lngLR: g }), timing, deployM).npv;
  const x1 = 6, x2 = 30;
  const y1 = f(x1), y2 = f(x2);
  return { driver: "lng", value: x1 - (y1 * (x2 - x1)) / (y2 - y1), slope: (y2 - y1) / (x2 - x1) };
}

// NPV across a range of long-run driver levels, with and without the selected shock.
export function sensitivity(loc, sims, sc, costs, timing, deployM) {
  const pts = [];
  if (loc.useCase === "island") {
    for (let b = 30; b <= 200; b += 10) {
      const flat = evaluateCore(loc, sims, sc, costs, flatPath(sc, MAX_MONTHS, { brentLR: b }), timing, deployM).npv;
      const s2 = { ...sc, brentLR: b, brentShock: b + (sc.brentShock - sc.brentLR) };
      const shock = evaluateCore(loc, sims, s2, costs, buildScenarioPath(s2), timing, deployM).npv;
      pts.push({ x: b, flat, shock });
    }
    return { driver: "brent", unit: "$/bbl", label: "Long-run Brent", pts };
  }
  if (loc.useCase === "industrial") {
    for (let t = 40; t <= 240; t += 10) {
      const flat = evaluateCore(loc, sims, sc, costs, flatPath(sc), timing, deployM, t).npv;
      const shock = evaluateCore(loc, sims, sc, costs, buildScenarioPath(sc), timing, deployM, t).npv;
      pts.push({ x: t, flat, shock });
    }
    return { driver: "tariff", unit: "$/MWh", label: "Grid tariff (pre-shock)", pts };
  }
  for (let g = 4; g <= 48; g += 2) {
    const flat = evaluateCore(loc, sims, { ...sc, lngLR: g }, costs, flatPath(sc, MAX_MONTHS, { lngLR: g }), timing, deployM).npv;
    const s2 = { ...sc, lngLR: g, lngShock: g + (sc.lngShock - sc.lngLR) };
    const shock = evaluateCore(loc, sims, s2, costs, buildScenarioPath(s2), timing, deployM).npv;
    pts.push({ x: g, flat, shock });
  }
  return { driver: "lng", unit: "$/MMBtu", label: "Long-run LNG", pts };
}

// ---- Monte Carlo ----------------------------------------------------------------
// Mean-reverting (OU) log-price noise on Brent and LNG + recurring disruption events
// (Bernoulli start each month, user-defined shock archetype). Savings are linear in
// prices, so each path's NPV is the deterministic NPV plus a discounted price delta.
export function monteCarlo(loc, sims, sc, costs, path, core, nPaths = 400) {
  const { base, hyb } = sims;
  const H = core.H, lead = core.lead;
  const rng = mulberry32(hashSeed(`${loc.id}|${sc.volatility}|${sc.recurProb}|${sc.durationDays}`));
  const g = gaussFactory(rng);
  const kappa = Math.log(2) / 2; // 2-year half-life of deviations
  const dt = 1 / 12;
  const a = Math.exp(-kappa * dt);
  const sdStep = sc.volatility * Math.sqrt((1 - a * a) / (2 * kappa));
  const evMonths = Math.max(1, Math.round(sc.durationDays / 30.4375));
  const pStart = 1 - (1 - sc.recurProb) ** (1 / 12);
  const quietUntil = Math.ceil(path.D + path.R);
  const hz = loc.hzOil ?? 0;
  const varAt = new Float64Array(H);
  for (let m = 0, v = 0; m < H; m++) { v = a * a * v + sdStep * sdStep; varAt[m] = v; }
  const npvs = new Float64Array(nPaths), pvBase = new Float64Array(nPaths), pvHyb = new Float64Array(nPaths);
  let detBasePV = 0, detHybPV = 0;
  for (let m = 0; m < H; m++) { detBasePV += core.baseCost[m] * core.df[m]; detHybPV += core.hybCost[m] * core.df[m]; }

  for (let p = 0; p < nPaths; p++) {
    let xb = 0, xg = 0, ev = 0;
    let dNpv = 0, dBase = 0, dHyb = 0;
    for (let m = 0; m < H; m++) {
      const e1 = g(), e2 = 0.5 * e1 + Math.sqrt(0.75) * g();
      xb = a * xb + sdStep * e1;
      xg = a * xg + sdStep * e2;
      if (m >= quietUntil) {
        if (ev > 0) ev--;
        else if (rng() < pStart) ev = evMonths;
      }
      const inEv = ev > 0;
      const b0 = path.brent[m], c0 = path.crack[m], l0 = path.lng[m], s0 = path.surch[m];
      // mean-preserving lognormal noise: E[exp(x - v/2)] = 1, so volatility alone does not move the mean
      const v = varAt[m];
      const b1 = (inEv ? sc.brentShock : b0) * Math.exp(xb - v / 2);
      const c1 = inEv ? sc.crackShock : c0;
      const l1 = (inEv ? sc.lngShock : l0) * Math.exp(xg - v / 2);
      const s1 = inEv ? sc.freightSurcharge : s0;
      let db = 0, dh = 0;
      if (loc.useCase === "island") {
        const dp = (b1 + c1 - b0 - c0) / L_PER_BBL + (s1 - s0) * hz;
        db = (base.fuelL / 12) * dp;
        dh = m < lead ? db : (hyb.fuelL / 12) * dp;
      } else if (loc.useCase === "industrial") {
        const idx0 = loc.gridFuel === "oil" ? b0 / sc.brentLR : l0 / sc.lngLR;
        const idx1 = loc.gridFuel === "oil" ? b1 / sc.brentLR : l1 / sc.lngLR;
        const dT = loc.tariff * loc.tariffLink * (idx1 - idx0);
        const dp = (b1 + c1 - b0 - c0) / L_PER_BBL + (s1 - s0) * hz;
        db = (base.gridMWh / 12) * dT + (base.backupFuelL / 12) * dp;
        dh = m < lead ? db : (hyb.gridMWh / 12) * dT + (hyb.backupFuelL / 12) * dp;
      } else {
        const dg = loc.heatRate * (l1 - l0);
        db = (base.gasMWh / 12) * dg;
        dh = m < lead ? db : (hyb.gasMWh / 12) * dg;
      }
      const d = core.df[m];
      dNpv += (db - dh) * d;
      dBase += db * d;
      dHyb += dh * d;
    }
    npvs[p] = core.npv + dNpv;
    pvBase[p] = detBasePV + dBase;
    pvHyb[p] = detHybPV + dHyb;
  }
  const sorted = Array.from(npvs).sort((x, y) => x - y);
  const q = (f) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(f * (sorted.length - 1))))];
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const sd = (arr) => {
    const mu = arr.reduce((s, v) => s + v, 0) / arr.length;
    return Math.sqrt(arr.reduce((s, v) => s + (v - mu) ** 2, 0) / arr.length);
  };
  const sdBase = sd(pvBase), sdHyb = sd(pvHyb);
  return {
    npvs: sorted,
    p10: q(0.1), p50: q(0.5), p90: q(0.9), mean,
    probPositive: sorted.filter((v) => v > 0).length / sorted.length,
    sdBase, sdHyb,
    hedge: sdBase > 0 ? 1 - sdHyb / sdBase : 0,
  };
}

// ---- resilience -----------------------------------------------------------------
// Physical fuel shortfall s = disruption × site Hormuz exposure × (1 − market
// substitution). A fixed tank sized to N days of diesel-only burn buffers it; once
// empty, the shortfall share of fuel-dependent energy goes unserved.
export function resilience(loc, sims, sc, deployM, timing) {
  const { base, hyb } = sims;
  const s = loc.useCase === "industrial" ? 0 : Math.min(1, (sc.disruption || 0) * (loc.useCase === "lng" ? (loc.hzLng ?? 0) * (1 - (loc.switchShare ?? 0)) : loc.hzOil ?? 0) * (1 - sc.substitution));
  const isGas = loc.useCase === "lng";
  const fuelB = isGas ? base.gasMWh : base.fuelL;
  const fuelH = isGas ? hyb.gasMWh : hyb.fuelL;
  const eB = isGas ? base.gasMWh : base.dieselMWh;
  const eH = isGas ? hyb.gasMWh : hyb.dieselMWh;
  const days = Math.round(sc.durationDays);
  const storageDays = loc.storageDays ?? 30;
  const V = (storageDays * fuelB) / 365;
  const run = (switchDay) => {
    let stock = V, ue = 0, firstShort = null;
    for (let d = 0; d < days; d++) {
      const hybOn = d >= switchDay;
      const use = (hybOn ? fuelH : fuelB) / 365;
      const ePerFuel = hybOn ? (fuelH > 0 ? eH / fuelH : 0) : fuelB > 0 ? eB / fuelB : 0;
      stock += (1 - s) * use - use;
      if (stock < 0) {
        ue += -stock * ePerFuel;
        stock = 0;
        if (firstShort === null) firstShort = d;
      }
    }
    return { ue, firstShort };
  };
  const switchDay = timing === "preemptive" ? 0 : deployM * 30.4375;
  const dOnly = run(Infinity);
  const withH = run(switchDay);
  const preH = run(0);
  const autonomy = (fuel) => (s > 0 && fuel > 0 ? V / ((s * fuel) / 365) : Infinity);
  const voll = sc.voll;
  // Expected annual value of recurring disruptions (same archetype, hybrid in place)
  const expectedAnnual = sc.recurProb * Math.max(0, dOnly.ue - preH.ue) * voll;
  return {
    shortfall: s,
    storageDays,
    autonomyBase: autonomy(fuelB),
    autonomyHyb: autonomy(fuelH),
    ueBase: dOnly.ue,
    ueHyb: withH.ue,
    uePre: preH.ue,
    avoidedValue: Math.max(0, dOnly.ue - withH.ue) * voll,
    avoidedValuePre: Math.max(0, dOnly.ue - preH.ue) * voll,
    expectedAnnual,
    firstShortBase: dOnly.firstShort,
  };
}

// ---- full evaluation ------------------------------------------------------------
export function evaluateLocation(loc, ctx, { withMC = false, withSens = false } = {}) {
  const { sc, path, costsFor, sizingFor, tech, timing } = ctx;
  const costs = costsFor(loc);
  const sizing = sizingFor(loc);
  const sims = runSims(loc, sizing, tech);
  const dep = deployMonths(loc, sizing, costs, sc);
  const core = evaluateCore(loc, sims, sc, costs, path, timing, dep.mid);
  const corePre = timing === "preemptive" ? core : evaluateCore(loc, sims, sc, costs, path, "preemptive", dep.mid);
  const flat = flatPath(sc);
  const coreFlat = evaluateCore(loc, sims, sc, costs, flat, timing, dep.mid);
  const lc = lcoe(loc, sims, sc, costs, path);
  const lcFlat = lcoe(loc, sims, sc, costs, flat);
  const be = breakEven(loc, sims, sc, costs, timing, dep.mid);
  const res = resilience(loc, sims, sc, dep.mid, timing);
  const out = {
    loc, costs, sizing, sims, dep, core, corePre, coreFlat, lcoe: lc, lcoeFlat: lcFlat, breakEven: be, res,
    valueOfEarly: corePre.npv - core.npv,
    fuelSavedL: sims.base.fuelL - sims.hyb.fuelL + (sims.base.backupFuelL - sims.hyb.backupFuelL),
    gasSavedMWh: sims.base.gasMWh - sims.hyb.gasMWh,
    gridSavedMWh: sims.base.gridMWh - sims.hyb.gridMWh,
  };
  if (withMC) out.mc = monteCarlo(loc, sims, sc, costs, path, core);
  if (withSens) out.sens = sensitivity(loc, sims, sc, costs, timing, dep.mid);
  return out;
}

// ---- screening proxy for country layers ------------------------------------------
export function levelizedPrices(path, wacc, years) {
  const rm = monthlyRate(wacc);
  let sd = 0, sb = 0, sc_ = 0, sl = 0, ss = 0;
  for (let m = 0; m < years * 12; m++) {
    const d = 1 / (1 + rm) ** (m + 1);
    sd += d; sb += path.brent[m] * d; sc_ += path.crack[m] * d; sl += path.lng[m] * d; ss += path.surch[m] * d;
  }
  return { brent: sb / sd, crack: sc_ / sd, lng: sl / sd, surch: ss / sd };
}

export function screeningAdvantage(country, sc, costs, lev) {
  if (!country || !country.pvout) return null;
  const pd = (lev.brent + lev.crack) / L_PER_BBL + (country.logi ?? 0.15) * sc.logisticsMult + lev.surch * (country.hzOil ?? 0) + 0.08;
  const dieselMWh = 280 * pd + costs.dieselVarOM; // 0.28 L/kWh fleet average
  const c = crf(costs.wacc, costs.life);
  const pvLcoe = ((costs.pvCapex * c + costs.pvOM) / country.pvout) * 1000;
  const storPerMWh = ((costs.battCapex * crf(costs.wacc, costs.battReplYear) * 1000) / (330 * 0.9)) + costs.battCapex * costs.battOMpct * 1000 / (330 * 0.9);
  const hybrid = 0.55 * pvLcoe + 0.45 * (pvLcoe / 0.88 + storPerMWh);
  return { dieselMWh, pvLcoe, hybrid, advantage: dieselMWh - hybrid, dieselPrice: pd };
}
