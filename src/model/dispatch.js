// Hourly (8,760 h) dispatch of one supply configuration against one load profile.
// Reliability parity: in every configuration the incumbent dispatchable fleet
// (diesel, grid or gas) is retained at full firm capacity and serves whatever
// solar/wind/battery cannot, so the diesel-only and hybrid cases deliver the same
// demand at the same reliability. Only the energy mix and fuel burn differ.
import { solarProfile, windProfile, loadProfile, outageMask, peakOf } from "./profiles";

const simCache = new Map();

export function simKey(loc, sizing, tech) {
  return [
    loc.id, loc.lat.toFixed(2), loc.useCase, loc.avgMW, loc.pvout, loc.windCF || 0, loc.outageHours || 0,
    sizing.pvRatio, sizing.battHours, sizing.windRatio || 0,
    tech.rte, tech.socMin, tech.cRate, tech.dieselUnits, tech.minLoad, tech.noLoadL, tech.slopeL, tech.backupLperMWh, tech.dieselOff ? 1 : 0,
  ].join("|");
}

export function runSims(loc, sizing, tech) {
  const key = simKey(loc, sizing, tech);
  if (simCache.has(key)) return simCache.get(key);
  const shape = loc.useCase === "island" ? "island" : loc.useCase === "industrial" ? "industrial" : "system";
  const load = loadProfile(shape, loc.lat);
  const pv = solarProfile(loc.lat, loc.pvout);
  const wind = loc.windCF > 0 ? windProfile(loc.windCF, loc.id) : null;
  const outage = loc.useCase === "industrial" ? outageMask(loc.outageHours || 0, loc.id) : null;
  const incType = loc.useCase === "island" ? "diesel" : loc.useCase === "industrial" ? "grid" : "gas";
  const common = { load, pv, wind, outage, avgMW: loc.avgMW, incType, tech };
  const base = dispatch({ ...common, pvMW: 0, windMW: 0, battMWh: 0 });
  const hyb = dispatch({
    ...common,
    pvMW: sizing.pvRatio * loc.avgMW,
    windMW: wind ? (sizing.windRatio || 0) * loc.avgMW : 0,
    battMWh: sizing.battHours * loc.avgMW,
  });
  const res = { base, hyb, incType };
  if (simCache.size > 400) simCache.clear();
  simCache.set(key, res);
  return res;
}

export function dispatch({ load, pv, wind, outage, avgMW, incType, tech, pvMW, windMW, battMWh }) {
  const n = 8760;
  const peakMW = peakOf(load) * avgMW;
  const pB = battMWh * tech.cRate; // battery power (MW)
  const etaC = Math.sqrt(tech.rte);
  const etaD = Math.sqrt(tech.rte);
  const socMin = battMWh * tech.socMin;
  let soc = battMWh * 0.6;

  const units = tech.dieselUnits;
  const unitMW = (peakMW * 1.15) / units;
  const dieselOff = battMWh > 0 && tech.dieselOff; // grid-forming battery allows diesel-off hours

  let loadE = 0, reGen = 0, reUsed = 0, curtail = 0, chargeE = 0, dischargeE = 0;
  let fuelL = 0, dieselE = 0, unitHours = 0, waste = 0, unserved = 0;
  let gridE = 0, backupE = 0, backupFuelL = 0, gasE = 0, exportE = 0;

  // Weekly traces for the dispatch chart: typical week (late April) and lowest-solar week
  let worstStart = 0;
  if (pvMW > 0) {
    let worst = Infinity;
    for (let w = 0; w < 52; w++) {
      let s = 0;
      for (let i = w * 168; i < w * 168 + 168; i++) s += pv[i];
      if (s < worst) { worst = s; worstStart = w * 168; }
    }
  }
  const typStart = 16 * 168;
  const mkTrace = () => ({ load: new Float32Array(168), re: new Float32Array(168), batt: new Float32Array(168), inc: new Float32Array(168), curt: new Float32Array(168), soc: new Float32Array(168) });
  const tTyp = mkTrace();
  const tWorst = mkTrace();

  for (let i = 0; i < n; i++) {
    const L = load[i] * avgMW;
    const re = pvMW * pv[i] + (wind ? windMW * wind[i] : 0);
    loadE += L;
    reGen += re;
    let net = L - re;
    let dis = 0, cur = 0, residual = 0, incOut = 0;
    if (net < 0) {
      const sur = -net;
      const ch = Math.min(sur, pB, (battMWh - soc) / etaC);
      soc += ch * etaC;
      chargeE += ch;
      const rest = sur - ch;
      if (incType === "grid" && !(outage && outage[i])) exportE += rest; // valued at export credit (default 0)
      else cur = rest;
      curtail += cur;
      reUsed += re - rest;
    } else {
      reUsed += re;
      dis = Math.max(0, Math.min(net, pB, (soc - socMin) * etaD));
      soc -= dis / etaD;
      dischargeE += dis;
      residual = net - dis;
    }

    if (incType === "diesel") {
      let u = residual > 1e-9 ? Math.ceil(residual / unitMW - 1e-9) : 0;
      if (!dieselOff && u === 0) u = 1;
      u = Math.min(u, units);
      if (u > 0) {
        const C = u * unitMW;
        let P = Math.max(residual, tech.minLoad * C);
        P = Math.min(P, C);
        const excess = P - Math.min(residual, C);
        if (excess > 0) {
          const ch2 = Math.min(excess, Math.max(0, pB - dis), (battMWh - soc) / etaC);
          soc += ch2 * etaC;
          chargeE += ch2;
          waste += excess - ch2;
        }
        fuelL += tech.noLoadL * C + tech.slopeL * P;
        dieselE += P;
        incOut = P;
        unitHours += u;
        if (residual > C) unserved += residual - C;
      } else if (residual > 0) unserved += residual;
    } else if (incType === "grid") {
      if (outage && outage[i]) {
        backupE += residual;
        backupFuelL += residual * tech.backupLperMWh;
      } else gridE += residual;
      incOut = residual;
    } else {
      gasE += residual;
      incOut = residual;
    }

    const rec = (tr, start) => {
      const k = i - start;
      if (k >= 0 && k < 168) {
        tr.load[k] = L;
        tr.re[k] = Math.min(re, L); // renewable output serving load directly
        tr.batt[k] = dis;
        tr.inc[k] = incOut;
        tr.curt[k] = cur;
        tr.soc[k] = battMWh > 0 ? soc / battMWh : 0;
      }
    };
    rec(tTyp, typStart);
    rec(tWorst, worstStart);
  }

  const incE = incType === "diesel" ? dieselE : incType === "grid" ? gridE + backupE : gasE;
  return {
    loadMWh: loadE,
    peakMW,
    pvMW, windMW, battMWh,
    reGenMWh: reGen,
    reUsedMWh: reUsed,
    curtailMWh: curtail + waste,
    battThroughputMWh: dischargeE,
    battCyclesPerYr: battMWh > 0 ? dischargeE / battMWh : 0,
    fuelL,
    dieselMWh: dieselE,
    unitHours,
    gridMWh: gridE,
    backupMWh: backupE,
    backupFuelL,
    gasMWh: gasE,
    exportMWh: exportE,
    unservedMWh: unserved,
    incumbentMWh: incE,
    reFraction: Math.max(0, 1 - incE / loadE),
    dieselCapMW: peakMW * 1.15,
    traces: { typical: tTyp, worst: tWorst, worstStartDay: Math.floor(worstStart / 24), typStartDay: Math.floor(typStart / 24) },
  };
}
