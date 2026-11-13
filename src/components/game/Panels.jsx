import React, { useState } from "react";
import { OPTIONS, monthDate, GAME_MONTHS } from "../../game/engine";
import { Tag, Info } from "../ui";
import { Tw, useTween } from "./anim";
import { breakEvenText } from "../Dashboard";

export const money = (v, d) => {
  if (!isFinite(v)) return "—";
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(d ?? 1)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(d ?? (a >= 1e8 ? 0 : 1))}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
};
const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;

const Icon = ({ k, c = "currentColor", s = 13 }) => {
  const p = {
    bolt: <path d="M7 1 L2 8 H6 L5 13 L11 5 H7 Z" fill={c} />,
    drop: <path d="M6.5 1 C6.5 1 2 6.5 2 9 A4.5 4.5 0 0 0 11 9 C11 6.5 6.5 1 6.5 1 Z" fill={c} />,
    tank: <g fill="none" stroke={c} strokeWidth="1.4"><rect x="2" y="3" width="9" height="9" rx="1.5" /><path d="M2 7 H11" /></g>,
    warn: <g><path d="M6.5 1 L12 12 H1 Z" fill="none" stroke={c} strokeWidth="1.3" /><path d="M6.5 5 V8.5" stroke={c} strokeWidth="1.4" /><circle cx="6.5" cy="10.2" r="0.8" fill={c} /></g>,
    sun: <g stroke={c} strokeWidth="1.3"><circle cx="6.5" cy="6.5" r="2.5" fill={c} />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <line key={a} x1="6.5" y1="0.8" x2="6.5" y2="2.3" transform={`rotate(${a} 6.5 6.5)`} />)}</g>,
    coin: <g fill="none" stroke={c} strokeWidth="1.4"><circle cx="6.5" cy="6.5" r="5" /><path d="M6.5 3.5 V9.5 M4.8 5 H7.6 A1 1 0 0 1 7.6 7 H5.4 A1 1 0 0 0 5.4 9 H8.2" /></g>,
    shield: <path d="M6.5 1 L11.5 3 V7 C11.5 10 6.5 12.5 6.5 12.5 C6.5 12.5 1.5 10 1.5 7 V3 Z" fill="none" stroke={c} strokeWidth="1.4" />,
    flag: <g fill="none" stroke={c} strokeWidth="1.4"><path d="M2.5 12.5 V1.5" /><path d="M2.5 2 H10.5 L8.8 4.5 L10.5 7 H2.5" /></g>,
    chart: <g fill="none" stroke={c} strokeWidth="1.4"><path d="M1.5 11.5 H11.5" /><path d="M2.5 9 L5 6 L7.5 7.5 L11 3" /></g>,
  }[k];
  return <svg width={s} height={s} viewBox="0 0 13 13" aria-hidden="true">{p}</svg>;
};

function Spark({ data, color, w = 110, h = 26, cf, cfColor = "#c9821f" }) {
  if (!data || data.length < 2) return <svg width={w} height={h} />;
  const all = cf ? [...data, ...cf] : data;
  const lo = Math.min(...all), hi = Math.max(...all);
  const y = (v) => (hi === lo ? h / 2 : h - 2 - ((v - lo) / (hi - lo)) * (h - 4));
  const x = (i) => (i / (data.length - 1)) * (w - 4) + 2;
  const line = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg width={w} height={h} aria-hidden="true">
      {cf && <path d={line(cf)} fill="none" stroke={cfColor} strokeOpacity={0.55} strokeWidth={1.2} />}
      <path d={line(data)} fill="none" stroke={color} strokeWidth={1.8} />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r={2.6} fill={color} />
    </svg>
  );
}

