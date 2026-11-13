import React, { useEffect, useMemo, useState } from "react";
import { MARKET, SHIPPING, SOURCES, OUTLOOK, SNAPSHOT_RETRIEVED, CRISIS_START } from "../data/snapshot";
import { LIVE_FEEDS } from "../data/adapters";
import { EPISODES } from "../data/defaults";
import { BRENT_MONTHLY, BRENT_MONTHLY_DATES } from "../data/history";
import { HistoryChart } from "./charts";
import { Tag, Segmented, Btn, Info, Slider, fmtNum } from "./ui";

const daysSince = (iso, to = SNAPSHOT_RETRIEVED) => Math.round((Date.parse(to) - Date.parse(iso)) / 86400000) + 1;
const Src = ({ k }) => (
  <a href={SOURCES[k].url} target="_blank" rel="noreferrer" className="text-ink3 underline decoration-line2 underline-offset-2 hover:text-ink2">{SOURCES[k].label}</a>
);

function Tile({ item, prewar, digits = 2 }) {
  const delta = prewar ? item.value / prewar.value - 1 : null;
  return (
    <div className="rounded-[3px] border border-line bg-[#0a111e66] px-2.5 py-2">
      <div className="flex items-start justify-between gap-1">
        <span className="text-[11px] leading-tight text-ink3">{item.label}</span>
        <Tag tier={item.tier} />
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="num text-[18px] font-medium text-ink">{item.approx ? "≈" : ""}{fmtNum(item.value, item.value < 100 && digits ? (Number.isInteger(item.value) ? 0 : digits) : 0)}</span>
        <span className="text-[10.5px] text-ink3">{item.unit}</span>
        {delta != null && <span className="num ml-auto text-[11px]" style={{ color: delta > 0 ? "#f3c27a" : "#7fd8cc" }}>{delta > 0 ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))}% vs pre-war</span>}
      </div>
      <div className="mt-0.5 text-[10.5px] leading-snug text-ink3">
        {item.asOf} · <Src k={item.src} />{item.note ? ` · ${item.note}` : ""}
      </div>
    </div>
  );
}

export default function Monitor({ mode, setMode, applyPreset, sc, setSc, episode, setEpisode, replayRatio, setReplayRatio, replayIdx, setReplayIdx, active }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-2">
        <div className="flex items-center justify-between">
          <h2 className="font-cond text-[13px] font-semibold uppercase tracking-[0.08em] text-ink">Hormuz risk monitor</h2>
          <span title="Days since the war began on 28 Feb 2026" className="num whitespace-nowrap rounded-[3px] border border-[#e8a33a55] px-1.5 py-[1px] text-[10.5px] text-[#f3c27a]">Day {daysSince(CRISIS_START)}</span>
        </div>
        <div className="mt-2">
          <Segmented value={mode} onChange={setMode} label="Monitor mode" options={[{ value: "live", label: "Live market" }, { value: "replay", label: "Historical replay" }, { value: "whatif", label: "What-if" }]} />
        </div>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-3 py-2">
        {mode === "live" && <Live applyPreset={applyPreset} />}
        {mode === "replay" && <Replay episode={episode} setEpisode={setEpisode} ratio={replayRatio} setRatio={setReplayRatio} idx={replayIdx} setIdx={setReplayIdx} active={active} />}
        {mode === "whatif" && <WhatIf sc={sc} setSc={setSc} applyPreset={applyPreset} />}
      </div>
    </div>
  );
}

