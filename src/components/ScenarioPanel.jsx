import React, { useState } from "react";
import { Slider, Segmented, Tag, Info, fmtNum } from "./ui";
import { PRESETS } from "../data/defaults";
import { USE_CASES } from "../data/locations";

const dur = (d) => (d >= 365 ? `${(d / 365).toFixed(d % 365 === 0 ? 0 : 1)} yr` : `${Math.round(d)} d`);

function Group({ title, children, note, open: open0 = true }) {
  const [open, setOpen] = useState(open0);
  return (
    <section className="border-b border-line px-3 py-2">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between" aria-expanded={open}>
        <span className="eyebrow">{title}</span>
        <span className="text-[10px] text-ink3">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-1">
          {note && <p className="mb-1 text-[11px] leading-snug text-ink3">{note}</p>}
          {children}
        </div>
      )}
    </section>
  );
}

export default function ScenarioPanel({ sc, setSc, preset, applyPreset, mode, costs, setCosts, activeLoc, tech, setTech, dieselNow }) {
  const set = (k) => (v) => setSc((s) => ({ ...s, [k]: v }));
  const uc = activeLoc.useCase;
  const c = costs[uc];
  const setC = (k) => (v) => setCosts((all) => ({ ...all, [uc]: { ...all[uc], [k]: v } }));
  const replay = mode === "replay";
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-2">
        <div className="flex items-center justify-between">
          <h2 className="font-cond text-[13px] font-semibold uppercase tracking-[0.08em] text-ink">Scenario</h2>
          <Tag tier="hypothetical" title="All controls here are hypothetical inputs. Preset values anchored to observations are noted." />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.entries(PRESETS).map(([k, p]) => (
            <button key={k} type="button" onClick={() => applyPreset(k)} title={p.blurb}
              className={`rounded-[3px] border px-1.5 py-[2px] text-[11px] ${preset === k ? "border-[#e8a33a80] bg-[#e8a33a14] text-[#f3c27a]" : "border-line2 text-ink3 hover:text-ink2"}`}>
              {p.label}
            </button>
          ))}
        </div>
        {preset && PRESETS[preset] && <p className="mt-1.5 text-[11px] leading-snug text-ink3">{PRESETS[preset].blurb}</p>}
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto">
        <Group title="Hormuz disruption" note="Physical disruption drives fuel-shortage risk and deployment delays. It does not set prices by itself.">
          <Slider id="dis" label="Shipping disruption" value={sc.disruption} min={0} max={1} step={0.01} onChange={set("disruption")} fmt={(v) => `${Math.round(v * 100)}%`} accent="amber"
            info="Share of normal Hormuz oil and LNG flows lost. Feeds the physical shortage model (with each site's exposure) and supply-chain delays. Prices are set separately below." />
          <Slider id="dur" label="Remaining duration" value={sc.durationDays} min={30} max={1825} step={5} logScale onChange={set("durationDays")} fmt={dur} accent="amber" disabled={replay}
            info="How much longer the disruption lasts from today. The window is shaded on the time-series chart." />
          <Slider id="norm" label="Normalisation period" value={sc.normalizeMonths} min={0} max={24} step={1} onChange={set("normalizeMonths")} fmt={(v) => `${v} mo`} disabled={replay}
            info="Months for prices to glide from shock levels back to long-run levels after the disruption ends." />
        </Group>

        <Group title="Price response" note={replay ? "Prices follow the replayed historical episode. Switch to What-if to edit them." : "Set independently of the disruption share. Use the price-response helper in the monitor if you want a transparent estimate."}>
          <Slider id="bs" label="Brent during shock" value={sc.brentShock} min={30} max={200} step={1} onChange={set("brentShock")} fmt={(v) => `$${v}/bbl`} accent="amber" disabled={replay} />
          <Slider id="bl" label="Brent long-run (real)" value={sc.brentLR} min={30} max={200} step={1} onChange={set("brentLR")} fmt={(v) => `$${v}/bbl`}
            info="Flat real price after normalisation. This drives most of a 25-year project's value." />
          <Slider id="cs" label="Diesel crack during shock" value={sc.crackShock} min={5} max={120} step={1} onChange={set("crackShock")} fmt={(v) => `$${v}/bbl`} accent="amber" disabled={replay}
            info="Refining margin of gasoil over crude. Singapore gasoil cracks averaged $63.64/b in March 2026 versus about $20/b before the war." />
          <Slider id="cl" label="Diesel crack long-run" value={sc.crackLR} min={5} max={60} step={1} onChange={set("crackLR")} fmt={(v) => `$${v}/bbl`} />
          <Slider id="gs" label="LNG during shock" value={sc.lngShock} min={4} max={60} step={0.5} onChange={set("lngShock")} fmt={(v) => `$${v.toFixed(1)}/MMBtu`} accent="amber" disabled={replay}
            sub={`${sc.lngShock >= sc.lngLR ? "+" : ""}${Math.round((sc.lngShock / sc.lngLR - 1) * 100)}% vs long-run`} />
          <Slider id="gl" label="LNG long-run (real)" value={sc.lngLR} min={4} max={30} step={0.5} onChange={set("lngLR")} fmt={(v) => `$${v.toFixed(1)}/MMBtu`} />
        </Group>

        <Group title="Local fuel logistics">
          <Slider id="lm" label="Freight & handling cost" value={sc.logisticsMult} min={0.5} max={2.5} step={0.05} onChange={set("logisticsMult")} fmt={(v) => `${v.toFixed(2)}×`}
            sub={`${activeLoc.name}: $${(activeLoc.logistics * sc.logisticsMult).toFixed(2)}/L over hub price · delivered now $${dieselNow.toFixed(2)}/L`}
            info="Scales each site's delivered-fuel logistics premium (shipping from the refinery hub, storage, local handling)." />
          <Slider id="fs" label="War-risk freight surcharge" value={sc.freightSurcharge} min={0} max={0.3} step={0.01} onChange={set("freightSurcharge")} fmt={(v) => `$${v.toFixed(2)}/L`} accent="amber" disabled={replay}
            info="Extra freight and insurance during the disruption, applied in proportion to each site's Hormuz exposure." />
        </Group>

        <Group title={`Costs & finance · ${USE_CASES[uc].short}`} note="Applies to every site of this use case. Benchmarks: IRENA utility PV $691/kW (2024); BNEF turnkey BESS $117/kWh (2025). Defaults add small-scale, logistics and grid-forming premiums.">
          <Slider id="pvc" label="Solar CAPEX" value={c.pvCapex} min={300} max={3000} step={25} onChange={setC("pvCapex")} fmt={(v) => `$${fmtNum(v)}/kWp`} accent="teal" />
          <Slider id="bc" label="Battery CAPEX" value={c.battCapex} min={80} max={1000} step={10} onChange={setC("battCapex")} fmt={(v) => `$${fmtNum(v)}/kWh`} accent="teal" />
          {uc === "lng" && <Slider id="wc" label="Wind CAPEX" value={c.windCapex} min={800} max={5000} step={50} onChange={setC("windCapex")} fmt={(v) => `$${fmtNum(v)}/kW`} accent="teal" />}
          <Slider id="wacc" label="Discount rate (real WACC)" value={c.wacc} min={0.03} max={0.18} step={0.0025} onChange={setC("wacc")} fmt={(v) => `${(v * 100).toFixed(1)}%`}
            info="Real weighted average cost of capital. Higher rates penalise capital-heavy solar and storage relative to pay-as-you-go fuel." />
          <div className="flex items-center justify-between py-1 text-[12px] text-ink2">
            <span className="flex items-center">Fossil fleet in LCOE<Info text="Existing: the diesel/gas fleet is sunk and only its running costs count. New-build: its capital cost is added to both systems (the hybrid keeps the same firm fleet), so incremental NPV is unchanged." /></span>
            <Segmented value={c.newBuildFossil ? "new" : "existing"} onChange={(v) => setC("newBuildFossil")(v === "new")} options={[{ value: "existing", label: "Existing" }, { value: "new", label: "New-build" }]} />
          </div>
        </Group>

        <Group title="Risk">
          <Slider id="vol" label="Fuel price volatility" value={sc.volatility} min={0} max={0.8} step={0.01} onChange={set("volatility")} fmt={(v) => `${Math.round(v * 100)}%/yr`}
            info="Annualised volatility of a mean-reverting (2-year half-life) log-price process in the Monte Carlo. Mean-preserving: it widens outcomes without raising the average." />
          <Slider id="rp" label="Repeat disruption probability" value={sc.recurProb} min={0} max={0.4} step={0.01} onChange={set("recurProb")} fmt={(v) => `${Math.round(v * 100)}%/yr`} accent="amber"
            info="Chance per year that a disruption like the one defined above starts again after this one ends. Used in the Monte Carlo and the expected resilience value." />
          <Slider id="sub" label="Market substitution" value={sc.substitution} min={0} max={0.9} step={0.05} onChange={set("substitution")} fmt={(v) => `${Math.round(v * 100)}%`}
            info="Share of a site's lost Hormuz-linked fuel that suppliers replace by rerouting or from stocks. The remainder is a physical shortfall." />
          <Slider id="voll" label="Value of lost load" value={sc.voll} min={500} max={20000} step={100} logScale onChange={set("voll")} fmt={(v) => `$${fmtNum(v)}/MWh`}
            info="Economic cost of one MWh of unserved electricity. Used only for the resilience value, which is reported separately from NPV." />
        </Group>

        <Group title="Technical (advanced)" open={false}>
          <Slider id="rte" label="Battery round-trip efficiency" value={tech.rte} min={0.75} max={0.95} step={0.01} onChange={(v) => setTech((t) => ({ ...t, rte: v }))} fmt={(v) => `${Math.round(v * 100)}%`} tier="hypothetical" />
          <Slider id="ml" label="Diesel minimum load" value={tech.minLoad} min={0.1} max={0.5} step={0.05} onChange={(v) => setTech((t) => ({ ...t, minLoad: v }))} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider id="slope" label="Diesel fuel-curve slope" value={tech.slopeL} min={200} max={300} step={5} onChange={(v) => setTech((t) => ({ ...t, slopeL: v }))} fmt={(v) => `${v} L/MWh`}
            info="Marginal fuel use per MWh. With the 30 L/MW·h no-load term, full-load consumption is about 0.265 L/kWh." />
          <div className="flex items-center justify-between py-1 text-[12px] text-ink2">
            <span className="flex items-center">Diesel-off operation<Info text="A grid-forming battery lets all diesel units switch off when solar and storage cover load. Off forces one unit to run at minimum load at all times (spinning reserve)." /></span>
            <Segmented value={tech.dieselOff ? "on" : "off"} onChange={(v) => setTech((t) => ({ ...t, dieselOff: v === "on" }))} options={[{ value: "on", label: "Allowed" }, { value: "off", label: "Not allowed" }]} />
          </div>
        </Group>
      </div>
    </div>
  );
}