// ---------------------------------------------------------------------------------
export function SitePanel({ loc, state, decision, month, mode, row, sims, others, onSelect, onReopen, canUndo, onUndo }) {
  const built = decision && decision.option !== "diesel";
  const progress = state?.progress ?? 0;
  const pTween = useTween(progress, 600);
  const online = row?.built;
  const sys = online ? sims.opt : sims.base;
  const batt = online ? Math.min(sys.battThroughputMWh / sys.loadMWh, sys.reFraction) : 0;
  const solar = online ? sys.reFraction - batt : 0;
  const diesel = 1 - solar - batt;
  const tankMax = Math.max(loc.storageDays, row?.stockDays || 0);
  return (
    <div className="glass flex h-full flex-col overflow-hidden">
      <div className="border-b border-[#1f2c46] px-4 pb-3 pt-3">
        <div className="hud-label text-[10.5px] text-[#6d7a91]">YOUR ISLAND · {loc.region.toUpperCase()}</div>
        <h2 className="display text-[24px] font-semibold leading-tight text-white">{loc.name}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-[#cfd8e6]">
          <Fact icon="bolt" c="#cfd8e6">{loc.avgMW < 10 ? loc.avgMW.toFixed(1) : Math.round(loc.avgMW)} MW demand</Fact>
          <Fact icon="tank" c="#cfd8e6">{loc.storageDays}-day fuel tank</Fact>
          <Fact icon="warn" c="#ff9b7a">{Math.round((loc.hzOil ?? 0) * 100)}% Hormuz-linked fuel</Fact>
          <Fact icon="sun" c="#2ee6c9">{loc.pvout.toLocaleString()} kWh/kWp sun</Fact>
        </div>
        {mode === "analyst" && <div className="mt-1.5 flex gap-1.5"><Tag tier={loc.pvoutTier || "illustrative"} title="Site parameters are representative values" /><span className="text-[10.5px] text-[#6d7a91]">{loc.note}</span></div>}
      </div>

      <div className="scroll-thin flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {built ? <ChosenCard decision={decision} month={month} pTween={pTween} canUndo={canUndo} onUndo={onUndo} mode={mode} /> : (
          <div className="rounded-xl border border-[#22314f] bg-[#0b1426] p-3">
            <div className="hud-label text-[10.5px] text-[#6d7a91]">YOUR STRATEGY</div>
            <div className="display mt-0.5 text-[16px] font-semibold text-white">{decision ? "Kept diesel" : "Not decided yet"}</div>
            <p className="mt-1 text-[11.5px] leading-snug text-[#a7b2c5]">{decision ? `Chosen in ${monthDate(decision.month)}. Equipment gets cheaper each year, but you keep paying for fuel while you wait.` : "Choose one of the three moves at the bottom of the map."}</p>
            {decision && <button type="button" onClick={onReopen} className="mt-2 rounded-lg border border-[#2ee6c980] px-3 py-1 text-[12px] font-medium text-[#9ff3e4] hover:bg-[#2ee6c91a]">Reconsider: build now</button>}
            {decision && canUndo && <button type="button" onClick={onUndo} className="ml-3 text-[11.5px] text-[#8b98ae] underline hover:text-white">Undo</button>}
          </div>
        )}

        <div className="rounded-xl border border-[#22314f] bg-[#0b1426] p-3">
          <div className="flex items-baseline justify-between"><span className="hud-label text-[10.5px] text-[#6d7a91]">HOW THE ISLAND IS POWERED</span><span className="text-[10.5px] text-[#6d7a91]">share of a year</span></div>
          <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-[#14223d]">
            <div className="h-full transition-all duration-700" style={{ width: `${solar * 100}%`, background: "#1fa89b" }} />
            <div className="h-full transition-all duration-700" style={{ width: `${batt * 100}%`, background: "#5b88f0" }} />
            <div className="h-full transition-all duration-700" style={{ width: `${diesel * 100}%`, background: "#c9821f" }} />
          </div>
          <div className="num mt-1.5 flex justify-between text-[11px] text-[#cfd8e6]">
            <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-[#1fa89b]" />Solar {Math.round(solar * 100)}%</span>
            <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-[#5b88f0]" />Battery {Math.round(batt * 100)}%</span>
            <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-[#c9821f]" />Diesel {Math.round(diesel * 100)}%</span>
          </div>
        </div>

        {row && (
          <div className="rounded-xl border border-[#22314f] bg-[#0b1426] p-3">
            <div className="hud-label text-[10.5px] text-[#6d7a91]">THIS MONTH · {monthDate(month).toUpperCase()}</div>
            <div className="mt-2 flex items-center justify-between text-[11.5px] text-[#a7b2c5]"><span>Fuel in the tank</span><span className="num text-white">{Math.round(Math.min(row.stockDays, 999))} days at current burn</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#14223d]"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (row.stockDays / tankMax) * 100)}%`, background: row.stockDays < 7 ? "#ff7a5c" : row.stockDays < loc.storageDays * 0.6 ? "#f0a83c" : "#2ee6c9" }} /></div>
            <div className="num mt-2 grid grid-cols-2 gap-2 text-[11.5px]">
              <div><div className="text-[10.5px] text-[#6d7a91]">Delivered diesel</div><div className="text-white">${row.p.toFixed(2)}/L</div></div>
              <div><div className="text-[10.5px] text-[#6d7a91]">Fuel deliveries</div><div style={{ color: row.seff > 0.005 ? "#ffb4a2" : "#9ff3e4" }}>{row.seff > 0.005 ? `${Math.round(row.seff * 100)}% short` : "normal"}</div></div>
              <div><div className="text-[10.5px] text-[#6d7a91]">Fuel bill this month</div><div className="text-white">{money(row.fuelL * row.p)}</div></div>
              <div><div className="text-[10.5px] text-[#6d7a91]">Diesel burned</div><div className="text-white">{(row.fuelL / 1e3).toFixed(0)},000 L</div></div>
            </div>
          </div>
        )}

        <div>
          <div className="hud-label mb-1.5 px-1 text-[10.5px] text-[#6d7a91]">OTHER ISLANDS · CLICK TO TAKE CHARGE</div>
          <div className="flex flex-wrap gap-1.5">
            {others.map((o) => (
              <button key={o.id} type="button" onClick={() => onSelect(o.id)} className="flex items-center gap-1.5 rounded-full border border-[#22314f] px-2.5 py-[3px] text-[11.5px] text-[#cfd8e6] hover:border-[#3a4d74] hover:text-white">
                <i className="inline-block h-2 w-2 rounded-full" style={{ background: o.status === "solar" ? OPTIONS.solar.glow : o.status === "hybrid" ? OPTIONS.hybrid.glow : o.status === "building" ? "#2ee6c9" : "#f0a83c" }} />{o.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const Fact = ({ icon, c, children }) => (
  <span className="inline-flex items-center gap-1 rounded-full border border-[#22314f] bg-[#0b1528] px-2 py-[2px]"><Icon k={icon} c={c} s={11} />{children}</span>
);

// The "hand" of decision cards, docked at the bottom of the map.
export function DecisionHand({ loc, decision, month, opts, tests, afterBill, mode, onDecide, onClose }) {
  return (
    <div className="rise">
      <div className="mb-1.5 flex items-end justify-between gap-2 px-1">
        <div>
          <div className="hud-label text-[14px] text-white" style={{ textShadow: "0 2px 12px #000" }}>{decision ? "RECONSIDER" : "YOUR MOVE"} · {loc.name.toUpperCase()}</div>
          <div className="text-[11.5px] text-[#cfd8e6]" style={{ textShadow: "0 1px 8px #000" }}>{decision ? "Build now at today's equipment prices, or keep waiting." : "Pick one, then advance time and watch it play out. All three meet the same demand at the same reliability standard."}</div>
        </div>
        {onClose && <button type="button" onClick={onClose} className="rounded-full border border-[#2b3b5c] bg-[#0a1426d9] px-3 py-1 text-[11.5px] text-[#cfd8e6] hover:text-white">Keep diesel for now</button>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["diesel", "hybrid", "solar"].map((k) => (
          <MoveCard key={k} k={k} r={opts[k]} test={tests[k]} dieselTest={tests.diesel} after={afterBill[k]} month={month} mode={mode}
            current={decision?.option === k} onPick={() => onDecide(k)} highlight={!decision} />
        ))}
      </div>
    </div>
  );
}

function firstYearSavings(r) {
  const c = r.core;
  let s = 0;
  for (let m = c.lead; m < Math.min(c.H, c.lead + 12); m++) s += c.baseCost[m] - c.hybCost[m];
  return s;
}

function MoveCard({ k, r, test, dieselTest, after, month, mode, current, onPick, highlight }) {
  const O = OPTIONS[k];
  const isD = k === "diesel";
  const re = isD ? 0 : r.sims.hyb.reFraction;
  const save = isD ? 0 : firstYearSavings(r);
  const be = isD ? null : breakEvenText(r, r.sc);
  return (
    <div className={`card-move glass relative flex min-w-0 flex-col p-3 ${current ? "border-[#4a5d85]" : "hover:border-[#3a4d74]"} ${highlight && k === "hybrid" ? "nudge" : ""}`}
      style={{ boxShadow: `inset 0 3px 0 ${O.glow}, 0 10px 30px rgba(0,0,0,0.5)` }}>
      <div className="flex items-start justify-between gap-1">
        <div className="display text-[15px] font-semibold leading-tight text-white">{O.title}</div>
        <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: O.glow, boxShadow: `0 0 10px ${O.glow}` }} />
      </div>
      <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-[#a7b2c5]" title={O.tagline}>{O.tagline}</div>
      <dl className="num mt-2 space-y-[3px] text-[11.5px]">
        <Row k="Capital" v={isD ? "$0" : money(r.core.capex)} />
        <Row k={isD ? "Power cost, next year" : "Saves per year"} v={isD ? `$${Math.round(after.perMWh)}/MWh` : `${money(save)}`} tone={isD ? "#ffd59a" : "#9ff3e4"} />
        <Row k="Payback" v={isD ? "—" : r.core.payback ? `${r.core.payback.toFixed(1)} yrs` : "> 25 yrs"} />
        <Row k="Imported fuel" v={isD ? "100%" : `−${Math.round(re * 100)}%`} tone={isD ? "#ffd59a" : "#9ff3e4"} />
        <Row k="Blockade test" v={`${Math.round(test.served * 100)}% served`} tone={test.served < 0.999 ? "#ffb4a2" : "#9ff3e4"} />
        <Row k="Ready" v={isD ? "now" : monthDate(month + after.lead)} />
      </dl>
      {mode === "analyst" && !isD && (
        <div className="num mt-1.5 space-y-[2px] border-t border-[#1f2c46] pt-1.5 text-[10.5px] text-[#8b98ae]">
          <Row k="NPV · P(>0)" v={`${money(r.core.npv)} · ${r.mc ? pct(r.mc.probPositive) : "—"}`} />
          <Row k="LCOE vs diesel" v={`$${Math.round(r.lcoe.hybTotal)} vs $${Math.round(r.lcoe.baseTotal)}`} />
          <Row k="Break-even Brent" v={be.main} />
        </div>
      )}
      <button type="button" onClick={onPick} disabled={current}
        className={`mt-auto w-full rounded-lg px-2 py-2 text-[12.5px] font-semibold transition ${current ? "cursor-default bg-[#1a2846] text-[#8b98ae]" : isD ? "border border-[#f0a83c66] text-[#ffd59a] hover:bg-[#f0a83c1a]" : "text-[#04111a] hover:brightness-110"}`}
        style={{ marginTop: 10, ...(!current && !isD ? { background: `linear-gradient(90deg, ${O.color}, ${O.glow})` } : {}) }}>
        {current ? "Current choice" : isD ? "Keep diesel" : `Build ${O.short.toLowerCase()}`}
      </button>
    </div>
  );
}

const Row = ({ k, v, tone }) => (
  <div className="flex items-baseline justify-between gap-2"><dt className="truncate font-sans text-[#8b98ae]">{k}</dt><dd className="shrink-0" style={{ color: tone || "#fff" }}>{v}</dd></div>
);

const Metric = ({ label, value, sub, tone }) => (
  <div className="min-w-0">
    <div className="text-[10.5px] text-[#6d7a91]">{label}</div>
    <div className="num truncate text-[15px] font-medium" style={{ color: tone || "#fff" }}>{value}</div>
    <div className="truncate text-[10px] text-[#6d7a91]">{sub}</div>
  </div>
);

function ChosenCard({ decision, month, pTween, canUndo, onUndo, mode }) {
  const O = OPTIONS[decision.option];
  const online = decision.month + decision.lead;
  const done = month >= online;
  return (
    <div className="rounded-xl border border-[#2b3b5c] bg-[#0b1426] p-3" style={{ boxShadow: `inset 3px 0 0 ${O.glow}, 0 0 30px ${O.glow}14` }}>
      <div className="hud-label text-[10.5px] text-[#6d7a91]">YOUR STRATEGY · DECIDED {monthDate(decision.month).toUpperCase()}</div>
      <div className="display mt-0.5 text-[18px] font-semibold text-white">{O.title}</div>
      <div className="mt-2">
        <div className="flex justify-between text-[11.5px] text-[#a7b2c5]"><span>{done ? "Online" : "Under construction"}</span><span className="num">{done ? `since ${monthDate(online)}` : `${Math.round(pTween * 100)}% · online ${monthDate(online)}`}</span></div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#14223d]"><div className="h-full rounded-full" style={{ width: `${Math.max(3, pTween * 100)}%`, background: `linear-gradient(90deg, ${O.color}, ${O.glow})` }} /></div>
      </div>
      <div className="num mt-2.5 grid grid-cols-2 gap-2 text-[11.5px]">
        <div><div className="text-[10.5px] text-[#6d7a91]">Capital committed</div><div className="text-white">{money(decision.capex)}</div></div>
        <div><div className="text-[10.5px] text-[#6d7a91]">NPV when you decided</div><div className="text-white">{money(decision.npvAtDecision)}</div></div>
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-[#a7b2c5]">{done ? "Your island now makes much of its own power. Advance time to see how it holds up against new shocks." : "Until it is online, the island still burns diesel at today's prices. Advance time to build."}</p>
      {canUndo && <button type="button" onClick={onUndo} className="mt-2 text-[11.5px] text-[#8b98ae] underline hover:text-white">Undo this decision</button>}
      {mode === "analyst" && <div className="mt-2 text-[10.5px] text-[#6d7a91]">Capital locked at {monthDate(decision.month)} equipment prices; build time {decision.lead} months.</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------
export function RightPanel({ crisis, setCrisis, month, path, active, ind, loc, opts, tests, weights, setWeights, log, mode, decision }) {
  const [tab, setTab] = useState("trade");
  const ended = month >= crisis.months;
  return (
    <div className="glass flex h-full flex-col overflow-hidden">
      <div className="border-b border-[#1f2c46] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="hud-label text-[13px] text-white">THE CRISIS</div>
          <Tag tier="hypothetical" title="Starts from observed Nov 2026 conditions; how the disruption evolves is your hypothesis." />
        </div>
        <p className="mt-1 text-[11px] leading-snug text-[#8b98ae]">Hormuz has been disrupted since 28 Feb 2026. Set how you think it plays out. Oil price and duration are separate dials: a longer disruption does not set the price.</p>
        <Dial id="c-brent" label="Oil price while disrupted" value={crisis.brent} min={60} max={200} step={1} fmt={(v) => `$${v}/bbl`} onChange={(v) => setCrisis({ brent: v })} sub="Observed: $92.57 front-month, 10 Nov" />
        <Dial id="c-months" label="Disruption ends" value={crisis.months} min={1} max={36} step={1} fmt={(v) => `${monthDate(v)}`} onChange={(v) => setCrisis({ months: v })} sub={ended ? "Already over at this point in the game" : `${crisis.months - month} months from now · then 12 months to normalise`} />
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="hud-label text-[13px] text-white">CONSEQUENCES · {loc.name.toUpperCase()}</div>
          <Info text="Four separate indicators. They are not combined into one score unless you set your own weights in Trade-offs." />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Indicator icon="coin" title="Affordability" color="#f0cf6a"
            value={<Tw value={ind.afford.value} fmt={(v) => `$${Math.round(v)}`} />} unit="/MWh"
            sub={<>{ind.afford.value <= ind.afford.cf - 1 ? <Better>{Math.round((1 - ind.afford.value / ind.afford.cf) * 100)}% below diesel-only</Better> : <span>pre-crisis ${Math.round(ind.afford.pre)}</span>}</>}
            spark={<Spark data={ind.afford.spark} cf={ind.afford.cfSpark} color="#f0cf6a" />} />
          <Indicator icon="shield" title="Reliability" color="#7aa2ff"
            value={<Tw value={ind.rel.value * 100} fmt={(v) => `${v >= 99.95 ? "100" : v.toFixed(1)}%`} />} unit="served"
            sub={ind.rel.outageDays > 0.05 ? <Worse>≈{ind.rel.outageDays.toFixed(1)} days of shortfall this year</Worse> : <span>tank: {Math.round(Math.min(ind.rel.stockDays, 999))} days of fuel</span>}
            spark={<Spark data={ind.rel.spark} color="#7aa2ff" />} />
          <Indicator icon="flag" title="Independence" color="#2ee6c9"
            value={<Tw value={ind.indep.re * 100} fmt={(v) => `${Math.round(v)}%`} />} unit="local power"
            sub={<span>Hormuz-linked: {Math.round(ind.indep.hzShare * 100)}% of power</span>}
            spark={<Spark data={ind.indep.spark} color="#2ee6c9" />} />
          <Indicator icon="chart" title="Financial return" color="#cfd8e6"
            value={ind.fin.decided ? <Tw value={ind.fin.npv / 1e6} fmt={(v) => money(v * 1e6)} /> : "$0"} unit={ind.fin.decided ? "NPV" : "no project"}
            sub={ind.fin.decided ? <span>saved so far: {money(ind.fin.savings)}</span> : <span>still fully fuel-exposed</span>}
            spark={<Spark data={ind.fin.spark} color="#cfd8e6" />} />
        </div>
        <Narrative ind={ind} loc={loc} decision={decision} month={month} active={active} />

        <div className="mt-3 flex gap-1 rounded-full border border-[#22314f] p-[3px]">
          {[["trade", "Trade-offs"], ["story", "Story so far"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`flex-1 rounded-full py-[3px] text-[12px] ${tab === k ? "bg-[#1b2a48] text-white" : "text-[#8b98ae] hover:text-white"}`}>{l}</button>
          ))}
        </div>
        {tab === "trade" ? <TradeOffs opts={opts} tests={tests} weights={weights} setWeights={setWeights} mode={mode} /> : <Story log={log} />}
      </div>
    </div>
  );
}

const Better = ({ children }) => <span className="text-[#9ff3e4]">▼ {children}</span>;
const Worse = ({ children }) => <span className="text-[#ffb4a2]">{children}</span>;

function Dial({ id, label, value, min, max, step, fmt, onChange, sub }) {
  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between"><label htmlFor={id} className="text-[12px] text-[#cfd8e6]">{label}</label><span className="num text-[12.5px] text-white">{fmt(value)}</span></div>
      <input id={id} type="range" className="amber" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {sub && <div className="-mt-0.5 text-[10.5px] text-[#6d7a91]">{sub}</div>}
    </div>
  );
}

function Indicator({ icon, title, color, value, unit, sub, spark }) {
  return (
    <div className="rounded-xl border border-[#22314f] bg-[#0b1426] p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-[#a7b2c5]"><Icon k={icon} c={color} />{title}</div>
      <div className="mt-0.5 flex items-baseline gap-1"><span className="num text-[19px] font-medium text-white">{value}</span><span className="text-[10.5px] text-[#6d7a91]">{unit}</span></div>
      <div className="mt-0.5 min-h-[28px] text-[10.5px] leading-tight text-[#8b98ae]">{sub}</div>
      <div className="mt-1">{spark}</div>
    </div>
  );
}

function Narrative({ ind, loc, decision, month, active }) {
  const r = ind.row;
  let t;
  if (r.seff > 0.02 && ind.rel.value < 0.999) t = `Fuel deliveries are short and the tank has run dry: ${loc.name} is rationing power.`;
  else if (r.building) t = `Construction is under way. Until it finishes, ${loc.name} pays $${Math.round(r.perMWh)}/MWh for diesel power.`;
  else if (r.built) t = `Solar and storage now supply ${Math.round(r.re * 100)}% of power. The bill is $${Math.round(r.perMWh)}/MWh against $${Math.round(r.cfPerMWh)} on diesel alone.`;
  else if (active) t = `Delivered diesel costs $${r.p.toFixed(2)}/L, so power costs $${Math.round(r.perMWh)}/MWh. Every litre still crosses a contested sea.`;
  else t = `Markets have calmed: diesel is $${r.p.toFixed(2)}/L. The next shock is a matter of when, not if.`;
  return <p key={t} className="fade-in mt-2.5 rounded-xl bg-[#0e1a31] px-3 py-2 text-[12px] leading-snug text-[#cfd8e6]">{t}</p>;
}

function TradeOffs({ opts, tests, weights, setWeights, mode }) {
  const keys = ["diesel", "hybrid", "solar"];
  const rows = [
    { key: "afford", label: "Affordability", sub: "lifetime cost, $/MWh (lower is better)", v: (k) => (k === "diesel" ? opts.diesel.lcoe.baseTotal : opts[k].lcoe.hybTotal), f: (v) => `$${Math.round(v)}`, lowerBetter: true },
    { key: "rel", label: "Reliability", sub: "served in a 6-month blockade", v: (k) => tests[k].served, f: (v) => pct(v) },
    { key: "indep", label: "Independence", sub: "power made locally", v: (k) => (k === "diesel" ? 0 : opts[k].sims.hyb.reFraction), f: (v) => pct(v) },
    { key: "fin", label: "Financial return", sub: "NPV vs keeping diesel", v: (k) => (k === "diesel" ? 0 : opts[k].core.npv), f: (v) => money(v) },
  ];
  const score = {};
  keys.forEach((k) => (score[k] = 0));
  const wsum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  for (const r of rows) {
    const vals = keys.map(r.v), lo = Math.min(...vals), hi = Math.max(...vals);
    keys.forEach((k, i) => { const n = hi === lo ? 1 : (vals[i] - lo) / (hi - lo); score[k] += (weights[r.key] / wsum) * (r.lowerBetter ? 1 - n : n) * 100; });
  }
  const best = keys.reduce((a, b) => (score[b] > score[a] ? b : a));
  return (
    <div className="mt-2.5 space-y-2.5">
      <p className="px-1 text-[11px] leading-snug text-[#8b98ae]">If you decided this month. No option wins on every count.</p>
      {rows.map((r) => {
        const vals = keys.map(r.v);
        const max = Math.max(...vals.map(Math.abs)) || 1;
        return (
          <div key={r.key} className="rounded-xl border border-[#22314f] bg-[#0b1426] px-2.5 py-2">
            <div className="flex items-baseline justify-between"><span className="text-[12px] text-white">{r.label}</span><span className="text-[10px] text-[#6d7a91]">{r.sub}</span></div>
            {keys.map((k, i) => (
              <div key={k} className="mt-1 flex items-center gap-2 text-[11px]">
                <span className="w-[74px] shrink-0 text-[#a7b2c5]">{OPTIONS[k].short}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#14223d]"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(2, (Math.abs(vals[i]) / max) * 100)}%`, background: OPTIONS[k].color }} /></div>
                <span className="num w-[58px] shrink-0 text-right text-white">{r.f(vals[i])}</span>
              </div>
            ))}
          </div>
        );
      })}
      <div className="rounded-xl border border-[#22314f] bg-[#0b1426] px-2.5 py-2">
        <div className="flex items-center justify-between"><span className="text-[12px] text-white">Your priorities</span><Info text="Each indicator is rescaled 0–100 across the three options, then averaged with your weights. Change the weights and the winner can change: that is the point." /></div>
        {rows.map((r) => (
          <div key={r.key} className="mt-1 flex items-center gap-2 text-[11px]">
            <label htmlFor={`w-${r.key}`} className="w-[96px] shrink-0 text-[#a7b2c5]">{r.label}</label>
            <input id={`w-${r.key}`} type="range" min={0} max={3} step={1} value={weights[r.key]} onChange={(e) => setWeights((w) => ({ ...w, [r.key]: Number(e.target.value) }))} />
            <span className="num w-4 text-right text-white">{weights[r.key]}</span>
          </div>
        ))}
        <div className="mt-2 flex items-center justify-between text-[11.5px]">
          <span className="text-[#a7b2c5]">Best fit for your weights</span>
          <span className="display font-semibold" style={{ color: OPTIONS[best].glow }}>{OPTIONS[best].short}</span>
        </div>
        <div className="num mt-0.5 flex justify-between text-[10.5px] text-[#6d7a91]">{keys.map((k) => <span key={k}>{OPTIONS[k].short} {Math.round(score[k])}</span>)}</div>
      </div>
    </div>
  );
}

function Story({ log }) {
  const tone = { event: "#ffb4a2", renew: "#9ff3e4", fossil: "#ffd59a", muted: "#8b98ae" };
  return (
    <ol className="mt-2.5 space-y-1.5">
      {[...log].reverse().slice(0, 40).map((l, i) => (
        <li key={i} className="flex gap-2 rounded-lg bg-[#0b1426] px-2.5 py-1.5 text-[11.5px] leading-snug">
          <span className="num shrink-0 text-[10.5px] text-[#6d7a91]">{monthDate(l.m)}</span>
          <span style={{ color: tone[l.tone] || "#cfd8e6" }}>{l.text}</span>
        </li>
      ))}
      {!log.length && <li className="text-[11.5px] text-[#6d7a91]">Nothing has happened yet.</li>}
    </ol>
  );
}