function Live({ applyPreset }) {
  return (
    <div className="space-y-2">
      <div className="rounded-[3px] border border-line2 px-2.5 py-2 text-[11px] leading-snug text-ink2">
        <div className="mb-1 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#6f7c93]" /><span className="font-medium text-ink">Live feeds not connected</span><Tag tier="observed" /></div>
        This page's host blocks calls to outside data APIs, so no value below is live. They are dated observations retrieved on {SNAPSHOT_RETRIEVED}. Feed adapters ({LIVE_FEEDS.map((f) => f.name.split(" · ")[0]).join(", ")}) are stubbed for a hosted build.
      </div>
      <div className="eyebrow pt-1">Prices</div>
      <Tile item={MARKET.brentFutures} prewar={MARKET.brentPrewar} />
      <Tile item={MARKET.brentSpot} prewar={MARKET.brentPrewar} />
      <Tile item={MARKET.jkm} prewar={MARKET.jkmPrewar} />
      <Tile item={MARKET.gasoilCrack} prewar={MARKET.gasoilCrackPrewar} />
      <div className="eyebrow pt-1">Shipping & flows</div>
      <div className="grid grid-cols-2 gap-2">
        <Tile item={SHIPPING.octTransits} />
        <Tile item={SHIPPING.weekly} />
        <Tile item={SHIPPING.octLng} />
        <Tile item={SHIPPING.nov1} />
      </div>
      <Tile item={SHIPPING.crudeFlows} />
      <Tile item={SHIPPING.productFlows} />
      <div className="grid grid-cols-2 gap-2">
        <Tile item={SHIPPING.prewarFlow} />
        <Tile item={SHIPPING.bypass} />
      </div>
      <div className="rounded-[3px] border border-line px-2.5 py-2 text-[11px] leading-snug text-ink2">
        <div className="eyebrow mb-0.5">Outlook</div>
        {OUTLOOK.text} <Src k={OUTLOOK.src} />
      </div>
      <Btn variant="primary" onClick={() => applyPreset("snapshot")}>Load snapshot into scenario</Btn>
      <p className="text-[10.5px] leading-snug text-ink3">The futures settlement sits well below physical spot: the market prices normalisation. The snapshot scenario uses futures for the shock level and pre-war levels for the long run.</p>
    </div>
  );
}

function Replay({ episode, setEpisode, ratio, setRatio, idx, setIdx, active }) {
  const ep = EPISODES.find((e) => e.id === episode);
  const a = BRENT_MONTHLY_DATES.indexOf(ep.start), b = BRENT_MONTHLY_DATES.indexOf(ep.end);
  const len = b - a + 1;
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setIdx((i) => (i + 1 >= len ? (setPlaying(false), len - 1) : i + 1)), 650);
    return () => clearInterval(t);
  }, [playing, len, setIdx]);
  const i = Math.min(idx, len - 1);
  const r = active;
  const E = r.sims.base.loadMWh / 12;
  const base = r.core.baseCost[i] / E, hyb = r.core.hybCost[i] / E;
  const cumSave = useMemo(() => { let s = 0; for (let m = 0; m <= i; m++) s += r.core.baseCost[m] - r.core.hybCost[m]; return s; }, [r, i]);
  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-snug text-ink3">Replays a real Brent path through the selected site's economics, starting today. Monthly EIA spot averages <Tag tier="observed" />. Crude only: historical product cracks and freight are not replayed.</p>
      <div className="flex flex-wrap gap-1">
        {EPISODES.map((e) => (
          <button key={e.id} type="button" onClick={() => { setEpisode(e.id); setIdx(0); }}
            className={`rounded-[3px] border px-1.5 py-[2px] text-[11px] ${e.id === episode ? "border-[#e8a33a80] bg-[#e8a33a14] text-[#f3c27a]" : "border-line2 text-ink3 hover:text-ink2"}`}>{e.label}</button>
        ))}
      </div>
      <HistoryChart series={BRENT_MONTHLY} dates={BRENT_MONTHLY_DATES} episodes={EPISODES} activeEp={episode} playIdx={a + i} onPick={(id) => { setEpisode(id); setIdx(0); }} />
      <p className="text-[11px] leading-snug text-ink2">{ep.note}</p>
      <div className="flex items-center gap-2">
        <Btn onClick={() => { if (i >= len - 1) setIdx(0); setPlaying(!playing); }}>{playing ? "Pause" : "Play"}</Btn>
        <input aria-label="Replay month" type="range" min={0} max={len - 1} step={1} value={i} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} />
        <span className="num w-16 shrink-0 text-right text-[11px] text-ink2">{BRENT_MONTHLY_DATES[a + i]}</span>
      </div>
      <div className="flex items-center justify-between text-[11.5px] text-ink2">
        <span className="flex items-center">Apply as<Info text="Ratio: each month's % change from the pre-episode month is applied to today's long-run Brent. Nominal: the historical $ levels are used as-is (not inflation-adjusted)." /></span>
        <Segmented value={ratio ? "ratio" : "nominal"} onChange={(v) => setRatio(v === "ratio")} options={[{ value: "ratio", label: "% moves" }, { value: "nominal", label: "Nominal $" }]} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label={`Historical Brent, ${BRENT_MONTHLY_DATES[a + i]}`} value={`$${fmtNum(BRENT_MONTHLY[a + i], 2)}`} tier="observed" />
        <Stat label="Applied to model" value={`$${fmtNum(r.pathBrent[i], 1)}`} tier="estimated" />
        <Stat label={`${r.loc.name}: fossil-only`} value={`$${fmtNum(base)}/MWh`} tier="estimated" />
        <Stat label="With solar + storage" value={`$${fmtNum(hyb)}/MWh`} tier="estimated" />
      </div>
      <p className="text-[11px] leading-snug text-ink3">Cumulative savings through this month: <span className="num text-ink">{cumSave >= 0 ? "" : "−"}${fmtNum(Math.abs(cumSave) / 1e6, 1)}M</span>{r.core.lead > i ? " (hybrid not yet online under reactive timing; switch to pre-emptive to see a system built before the episode)." : "."}</p>
    </div>
  );
}

