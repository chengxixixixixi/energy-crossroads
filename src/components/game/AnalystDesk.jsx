import React, { useState } from "react";
import { OPTIONS, monthDate } from "../../game/engine";
import { SOURCES, SNAPSHOT_RETRIEVED } from "../../data/snapshot";
import { Slider, Tag, Segmented, TIERS } from "../ui";
import { TimeSeries, CostStack, Sensitivity, Histogram, Dispatch, PriceChain } from "../charts";
import { breakEvenText } from "../Dashboard";
import { money } from "./Panels";

export default function AnalystDesk({ loc, opts, tests, month, decision, base, setBase, costs, setCosts }) {
  const [which, setWhich] = useState(decision && decision.option !== "diesel" ? decision.option : "hybrid");
  const r = opts[which];
  const rows = [
    ["Capital cost", (k, x) => (k === "diesel" ? "$0" : money(x.core.capex)), "estimated"],
    ["Solar / storage sized", (k, x) => (k === "diesel" ? "—" : `${x.sims.hyb.pvMW.toFixed(1)} MWp / ${Math.round(x.sims.hyb.battMWh)} MWh`), "hypothetical"],
    ["Renewable share of supply", (k, x) => (k === "diesel" ? "0%" : `${Math.round(x.sims.hyb.reFraction * 100)}%`), "estimated"],
    ["Curtailed solar", (k, x) => (k === "diesel" ? "—" : `${Math.round((x.sims.hyb.curtailMWh / Math.max(1, x.sims.hyb.reGenMWh)) * 100)}%`), "estimated"],
    ["LCOE on this scenario, $/MWh", (k, x) => `$${Math.round(k === "diesel" ? x.lcoe.baseTotal : x.lcoe.hybTotal)}`, "estimated"],
    ["LCOE with no shock, $/MWh", (k, x) => `$${Math.round(k === "diesel" ? x.lcoeFlat.baseTotal : x.lcoeFlat.hybTotal)}`, "estimated"],
    ["Incremental NPV vs diesel", (k, x) => (k === "diesel" ? "—" : money(x.core.npv)), "estimated"],
    ["NPV P10 / P90 (Monte Carlo)", (k, x) => (k === "diesel" || !x.mc ? "—" : `${money(x.mc.p10)} / ${money(x.mc.p90)}`), "estimated"],
    ["P(NPV > 0)", (k, x) => (k === "diesel" || !x.mc ? "—" : `${Math.round(x.mc.probPositive * 100)}%`), "estimated"],
    ["Payback (simple)", (k, x) => (k === "diesel" ? "—" : x.core.payback ? `${x.core.payback.toFixed(1)} yrs` : "> life"), "estimated"],
    ["Break-even long-run Brent", (k, x) => (k === "diesel" ? "—" : breakEvenText(x, x.sc).main), "estimated"],
    ["Diesel burn, litres/yr", (k, x) => `${((k === "diesel" ? x.sims.base.fuelL : x.sims.hyb.fuelL) / 1e6).toFixed(2)} M`, "estimated"],
    ["Served in 6-month blockade", (k) => `${(tests[k].served * 100).toFixed(1)}%`, "estimated"],
    ["Build time", (k, x) => (k === "diesel" ? "—" : `~${Math.round(x.dep.mid)} months (${Math.round(x.dep.low)}–${Math.round(x.dep.high)})`), "estimated"],
    ["Value of having built before this shock", (k, x) => (k === "diesel" ? "—" : money(x.valueOfEarly)), "estimated"],
  ];
  return (
    <section className="mx-auto max-w-[1500px] space-y-3 px-3 pb-10 pt-4" aria-labelledby="ad-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="hud-label text-[11px] text-[#8b98ae]">ANALYST MODE · SAME ENGINE AS THE GAME</div>
          <h2 id="ad-title" className="display text-[26px] font-semibold text-white">{loc.name}: the numbers behind the cards</h2>
          <p className="max-w-3xl text-[13px] text-[#a7b2c5]">Every card, indicator and event in Game mode is computed by the functions shown here: an 8,760-hour dispatch model, a monthly cash-flow model and a 400-path Monte Carlo. Values are for a decision taken in {monthDate(month)} on the price path implied by the events so far.</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#8b98ae]">{Object.entries(TIERS).map(([k, t]) => <span key={k} className="flex items-center gap-1.5"><Tag tier={k} />{t.desc.split(".")[0]}</span>)}</div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="panel overflow-x-auto p-3 scroll-thin">
          <div className="hud-label mb-2 text-[12px] text-white">OPTION ECONOMICS · DECIDE IN {monthDate(month).toUpperCase()}</div>
          <table className="w-full min-w-[560px] border-collapse text-[12px]">
            <thead><tr className="border-b border-[#1f2c46]"><th className="py-1.5 text-left font-normal text-[#8b98ae]">Metric</th>{["diesel", "hybrid", "solar"].map((k) => <th key={k} className="px-2 py-1.5 text-left font-medium" style={{ color: OPTIONS[k].glow }}>{OPTIONS[k].title}</th>)}</tr></thead>
            <tbody>
              {rows.map(([label, f, tier]) => (
                <tr key={label} className="border-b border-[#16223a]">
                  <td className="py-1 pr-2 text-[#a7b2c5]"><span className="mr-1.5">{label}</span><Tag tier={tier} /></td>
                  {["diesel", "hybrid", "solar"].map((k) => <td key={k} className="num px-2 py-1 text-white">{f(k, opts[k])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] leading-snug text-[#6d7a91]">Reliability parity: both renewable options keep the full diesel fleet (115% of peak) as firm backup, so all three serve the same hourly demand to the same standard. Differences in reliability arise only from fuel stock-outs during supply shortfalls.</p>
        </div>

        <div className="panel p-3">
          <div className="hud-label mb-1 text-[12px] text-white">ASSUMPTIONS (EDITABLE)</div>
          <p className="mb-1 text-[11px] text-[#6d7a91]">Changes flow straight back into the game.</p>
          <Slider id="a-lr" label="Long-run Brent (real)" value={base.brentLR} min={40} max={140} step={1} onChange={(v) => setBase({ brentLR: v })} fmt={(v) => `$${v}/bbl`} info="Level prices return to after disruptions end. Default $70 ≈ the Feb 2026 pre-war average ($70.89, EIA)." />
          <Slider id="a-crack" label="Diesel refining margin, long-run" value={base.crackLR} min={5} max={60} step={1} onChange={(v) => setBase({ crackLR: v })} fmt={(v) => `$${v}/bbl`} info="Singapore gasoil crack ≈ $20/bbl pre-war (Platts, Dec 2025)." />
          <Slider id="a-log" label="Freight & handling cost" value={base.logisticsMult} min={0.5} max={2.5} step={0.05} onChange={(v) => setBase({ logisticsMult: v })} fmt={(v) => `${v.toFixed(2)}× · $${(loc.logistics * v).toFixed(2)}/L`} />
          <Slider id="a-pv" label="Solar capital cost (today)" value={costs.pvCapex} min={500} max={3000} step={25} onChange={(v) => setCosts({ pvCapex: v })} fmt={(v) => `$${v.toLocaleString()}/kWp`} accent="teal" info="IRENA utility-scale benchmark $691/kW (2024); island default adds logistics and small-scale premiums." />
          <Slider id="a-bt" label="Battery capital cost (today)" value={costs.battCapex} min={100} max={1000} step={10} onChange={(v) => setCosts({ battCapex: v })} fmt={(v) => `$${v}/kWh`} accent="teal" info="BNEF global turnkey BESS $117/kWh (2025); island default includes EPC, grid-forming inverters and shipping." />
          <Slider id="a-wacc" label="Discount rate (real WACC)" value={costs.wacc} min={0.03} max={0.18} step={0.0025} onChange={(v) => setCosts({ wacc: v })} fmt={(v) => `${(v * 100).toFixed(1)}%`} />
          <Slider id="a-btr" label="Battery cost trend" value={base.battTrend} min={0} max={0.1} step={0.005} onChange={(v) => setBase({ battTrend: v })} fmt={(v) => `−${(v * 100).toFixed(1)}%/yr`} info="BNEF expected a ~3% fall in battery pack prices in 2026; extended here as an assumption." />
          <Slider id="a-sub" label="Market substitution at shock onset" value={base.substitution} min={0} max={0.9} step={0.05} onChange={(v) => setBase({ substitution: v })} fmt={(v) => `${Math.round(v * 100)}%`} info="Share of lost Hormuz-linked fuel replaced by other suppliers immediately; the gap then closes with a 6-month time constant." />
          <Slider id="a-vol" label="Fuel price volatility" value={base.volatility} min={0} max={0.8} step={0.01} onChange={(v) => setBase({ volatility: v })} fmt={(v) => `${Math.round(v * 100)}%/yr`} />
          <Slider id="a-rp" label="Repeat-disruption probability" value={base.recurProb} min={0} max={0.4} step={0.01} onChange={(v) => setBase({ recurProb: v })} fmt={(v) => `${Math.round(v * 100)}%/yr`} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="hud-label text-[12px] text-white">DETAILED CHARTS FOR</span>
        <Segmented value={which} onChange={setWhich} options={[{ value: "hybrid", label: "Hybrid system" }, { value: "solar", label: "Solar + battery" }]} />
      </div>
      <TimeSeries r={r} path={r.sp} driver="brent" start={month} />
      <div className="grid gap-3 lg:grid-cols-3">
        <CostStack r={r} useCase="island" />
        <Sensitivity r={r} sc={r.sc} />
        <Histogram r={r} sc={r.sc} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Dispatch r={r} />
        <PriceChain r={r} sc={r.sc} path={r.sp} />
      </div>

      <div className="panel p-4">
        <div className="hud-label mb-2 text-[12px] text-white">HOW THE GAME COMPUTES CONSEQUENCES</div>
        <div className="grid gap-4 text-[12px] leading-relaxed text-[#a7b2c5] md:grid-cols-2 xl:grid-cols-3">
          <p><b className="text-white">Events → prices.</b> Each event edits a monthly path for Brent, the diesel refining margin, LNG, a war-risk freight surcharge and the physical disruption share. Temporary shocks hold, then glide back over a stated normalisation period; structural changes persist. Prices are inputs, never derived from the disruption share.</p>
          <p><b className="text-white">Prices → your bill.</b> Delivered diesel = (Brent + refining margin) ÷ 158.987 L/bbl + freight & handling + surcharge × Hormuz exposure + local margin. Cost of electricity = fuel + diesel O&M + solar/battery O&M + a capital charge (capex × capital recovery factor) once a project is online.</p>
          <p><b className="text-white">Reliability.</b> Monthly fuel-stock model: shortfall = disruption × site exposure × (1 − substitution), where substitution rises from the onset value with a 6-month time constant. A tank of N days of diesel-only burn buffers it; when empty, the unmet share of diesel-supplied energy is unserved. Cyclones suspend deliveries and cut solar output for the stated days.</p>
          <p><b className="text-white">Options.</b> Hybrid = solar at 2.5× average load + 4 h of storage. Solar + battery = 6× + 16 h. Both keep the full diesel fleet as backup (reliability parity). Hourly dispatch on a synthetic weather year gives fuel burn and renewable share.</p>
          <p><b className="text-white">Financial return.</b> NPV of a decision = discounted savings vs keeping diesel over 25 years minus capital (50% at decision, 50% at commissioning) and a year-12 battery replacement. Capital cost is locked at the decision month; equipment costs fall with the trend and with breakthrough events. The mark-to-market NPV is recomputed as new events arrive.</p>
          <p><b className="text-white">Limits.</b> Synthetic weather and load; no grid-stability, carbon-price or subsidy modelling; island parameters and country risk indices are illustrative; market data is a dated snapshot ({SNAPSHOT_RETRIEVED}), not a live feed, because this page's host blocks calls to external data APIs.</p>
        </div>
        <div className="mt-3 border-t border-[#1f2c46] pt-3">
          <div className="hud-label mb-1 text-[11px] text-[#8b98ae]">SOURCES</div>
          <ul className="grid gap-x-6 gap-y-0.5 text-[11.5px] md:grid-cols-2">
            {Object.values(SOURCES).map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="text-[#a7b2c5] underline decoration-[#2b3b5c] underline-offset-2 hover:text-white">{s.label}</a></li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
