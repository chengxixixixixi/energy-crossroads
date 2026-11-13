import React, { useState } from "react";
import { USE_CASES } from "../data/locations";
import { Tag, Info, Btn, Segmented, SectionTitle, fmtMoney, fmtNum, fmtPct, fmtEnergy, fmtLitres, roundTo } from "./ui";
import { TimeSeries, CostStack, Sensitivity, Histogram, Dispatch, PriceChain } from "./charts";

export function verdict(r) {
  const p = r.mc?.probPositive ?? (r.core.npv > 0 ? 1 : 0);
  if (r.core.npv > 0 && p >= 0.8) return { label: "Attractive", tone: "#45c2b5", note: "Positive NPV in at least 80% of simulated price paths." };
  if (r.core.npv > 0 || p >= 0.5) return { label: "Conditional", tone: "#e8c56a", note: "Value depends on the price path or on timing." };
  return { label: "Not yet economic", tone: "#e0835a", note: "Negative NPV in most simulated paths at these assumptions." };
}

export function breakEvenText(r, sc) {
  const be = r.breakEven;
  if (be.driver === "brent") {
    if (be.value < 30) return { main: "< $30/bbl", sub: "economic at any plausible oil price, given this site's delivered-fuel costs", clause: "it stays NPV-positive even at $30/bbl long-run Brent" };
    if (be.value > 200) return { main: "> $200/bbl", sub: "needs extreme oil prices", clause: "it needs long-run Brent above $200/bbl to break even" };
    return { main: `≈ $${roundTo(be.value, 5)}/bbl`, sub: `long-run Brent · delivered diesel ≈ $${be.diesel.toFixed(2)}/L`, clause: `it breaks even at about $${roundTo(be.value, 5)}/bbl long-run Brent (≈ $${be.diesel.toFixed(2)}/L delivered diesel)` };
  }
  if (be.driver === "lng") {
    if (be.value < 4) return { main: "< $4/MMBtu", sub: "economic at any plausible LNG price", clause: "it stays NPV-positive even at $4/MMBtu LNG" };
    return { main: `≈ $${roundTo(be.value, 0.5).toFixed(1)}/MMBtu`, sub: `long-run LNG (now assumed $${sc.lngLR.toFixed(1)})`, clause: `it breaks even at about $${roundTo(be.value, 0.5).toFixed(1)}/MMBtu long-run LNG, against $${sc.lngLR.toFixed(1)} assumed` };
  }
  return { main: `≈ $${roundTo(be.value, 5)}/MWh`, sub: `pre-shock grid tariff (site tariff $${r.loc.tariff})`, clause: `it breaks even at a grid tariff of about $${roundTo(be.value, 5)}/MWh, against $${r.loc.tariff} today` };
}

export function summaryText(r, sc) {
  const L = r.loc, uc = L.useCase;
  const shockM = sc.durationDays / 30.4375;
  const dep = Math.round(r.dep.mid);
  const mc = r.mc;
  const range = mc ? ` (risk-adjusted P10–P90 ${fmtMoney(mc.p10)} to ${fmtMoney(mc.p90)})` : "";
  let what;
  if (uc === "island") what = `Solar + storage cuts diesel burn at ${L.name} by ${Math.round((r.fuelSavedL / r.sims.base.fuelL) * 100)}% (${fmtLitres(r.fuelSavedL)} a year)`;
  else if (uc === "industrial") what = `On-site solar + storage covers ${Math.round(r.sims.hyb.reFraction * 100)}% of ${L.name}'s demand and cuts grid purchases by ${fmtEnergy(r.gridSavedMWh)} a year`;
  else what = `Renewables + storage displace ${Math.round((r.gasSavedMWh / r.sims.base.gasMWh) * 100)}% of LNG-fired output in the ${L.name} tranche (${fmtEnergy(r.gasSavedMWh)} a year)`;
  const be = breakEvenText(r, sc);
  const npvTxt = `${r.core.npv >= 0 ? "adds" : "loses"} ${fmtMoney(Math.abs(r.core.npv))} of NPV at a ${(r.costs.wacc * 100).toFixed(1)}% real discount rate${range}`;
  const timing = r.core.lead === 0
    ? "Built pre-emptively, it is in place for the whole disruption."
    : dep >= shockM
      ? `Ordered today it comes online in about ${dep} months, after the modelled disruption ends: most of its value is the hedge against the next shock. Having it in place before this one would have been worth ${fmtMoney(r.valueOfEarly)} more.`
      : `Ordered today it comes online in about ${dep} months, while the disruption is still running; being in place earlier would have been worth ${fmtMoney(r.valueOfEarly)} more.`;
  return `${what}. It ${npvTxt}, and ${be.clause}. ${timing}`;
}

