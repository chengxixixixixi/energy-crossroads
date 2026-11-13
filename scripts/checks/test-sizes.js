import { LOCATIONS } from "../../src/data/locations";
import { COSTS, TECH, BASE_SCENARIO } from "../../src/data/defaults";
import { buildScenarioPath, evaluateCore, deployMonths } from "../../src/model/finance";
import { runSims } from "../../src/model/dispatch";
const sc = { ...BASE_SCENARIO }; const path = buildScenarioPath(sc);
for (const id of ["mv-addu","to-tongatapu","bb-barbados","cv-saovicente","sc-mahe"]) {
  const L = LOCATIONS.find(l=>l.id===id);
  for (const [pv,bh] of [[2.5,4],[3,5],[4.5,10],[5,12],[5.5,14],[6,16],[7,18]]) {
    const sz={pvRatio:pv,battHours:bh,windRatio:0}; const s=runSims(L,sz,TECH); const c=COSTS.island;
    const dep=deployMonths(L,sz,c,sc); const core=evaluateCore(L,s,sc,c,path,"reactive",dep.mid);
    console.log(id.padEnd(14), pv, bh, "RE", (s.hyb.reFraction*100).toFixed(0), "curt", (s.hyb.curtailMWh/s.hyb.reGenMWh*100).toFixed(0), "capex $M", (core.capex/1e6).toFixed(1), "NPV $M", (core.npv/1e6).toFixed(1), "NPV/capex", (core.npv/core.capex).toFixed(2), "dep", dep.mid.toFixed(0));
  }
}
