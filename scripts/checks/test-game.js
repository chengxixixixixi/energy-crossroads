import { LOCATIONS } from "../../src/data/locations";
import { COSTS, TECH } from "../../src/data/defaults";
import { BASE, gamePath, makeEvent, evaluateOption, ledger, markToMarket, preCrisisCost, rollEvents, OPTIONS } from "../../src/game/engine";
const loc = LOCATIONS.find(l=>l.id==="mv-addu");
let events = [makeEvent("hormuz2026", 0, { months: 12, brent: 93 })];
let G = { events, base: BASE, costs: COSTS.island, tech: TECH, path: gamePath(events, BASE) };
console.log("brent m0..15", Array.from(G.path.brent.slice(0,16)).map(v=>v.toFixed(0)).join(" "));
const t=Date.now();
for (const k of ["diesel","hybrid","solar"]) { const r = evaluateOption(loc, k, 0, G); console.log(k, "capex", (r.core.capex/1e6).toFixed(1), "npv", (r.core.npv/1e6).toFixed(1), "RE", r.sims.hyb.reFraction.toFixed(2), "lead", r.dep.mid.toFixed(1), "mc", r.mc? r.mc.probPositive : "-", "aut", r.res.autonomyBase.toFixed(0), r.res.autonomyHyb.toFixed(0)); }
console.log("eval ms", Date.now()-t);
const dec = { option: "hybrid", month: 0, lead: 12, capex: evaluateOption(loc,"hybrid",0,G).core.capex };
// add a blockade at month 30 and cyclone at 31
events = [...events, makeEvent("blockade", 30), makeEvent("cyclone", 31, {siteId: loc.id})];
G = { ...G, events, path: gamePath(events, BASE) };
const L = ledger(loc, dec, G, 48);
for (const r of L.rows.filter(r=>[0,6,12,13,24,30,31,32,34,36,40,48].includes(r.m))) console.log(r.m, "brent", r.brent.toFixed(0), "$/L", r.p.toFixed(2), "cost/MWh", r.perMWh.toFixed(0), "cf", r.cfPerMWh.toFixed(0), "served", r.served.toFixed(3), r.cfServed.toFixed(3), "stock d", r.stockDays.toFixed(0), r.cfStockDays.toFixed(0), r.built);
console.log("pre-crisis $/MWh", preCrisisCost(loc, G).toFixed(0));
console.log("MtM", (markToMarket(loc, dec, G).npv/1e6).toFixed(1));
let n=0; for (let m=0;m<120;m++) n += rollEvents(m, 42, G.path, ["mv-addu","to-tongatapu"]).length; console.log("random events in 10y", n);
import { blockadeTest } from "../../src/game/engine";
for (const k of ["diesel","hybrid","solar"]) console.log("blockade", k, JSON.stringify(blockadeTest(loc, k, G)));