function Kpi({ label, value, sub, tier = "estimated", info, tone }) {
  return (
    <div className="min-w-0 rounded-[3px] border border-line bg-bg px-2.5 py-2">
      <div className="flex items-start justify-between gap-1">
        <span className="flex items-center text-[11px] leading-tight text-ink3">{label}{info && <Info text={info} />}</span>
        <Tag tier={tier} />
      </div>
      <div className="num mt-0.5 truncate text-[17px] font-medium" style={{ color: tone || "var(--ink)" }}>{value}</div>
      {sub && <div className="mt-0.5 text-[10.5px] leading-snug text-ink3">{sub}</div>}
    </div>
  );
}

export default function Dashboard({ r, sc, path, timing, setTiming, onCompare, inCompare, onOptimize, optimizing, editor }) {
  const L = r.loc, uc = L.useCase, U = USE_CASES[uc];
  const v = verdict(r);
  const E = r.sims.base.loadMWh / 12;
  const shockCost = r.core.baseCost[0] / E;
  const be = breakEvenText(r, sc);
  const res = r.res;
  const [showEdit, setShowEdit] = useState(false);
  const exposure = uc === "lng" ? L.hzLng : L.hzOil;
  const dep = r.dep;
  const shockM = sc.durationDays / 30.4375;
  const auton = (d) => (isFinite(d) ? `${fmtNum(Math.min(d, 9999))} d` : "no shortfall");

  return (
    <section aria-labelledby="dash-title" className="panel p-3">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <div className="eyebrow">Investment decision · {U.label}</div>
          <h2 id="dash-title" className="font-cond text-[22px] font-semibold leading-tight text-ink">{L.name} <span className="font-normal text-ink3">· {L.region}</span></h2>
          <div className="text-[12px] text-ink3">{U.incumbent} vs {U.alt.toLowerCase()} · {L.note}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center text-[11.5px] text-ink3">Investment timing<Info text="Reactive: you decide today; capital is spent now and at commissioning, and savings start only after the deployment lead time. Pre-emptive: the system was already built before this disruption." /></span>
          <Segmented value={timing} onChange={setTiming} options={[{ value: "reactive", label: "Decide now" }, { value: "preemptive", label: "Already built" }]} />
          <Btn onClick={onCompare} title="Add or remove this site from the comparison (max 3)">{inCompare ? "− Compare" : "+ Compare"}</Btn>
          <Btn onClick={() => setShowEdit(!showEdit)}>{showEdit ? "Close editor" : "Edit site"}</Btn>
          <Btn variant="primary" onClick={onOptimize} disabled={optimizing} title="Search solar and storage sizes for the highest NPV under the current scenario">{optimizing ? "Optimising…" : "Optimise sizing"}</Btn>
        </div>
      </div>

      {showEdit && <div className="border-b border-line py-3">{editor}</div>}

      <div className="grid gap-3 py-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-[3px] border border-line bg-bg px-3 py-2.5">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-[3px] px-1.5 py-[1px] font-cond text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: v.tone, border: `1px solid ${v.tone}66`, background: `${v.tone}14` }}>{v.label}</span>
            <span className="text-[11px] text-ink3">{v.note}</span>
            <Tag tier="estimated" />
          </div>
          <p className="max-w-[90ch] text-[13.5px] leading-relaxed text-ink">{summaryText(r, sc)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <Kpi label="Solar sized" value={`${fmtNum(r.sims.hyb.pvMW, r.sims.hyb.pvMW < 10 ? 1 : 0)} MWp`} sub={`${r.sizing.pvRatio}× average load`} tier="hypothetical" />
          <Kpi label="Storage sized" value={`${fmtNum(r.sims.hyb.battMWh, r.sims.hyb.battMWh < 10 ? 1 : 0)} MWh`} sub={`${r.sizing.battHours} h of average load`} tier="hypothetical" />
          <Kpi label="Capital cost" value={fmtMoney(r.core.capex)} sub={`+ ${fmtMoney(r.core.repl)} battery replacement, yr ${r.costs.battReplYear}`} />
          <Kpi label="Average load" value={`${fmtNum(L.avgMW, L.avgMW < 10 ? 1 : 0)} MW`} sub={`${fmtEnergy(r.sims.base.loadMWh)} a year`} tier="illustrative" />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2">
          <SectionTitle>Exposure</SectionTitle>
          <Kpi label="Hormuz physical exposure" value={fmtPct(exposure)} tier="illustrative" tone="#f3c27a"
            sub={uc === "lng" ? `Share of LNG supply via Hormuz; ${fmtPct(L.switchShare ?? 0)} of units can switch fuel` : "Share of fuel supply chain tied to Hormuz transits"}
            info="Physical exposure decides shortage risk. Price exposure is universal: every oil importer pays the global price." />
          <Kpi label="Solar resource" value={`${fmtNum(L.pvout)} kWh/kWp·yr`} tier={L.pvoutTier || "illustrative"} tone="#7fd8cc" sub={`Capacity factor ${fmtPct(L.pvout / 8760, 1)}${L.windCF ? ` · wind CF ${fmtPct(L.windCF)}` : ""}`} />
          <Kpi label="Fuel-stock autonomy in this shock" value={uc === "industrial" ? "n/a" : `${auton(res.autonomyBase)} → ${auton(res.autonomyHyb)}`}
            sub={uc === "industrial" ? "Grid-supplied; see outage ride-through below" : `Days until tanks run dry at a ${fmtPct(res.shortfall)} supply shortfall, same tank size`}
            info="Shortfall = disruption × site exposure × (1 − market substitution)(× (1 − fuel-switching) for gas). Tank sized to the stated days of fossil-only burn." />
        </div>
        <div className="space-y-2">
          <SectionTitle>Cost of supply</SectionTitle>
          <Kpi label="Baseline, no shock" value={`$${fmtNum(r.lcoeFlat.baseTotal)}/MWh`} sub={`${U.incumbent}, levelised at long-run prices`} tone="#f3c27a" />
          <Kpi label="Under the selected shock" value={`$${fmtNum(shockCost)}/MWh`} sub={`Month-1 running cost, ${U.incumbent.toLowerCase()} (${shockCost >= r.lcoeFlat.baseTotal ? "+" : ""}${Math.round((shockCost / r.lcoeFlat.baseTotal - 1) * 100)}%)`} tone="#f3c27a" />
          <Kpi label="With solar + storage" value={`$${fmtNum(r.lcoe.hybTotal)}/MWh`} sub={`vs $${fmtNum(r.lcoe.baseTotal)} fossil-only, levelised on this scenario`} tone="#7fd8cc"
            info="Levelised cost of reliable supply: discounted lifetime costs ÷ discounted energy served. Same demand and same firm fossil capacity in both systems." />
        </div>
        <div className="space-y-2">
          <SectionTitle>Investment</SectionTitle>
          <Kpi label="Incremental NPV" value={fmtMoney(r.core.npv)} tone={r.core.npv >= 0 ? "#7fd8cc" : "#f0a37a"}
            sub={r.mc ? `P10 ${fmtMoney(r.mc.p10)} · P90 ${fmtMoney(r.mc.p90)} · P(>0) ${Math.round(r.mc.probPositive * 100)}%` : ""}
            info="Present value of fuel and O&M savings minus solar, storage and replacement capital, versus keeping the fossil-only system. Deterministic path; the range is from the Monte Carlo." />
          <Kpi label="Payback" value={r.core.payback ? `${r.core.payback.toFixed(1)} yrs` : "> life"} sub={r.core.paybackD ? `discounted ${r.core.paybackD.toFixed(1)} yrs, from today` : "not reached on a discounted basis"} />
          <Kpi label="Break-even" value={be.main} sub={be.sub} info="Flat long-run price at which incremental NPV is zero with no further shocks. NPV is linear in this price, so it is solved exactly." />
        </div>
        <div className="space-y-2">
          <SectionTitle>Energy security</SectionTitle>
          <Kpi label={uc === "island" ? "Diesel avoided" : uc === "industrial" ? "Grid energy avoided" : "LNG-fired output avoided"}
            value={uc === "island" ? `${fmtLitres(r.fuelSavedL)}/yr` : uc === "industrial" ? `${fmtEnergy(r.gridSavedMWh)}/yr` : `${fmtEnergy(r.gasSavedMWh)}/yr`}
            sub={uc === "island" ? `≈ ${fmtNum(r.fuelSavedL / 158.987)} bbl/yr · renewable share ${fmtPct(r.sims.hyb.reFraction)}` : uc === "lng" ? `≈ ${fmtNum((r.gasSavedMWh * L.heatRate) / 52e3 / 1e3, 2)} Mt LNG/yr · renewable share ${fmtPct(r.sims.hyb.reFraction)}` : `renewable share ${fmtPct(r.sims.hyb.reFraction)} · backup diesel −${fmtLitres(r.sims.base.backupFuelL - r.sims.hyb.backupFuelL)}/yr`} />
          <Kpi label="Resilience value" tone="#7fd8cc"
            value={uc === "industrial" ? `${fmtNum((r.sims.hyb.battMWh * 0.9) / (L.avgMW * 0.5), 1)} h ride-through` : res.avoidedValuePre > 0 ? fmtMoney(res.avoidedValuePre) : "$0"}
            sub={uc === "industrial" ? "Battery hours at 50% critical load during outages" : res.shortfall === 0 ? "No physical shortfall in this scenario" : `Avoided unserved energy if in place before this shock (${fmtEnergy(res.uePre ? res.ueBase - res.uePre : res.ueBase)}). Built now: ${fmtMoney(res.avoidedValue)}. Expected ${fmtMoney(res.expectedAnnual)}/yr from repeats.`}
            info="Unserved energy × value of lost load. Reported separately from NPV because VoLL is a social cost, not a project cash flow." />
          <Kpi label="Time to deploy" value={`~${Math.round(dep.mid)} months`} sub={`range ${Math.round(dep.low)}–${Math.round(dep.high)} · disruption window ${shockM < 1 ? "< 1" : Math.round(shockM)} months`} tier="estimated"
            info="Indicative: procurement/permitting base by system type + construction scaling with size, stretched 25% × disruption for supply-chain stress." />
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        <TimeSeries r={r} path={path} driver={uc === "island" ? "brent" : uc === "lng" ? "lng" : "tariff"} />
        <div className="grid gap-3 lg:grid-cols-3">
          <CostStack r={r} useCase={uc} />
          <Sensitivity r={r} sc={sc} />
          <Histogram r={r} sc={sc} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Dispatch r={r} />
          {uc !== "lng" ? <PriceChain r={r} sc={sc} path={path} /> : <LngChain r={r} sc={sc} path={path} />}
        </div>
      </div>
    </section>
  );
}

