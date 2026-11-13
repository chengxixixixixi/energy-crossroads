import React from "react";
import { USE_CASES } from "../data/locations";
import { Tag, Btn, SectionTitle, fmtMoney, fmtNum, fmtPct } from "./ui";
import { breakEvenText, verdict } from "./Dashboard";

export default function Compare({ results, sc, onRemove, onOpen, activeId }) {
  const rows = [
    ["System", (r) => USE_CASES[r.loc.useCase].short, "illustrative"],
    ["Hormuz exposure", (r) => fmtPct(r.loc.useCase === "lng" ? r.loc.hzLng : r.loc.hzOil), "illustrative"],
    ["Solar yield, kWh/kWp", (r) => fmtNum(r.loc.pvout), "illustrative", (r) => r.loc.pvout],
    ["Baseline cost, $/MWh", (r) => fmtNum(r.lcoeFlat.baseTotal), "estimated"],
    ["Cost now (shock), $/MWh", (r) => fmtNum(r.core.baseCost[0] / (r.sims.base.loadMWh / 12)), "estimated"],
    ["Hybrid LCOE, $/MWh", (r) => fmtNum(r.lcoe.hybTotal), "estimated"],
    ["Saving vs fossil-only", (r) => fmtPct(1 - r.lcoe.hybTotal / r.lcoe.baseTotal), "estimated", (r) => 1 - r.lcoe.hybTotal / r.lcoe.baseTotal],
    ["Incremental NPV", (r) => fmtMoney(r.core.npv), "estimated"],
    ["NPV per $ invested", (r) => (r.core.capex > 0 ? (r.core.npv / r.core.capex).toFixed(2) : "—"), "estimated", (r) => (r.core.capex > 0 ? r.core.npv / r.core.capex : -Infinity)],
    ["P(NPV > 0)", (r) => (r.mc ? fmtPct(r.mc.probPositive) : "—"), "estimated", (r) => r.mc?.probPositive ?? 0],
    ["Payback", (r) => (r.core.payback ? `${r.core.payback.toFixed(1)} y` : "> life"), "estimated"],
    ["Break-even", (r) => breakEvenText(r, sc).main, "estimated"],
    ["Renewable share", (r) => fmtPct(r.sims.hyb.reFraction), "estimated", (r) => r.sims.hyb.reFraction],
    ["Cost-risk reduction (hedge)", (r) => (r.mc ? fmtPct(r.mc.hedge) : "—"), "estimated", (r) => r.mc?.hedge ?? 0],
    ["Value of being early", (r) => fmtMoney(r.valueOfEarly), "estimated"],
    ["Deploy time", (r) => `~${Math.round(r.dep.mid)} mo`, "estimated"],
  ];
  return (
    <section className="panel p-3" aria-labelledby="cmp-title">
      <SectionTitle id="cmp-title" right={<span className="text-[11px] text-ink3">Shift-click map sites or use “+ Compare” · up to 3</span>}>Side-by-side comparison</SectionTitle>
      {results.length === 0 ? (
        <p className="text-ink3">No sites pinned yet.</p>
      ) : (
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[560px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-line">
                <th className="py-1.5 pr-3 text-left font-normal text-ink3">Metric</th>
                {results.map((r, i) => {
                  const v = verdict(r);
                  return (
                    <th key={r.loc.id} className="px-2 py-1.5 text-left align-top font-normal">
                      <div className="flex items-center gap-1.5">
                        <span className="num inline-flex h-4 w-4 items-center justify-center rounded-[2px] bg-ink text-[10px] font-bold text-bg">{"ABC"[i]}</span>
                        <button type="button" onClick={() => onOpen(r.loc.id)} className={`font-cond text-[13px] font-semibold hover:underline ${r.loc.id === activeId ? "text-ink" : "text-ink2"}`}>{r.loc.name}</button>
                        <button type="button" onClick={() => onRemove(r.loc.id)} aria-label={`Remove ${r.loc.name}`} className="ml-auto text-ink3 hover:text-ink">×</button>
                      </div>
                      <div className="text-[11px] text-ink3">{r.loc.region}</div>
                      <span className="mt-0.5 inline-block rounded-[3px] px-1 text-[10.5px]" style={{ color: v.tone, border: `1px solid ${v.tone}55` }}>{v.label}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, f, tier, score]) => {
                let best = -1;
                if (score && results.length > 1) {
                  const s = results.map(score);
                  best = s.indexOf(Math.max(...s));
                }
                return (
                  <tr key={label} className="border-b border-[#1e2a4099]">
                    <td className="py-1 pr-3 text-ink3"><span className="mr-1.5">{label}</span><Tag tier={tier} /></td>
                    {results.map((r, i) => (
                      <td key={r.loc.id} className={`num px-2 py-1 ${i === best ? "text-[#7fd8cc]" : "text-ink"}`}>{f(r)}{i === best ? " ▲" : ""}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1.5 text-[10.5px] text-ink3">▲ marks the strongest value in rows where a higher number is better. Different system scales make absolute NPVs incomparable; use NPV per $ invested and P(NPV&gt;0) to rank.</p>
        </div>
      )}
    </section>
  );
}