const Stat = ({ label, value, tier }) => (
  <div className="rounded-[3px] border border-line px-2 py-1.5">
    <div className="flex items-start justify-between gap-1"><span className="text-[10.5px] leading-tight text-ink3">{label}</span><Tag tier={tier} /></div>
    <div className="num text-[14px] text-ink">{value}</div>
  </div>
);

function WhatIf({ sc, setSc, applyPreset }) {
  const [bypass, setBypass] = useState(SHIPPING.bypass.value);
  const [stocks, setStocks] = useState(2);
  const [elast, setElast] = useState(0.12);
  const flow = SHIPPING.prewarFlow.value;
  const world = 100; // EIA: 20 mb/d ≈ 20% of global liquids consumption
  const lost = Math.max(0, sc.disruption * flow - bypass - stocks);
  const share = lost / world;
  const implied = sc.brentLR * Math.exp(share / elast);
  const capped = Math.min(200, implied);
  return (
    <div className="space-y-2">
      <div className="rounded-[3px] border border-line px-2.5 py-2">
        <div className="mb-1 flex items-center justify-between"><span className="font-cond text-[12.5px] font-semibold text-ink">Price-response helper</span><Tag tier="hypothetical" /></div>
        <p className="text-[11px] leading-snug text-ink3">A transparent, uncalibrated estimate. Net supply loss = disruption × 20 mb/d − unused bypass − stock releases. Brent rises by exp(loss share ÷ combined short-run elasticity). It ignores inventories, expectations and demand destruction, so treat it as a sense-check, not a forecast.</p>
        <Slider id="h-by" label="Bypass pipelines used" value={bypass} min={0} max={5.5} step={0.1} onChange={setBypass} fmt={(v) => `${v.toFixed(1)} mb/d`} sub="EIA: ~2.6 mb/d unused; IEA: 3.5–5.5 mb/d redirectable" />
        <Slider id="h-st" label="Strategic stock release" value={stocks} min={0} max={6} step={0.1} onChange={setStocks} fmt={(v) => `${v.toFixed(1)} mb/d`} />
        <Slider id="h-el" label="Combined short-run elasticity" value={elast} min={0.04} max={0.3} step={0.01} onChange={setElast} fmt={(v) => v.toFixed(2)} info="Sum of absolute short-run demand and supply elasticities. Small values (≈0.05–0.15) imply large price moves for small supply losses." />
        <div className="num mt-1 grid grid-cols-2 gap-x-3 text-[11.5px]">
          <span className="text-ink3">Net loss</span><span className="text-right text-ink">{lost.toFixed(1)} mb/d ({(share * 100).toFixed(1)}%)</span>
          <span className="text-ink3">Implied Brent</span><span className="text-right text-ink">${fmtNum(capped)}{implied > 200 ? "+ (off scale)" : ""}/bbl</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Btn variant="primary" onClick={() => setSc((s) => ({ ...s, brentShock: Math.round(capped) }))}>Apply to “Brent during shock”</Btn>
        </div>
        <p className="mt-1.5 text-[10.5px] leading-snug text-ink3">Reality check: EIA monthly Brent went from $70.89 (Feb 2026) to $117.29 (Apr) and $123.93 (Oct) <Tag tier="observed" />, while Gulf crude flows were largely restored via bypass routes and product flows stayed ~50% below normal.</p>
      </div>
      <div className="eyebrow pt-1">Scenario presets</div>
      <div className="grid gap-1">
        {["snapshot", "harass", "closure", "protracted", "prewar"].map((k) => (
          <Btn key={k} onClick={() => applyPreset(k)} className="justify-start">{k === "snapshot" ? "Nov 2026 snapshot" : k === "harass" ? "Harassment, 60 days" : k === "closure" ? "Full closure, 6 months" : k === "protracted" ? "Protracted conflict, 3 years" : "No shock (pre-war)"}</Btn>
        ))}
      </div>
    </div>
  );
}