function LngChain({ r, sc, path }) {
  const L = r.loc;
  const now = L.heatRate * (path.lng[0] + (L.regas ?? 1)) + r.costs.gasVarOM;
  const lr = L.heatRate * (sc.lngLR + (L.regas ?? 1)) + r.costs.gasVarOM;
  return (
    <div className="panel p-3">
      <div className="flex items-center gap-2"><h3 className="font-cond text-[13px] font-semibold">Gas generation marginal cost</h3><Tag tier="estimated" /></div>
      <p className="mt-1 text-[11.5px] text-ink3">Heat rate × (LNG + regasification) + variable O&M. Existing plants are retained for firm capacity, so renewables compete with this running cost only.</p>
      <div className="num mt-3 grid grid-cols-3 gap-2 text-[12px]">
        <div className="rounded-[3px] border border-line px-2 py-1.5"><div className="text-[10.5px] text-ink3">Heat rate</div>{L.heatRate} MMBtu/MWh</div>
        <div className="rounded-[3px] border border-line px-2 py-1.5"><div className="text-[10.5px] text-ink3">Now</div>${fmtNum(now)}/MWh</div>
        <div className="rounded-[3px] border border-line px-2 py-1.5"><div className="text-[10.5px] text-ink3">Long-run</div>${fmtNum(lr)}/MWh</div>
      </div>
      <p className="mt-2 text-[11px] text-ink3">At ${sc.lngShock.toFixed(1)}/MMBtu every MWh of gas-fired power costs about ${fmtNum(now - lr)} more than at the ${sc.lngLR.toFixed(1)} long-run level. The renewable tranche avoids {fmtEnergy(r.gasSavedMWh)} of it each year.</p>
    </div>
  );
}
