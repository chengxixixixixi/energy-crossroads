import { LOCATIONS } from "../../src/data/locations";
import { COSTS, TECH, SIZING, BASE_SCENARIO } from "../../src/data/defaults";
import { buildScenarioPath, evaluateLocation, dieselPrice } from "../../src/model/finance";
import { BRENT_MONTHLY, BRENT_MONTHLY_DATES } from "../../src/data/history";
const sc = { ...BASE_SCENARIO };
const path = buildScenarioPath(sc);
const ctx = { sc, path, costsFor: (l) => COSTS[l.useCase], sizingFor: (l) => SIZING[l.useCase], tech: TECH, timing: "reactive" };
const t0 = Date.now();
for (const loc of LOCATIONS) {
  const r = evaluateLocation(loc, ctx, { withMC: true, withSens: false });
  const b = r.sims.base, h = r.sims.hyb;
  console.log(loc.id.padEnd(14), loc.useCase.padEnd(10),
    "RE", (h.reFraction*100).toFixed(0)+"%",
    "LCOE base", r.lcoe.baseTotal.toFixed(0), "hyb", r.lcoe.hybTotal.toFixed(0),
    "flat", r.lcoeFlat.baseTotal.toFixed(0), r.lcoeFlat.hybTotal.toFixed(0),
    "NPV $M", (r.core.npv/1e6).toFixed(1), "pre", (r.corePre.npv/1e6).toFixed(1),
    "BE", r.breakEven.driver, r.breakEven.value.toFixed(0),
    "pay", r.core.payback?.toFixed(1),
    "dep", r.dep.mid.toFixed(0),
    "MC p10/50/90", (r.mc.p10/1e6).toFixed(0), (r.mc.p50/1e6).toFixed(0), (r.mc.p90/1e6).toFixed(0), "P>0", r.mc.probPositive.toFixed(2), "hedge", r.mc.hedge.toFixed(2),
    "res s", r.res.shortfall.toFixed(2), "aut", r.res.autonomyBase.toFixed(0), r.res.autonomyHyb.toFixed(0), "UE", r.res.ueBase.toFixed(0), r.res.ueHyb.toFixed(0),
    "unserved", b.unservedMWh.toFixed(1), h.unservedMWh.toFixed(1),
    "L/kWh", (b.fuelL/ (b.dieselMWh||1)/1000).toFixed(3), (h.fuelL/(h.dieselMWh||1)/1000).toFixed(3), "curt", (h.curtailMWh/h.reGenMWh*100).toFixed(0)+"%", "cyc", h.battCyclesPerYr.toFixed(0));
}
console.log("ms", Date.now()-t0);
const mv = LOCATIONS[0];
console.log("diesel $/L m0", dieselPrice(mv, sc, path, 0).toFixed(3), "m24", dieselPrice(mv, sc, path, 30).toFixed(3));
const i = (d)=>BRENT_MONTHLY_DATES.indexOf(d);
console.log("1990-07", BRENT_MONTHLY[i("1990-07")], "1990-10", BRENT_MONTHLY[i("1990-10")], "2011-01",BRENT_MONTHLY[i("2011-01")],"2011-04",BRENT_MONTHLY[i("2011-04")], "2019-08..11", [8,9,10,11].map(m=>BRENT_MONTHLY[i("2019-"+String(m).padStart(2,"0"))]));
// timing second pass (sims cached)
{ const t1 = Date.now(); for (const loc of LOCATIONS) evaluateLocation(loc, ctx, {}); console.log("pass2 no-MC ms", Date.now()-t1);
  const t2 = Date.now(); evaluateLocation(LOCATIONS[0], ctx, {withMC:true, withSens:true}); console.log("one full ms", Date.now()-t2); }
