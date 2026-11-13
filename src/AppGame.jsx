import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import GameMap from "./components/game/GameMap";
import { SitePanel, RightPanel, DecisionHand } from "./components/game/Panels";
import Timeline from "./components/game/Timeline";
import { Intro, EventModal, DecisionModal, Deck, Review } from "./components/game/Overlays";
import AnalystDesk from "./components/game/AnalystDesk";
import { lookupCountry } from "./components/MapView";
import { LOCATIONS } from "./data/locations";
import { COUNTRIES, exposureIndex } from "./data/countries";
import { COSTS, TECH } from "./data/defaults";
import { SNAPSHOT_RETRIEVED, MARKET } from "./data/snapshot";
import { EVENT_TYPES } from "./game/events";
import { HORMUZ } from "./data/routes";
import { BASE, OPTIONS, GAME_MONTHS, gamePath, makeEvent, evaluateOption, ledger, markToMarket, preCrisisCost, rollEvents, blockadeTest, monthDate, activeDisruption } from "./game/engine";
import { levelizedPrices, screeningAdvantage } from "./model/finance";

const ISLANDS = LOCATIONS.filter((l) => l.useCase === "island");

function makeCustom([lon, lat]) {
  const hit = lookupCountry([lon, lat]);
  const c = COUNTRIES[hit.name];
  const pv = c?.pvout ?? Math.round(Math.max(900, Math.min(1900, 1850 - 12 * Math.max(0, Math.abs(lat) - 18))) / 10) * 10;
  return {
    id: "custom", useCase: "island", name: "Your outpost", region: hit.inside ? hit.name : `Near ${hit.name}`, country: hit.name, lat, lon,
    avgMW: 5, pvout: pv, pvoutTier: c?.pvout ? "illustrative" : "estimated", hzOil: c ? (c.role === "producer" ? 0.05 : c.hzOil) : 0.3,
    logistics: c ? c.logi + 0.1 : 0.3, margin: 0.08, tax: 0, storageDays: 30,
    note: c ? `A 5 MW diesel island grid with ${hit.name}'s indicative sunlight and supply-risk values.` : "A 5 MW diesel island grid. Sunlight estimated from latitude.",
  };
}

const crisisEvent = (c) => ({ ...makeEvent("hormuz2026", 0, c), id: "hormuz-2026" });

const INIT = {
  phase: "intro", mode: "game", month: 0, playing: false, siteId: "mv-addu", custom: null, decisions: {},
  crisis: { brent: Math.round(MARKET.brentFutures.value), months: 12 },
  events: [crisisEvent({ brent: Math.round(MARKET.brentFutures.value), months: 12 })],
  seed: 7, randomOn: true, queue: [], log: [], decisionModal: null, deckOpen: false, flyKey: 0, layer: "risk", pings: [], handOpen: false,
  base: BASE, costs: COSTS.island, tech: TECH,
};

const evPing = (ev, sites) => {
  if (ev.kind === "weather") { const s = sites.find((x) => x.id === ev.siteId); return s ? { lon: s.lon, lat: s.lat, color: "#7aa2ff" } : null; }
  if (ev.kind === "tech") return { lon: 105, lat: 25, color: "#2ee6c9" };
  if (ev.kind === "peace") return { lon: HORMUZ.lon, lat: HORMUZ.lat, color: "#2ee6c9" };
  return { lon: HORMUZ.lon, lat: HORMUZ.lat, color: "#ff7a5c" };
};

function reducer(s, a) {
  switch (a.type) {
    case "START": return { ...s, phase: "play", siteId: a.siteId, flyKey: s.flyKey + 1, log: [{ m: 0, tone: "event", text: `Day 258 of the Hormuz disruption. You take charge of ${a.name}'s power system.` }] };
    case "EXPLORE": return { ...s, phase: "play" };
    case "SELECT": return { ...s, siteId: a.siteId, handOpen: false, flyKey: s.flyKey + 1, phase: s.phase === "intro" ? "play" : s.phase };
    case "HAND": return { ...s, handOpen: a.open };
    case "CUSTOM": return { ...s, custom: a.loc, siteId: "custom", phase: s.phase === "intro" ? "play" : s.phase };
    case "DECIDE": {
      const d = a.decision;
      const log = [...s.log, { m: s.month, tone: d.option === "diesel" ? "fossil" : "renew", text: d.option === "diesel" ? `${a.name}: you keep running on diesel.` : `${a.name}: construction starts on a ${OPTIONS[d.option].short.toLowerCase()} system (${fmtM(d.capex)}). Online in about ${d.lead} months.` }];
      return { ...s, decisions: { ...s.decisions, [s.siteId]: d }, log, decisionModal: a.modal, handOpen: false };
    }
    case "UNDO": { const n = { ...s.decisions }; delete n[s.siteId]; return { ...s, decisions: n, log: [...s.log, { m: s.month, tone: "muted", text: "Decision withdrawn." }] }; }
    case "CLOSE_DECISION": return { ...s, decisionModal: null };
    case "CRISIS": {
      const crisis = { ...s.crisis, ...a.patch };
      return { ...s, crisis, events: s.events.map((e) => (e.id === "hormuz-2026" ? { ...crisisEvent(crisis), id: "hormuz-2026" } : e)) };
    }
    case "ADVANCE": {
      let { month, events, queue, log, decisions, pings, phase } = s;
      const siteIds = [...new Set([s.siteId, ...Object.keys(decisions)])];
      for (let k = 0; k < a.n; k++) {
        if (month >= GAME_MONTHS) break;
        const prevPath = gamePath(events, s.base);
        month += 1;
        const newLog = [];
        if (prevPath.dis[month - 1] > 0 && prevPath.dis[month] === 0) newLog.push({ m: month, tone: "renew", text: "The Hormuz disruption ends. Prices begin to normalise." });
        for (const [id, d] of Object.entries(decisions)) if (d.option !== "diesel" && d.month + d.lead === month) newLog.push({ m: month, tone: "renew", text: `${a.names[id] || id}: your ${OPTIONS[d.option].short.toLowerCase()} system comes online.` });
        let fired = [];
        if (s.randomOn) fired = rollEvents(month, s.seed, prevPath, siteIds).map(([t, p]) => makeEvent(t, month, { ...p, siteId: p.siteId }));
        if (fired.length) {
          events = [...events, ...fired];
          queue = [...queue, ...fired];
          pings = [...pings, ...fired.map((e) => ({ ...evPing(e, a.sites), key: e.id, born: Date.now() })).filter((p) => p.lon != null)];
          fired.forEach((e) => newLog.push({ m: month, tone: e.kind === "tech" || e.kind === "peace" ? "renew" : "event", text: `${EVENT_TYPES[e.type].title}${e.kind === "weather" ? ` at ${a.names[e.siteId] || "your island"}` : ""} (${EVENT_TYPES[e.type].tier}).` }));
        }
        log = [...log, ...newLog];
        if (fired.length) break;
      }
      if (month >= GAME_MONTHS) phase = "review";
      return { ...s, month, events, queue, log, pings, phase, playing: s.playing && queue.length === 0 && month < GAME_MONTHS };
    }
    case "TRIGGER": {
      const e = makeEvent(a.etype, s.month, { siteId: s.siteId });
      return { ...s, events: [...s.events, e], queue: [...s.queue, e], deckOpen: false, playing: false,
        pings: [...s.pings, { ...evPing(e, a.sites), key: e.id, born: Date.now() }].filter((p) => p.lon != null),
        log: [...s.log, { m: s.month, tone: "event", text: `You played “${EVENT_TYPES[a.etype].title}” from the event deck (${EVENT_TYPES[a.etype].tier}).` }] };
    }
    case "DISMISS": return { ...s, queue: s.queue.slice(1) };
    case "PLAY": return { ...s, playing: a.on && s.month < GAME_MONTHS };
    case "MODE": return { ...s, mode: a.mode };
    case "DECK": return { ...s, deckOpen: a.open };
    case "RANDOM": return { ...s, randomOn: a.on };
    case "LAYER": return { ...s, layer: a.layer };
    case "PRUNE_PINGS": return { ...s, pings: s.pings.filter((p) => Date.now() - p.born < 5200) };
    case "BASE": return { ...s, base: { ...s.base, ...a.patch } };
    case "COSTS": return { ...s, costs: { ...s.costs, ...a.patch } };
    case "REVIEW": return { ...s, phase: "review", playing: false };
    case "RESUME": return { ...s, phase: "play" };
    case "RESTART": return { ...INIT, seed: Math.floor(Math.random() * 1e6), phase: "intro" };
    default: return s;
  }
}
const fmtM = (v) => (Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(Math.abs(v) >= 1e8 ? 0 : 1)}M`);

function useWide(min = 1180) {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth >= min : true);
  useEffect(() => { const f = () => setW(window.innerWidth >= min); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, [min]);
  return w;
}

export default function AppGame() {
  const [s, dispatch] = useReducer(reducer, INIT);
  const wide = useWide();
  const [weights, setWeights] = useState({ afford: 1, rel: 1, indep: 1, fin: 1 });
  const analystRef = useRef(null);

  const sites = useMemo(() => (s.custom ? [...ISLANDS, s.custom] : ISLANDS), [s.custom]);
  const byId = useMemo(() => Object.fromEntries(sites.map((l) => [l.id, l])), [sites]);
  const names = useMemo(() => Object.fromEntries(sites.map((l) => [l.id, l.name])), [sites]);
  const loc = byId[s.siteId] || ISLANDS[0];

  const path = useMemo(() => gamePath(s.events, s.base), [s.events, s.base]);
  const G = useMemo(() => ({ events: s.events, base: s.base, costs: s.costs, tech: s.tech, path }), [s.events, s.base, s.costs, s.tech, path]);
  const decision = s.decisions[loc.id];

  // forward-looking options for the selected site, from the current month
  const opts = useMemo(() => ({
    diesel: evaluateOption(loc, "diesel", s.month, G, { withMC: false }),
    hybrid: evaluateOption(loc, "hybrid", s.month, G, { withSens: s.mode === "analyst" }),
    solar: evaluateOption(loc, "solar", s.month, G, { withSens: s.mode === "analyst" }),
  }), [loc, s.month, G, s.mode]);
  const tests = useMemo(() => ({ diesel: blockadeTest(loc, "diesel", G), hybrid: blockadeTest(loc, "hybrid", G), solar: blockadeTest(loc, "solar", G) }), [loc, G]);

  // what each choice would do to the bill once built (same ledger engine)
  const afterBill = useMemo(() => {
    const out = {};
    for (const k of ["diesel", "hybrid", "solar"]) {
      const r = opts[k];
      const lead = Math.round(r.dep.mid);
      const d = k === "diesel" ? null : { option: k, month: s.month, lead, capex: r.core.capex };
      const start = Math.min(GAME_MONTHS, s.month + (d ? lead : 0));
      const L = ledger(loc, d, G, Math.min(GAME_MONTHS, start + 11));
      const rows = L.rows.slice(start, start + 12);
      out[k] = { perMWh: rows.reduce((a, r_) => a + r_.perMWh, 0) / rows.length, onlineMonth: start, lead };
    }
    return out;
  }, [opts, loc, G, s.month]);

  const L = useMemo(() => ledger(loc, decision, G, GAME_MONTHS), [loc, decision, G]);
  const mtm = useMemo(() => markToMarket(loc, decision, G), [loc, decision, G]);
  const pre = useMemo(() => preCrisisCost(loc, G), [loc, G]);

  const ind = useMemo(() => {
    const m = s.month, rows = L.rows, row = rows[m];
    const win = rows.slice(Math.max(0, m - 11), m + 1);
    const avg = (f) => win.reduce((a, r) => a + f(r), 0) / win.length;
    let savings = 0;
    for (let k = 0; k <= m; k++) savings += rows[k].cfCost - rows[k].cost;
    const past = rows.slice(0, m + 1);
    return {
      afford: { value: row.perMWh, cf: row.cfPerMWh, pre, spark: past.map((r) => r.perMWh), cfSpark: past.map((r) => r.cfPerMWh) },
      rel: { value: avg((r) => r.served), cf: avg((r) => r.cfServed), stockDays: row.stockDays, outageDays: win.reduce((a, r) => a + (1 - r.served) * 30.44, 0), cfOutageDays: win.reduce((a, r) => a + (1 - r.cfServed) * 30.44, 0), spark: past.map((r) => r.served) },
      indep: { re: row.re, hzShare: (1 - row.re) * (loc.hzOil ?? 0), fuelYr: row.fuelL * 12, cfFuelYr: row.cfFuelL * 12, spark: past.map((r) => r.re) },
      fin: { decided: decision && decision.option !== "diesel", npv: mtm?.npv ?? 0, npvAtDecision: decision?.npvAtDecision, savings, payback: mtm?.payback, spark: past.map((_, k) => rows.slice(0, k + 1).reduce((a, r) => a + r.cfCost - r.cost, 0)) },
      row,
    };
  }, [L, s.month, loc, decision, mtm, pre]);

  const siteStates = useMemo(() => sites.map((l) => {
    const d = s.decisions[l.id];
    let status = d ? (d.option === "diesel" ? "diesel" : s.month >= d.month + d.lead ? d.option : "building") : "undecided";
    const progress = d && d.option !== "diesel" ? Math.min(1, (s.month - d.month) / d.lead) : 0;
    const statusLabel = status === "undecided" ? "Running on imported diesel · no decision yet" : status === "diesel" ? "Kept diesel" : status === "building" ? `Building ${OPTIONS[d.option].short} · ${Math.round(progress * 100)}%` : `${OPTIONS[d.option].short} online`;
    return { ...l, status, progress, statusLabel };
  }), [sites, s.decisions, s.month]);

  const countryVals = useMemo(() => {
    const lev = levelizedPrices({ brent: path.brent.subarray(s.month), crack: path.crack.subarray(s.month), lng: path.lng.subarray(s.month), surch: path.surch.subarray(s.month) }, s.costs.wacc, s.costs.life);
    const out = {};
    for (const [name, c] of Object.entries(COUNTRIES)) {
      const sa = screeningAdvantage(c, s.base, s.costs, lev);
      out[name] = { pvout: c.pvout, exposure: exposureIndex(c), producer: c.role === "producer", advantage: sa?.advantage ?? null };
    }
    return out;
  }, [path, s.month, s.costs, s.base]);

  // autoplay
  useEffect(() => {
    if (!s.playing || s.queue.length || s.phase !== "play") return;
    const t = setInterval(() => dispatch({ type: "ADVANCE", n: 1, names, sites }), 900);
    return () => clearInterval(t);
  }, [s.playing, s.queue.length, s.phase, names, sites]);
  useEffect(() => { if (!s.pings.length) return; const t = setTimeout(() => dispatch({ type: "PRUNE_PINGS" }), 5400); return () => clearTimeout(t); }, [s.pings]);

  const advance = (n) => dispatch({ type: "ADVANCE", n, names, sites });

  const decide = (k) => {
    const r = opts[k];
    const lead = k === "diesel" ? 0 : Math.round(r.dep.mid);
    const d = { option: k, month: s.month, lead, capex: k === "diesel" ? 0 : r.core.capex, npvAtDecision: k === "diesel" ? 0 : r.core.npv, prob: r.mc?.probPositive };
    const modal = {
      option: k, site: loc.name, lead, onlineLabel: monthDate(s.month + lead),
      rows: [
        { label: "Electricity cost", unit: "$/MWh", before: ind.row.perMWh, after: afterBill[k].perMWh, better: "lower", note: k === "diesel" ? "Next 12 months, fuel prices as now expected" : "First 12 months after commissioning, incl. capital charge" },
        { label: "Imported-fuel share of power", unit: "%", before: 100, after: (1 - (k === "diesel" ? 0 : r.sims.hyb.reFraction)) * 100, better: "lower" },
        { label: "Demand served in a 6-month blockade", unit: "%", before: tests.diesel.served * 100, after: tests[k].served * 100, better: "higher" },
        { label: "Project NPV vs keeping diesel", unit: "$M", before: 0, after: k === "diesel" ? 0 : r.core.npv / 1e6, better: "higher" },
      ],
    };
    dispatch({ type: "DECIDE", decision: d, modal, name: loc.name });
  };

  const setMode = (mode) => {
    dispatch({ type: "MODE", mode });
    if (mode === "analyst") setTimeout(() => analystRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  const dis = path.dis[s.month];
  const blockade = dis >= 0.9;
  const active = activeDisruption(path, s.month);
  const handVisible = s.phase === "play" && (!decision || (decision.option === "diesel" && s.handOpen));
  const insets = wide ? { left: 360, right: 344, top: 8, bottom: handVisible ? (s.mode === "analyst" ? 318 : 268) : 8 } : { left: 0, right: 0, top: 0, bottom: 0 };

  const site = <SitePanel loc={loc} state={siteStates.find((x) => x.id === loc.id)} decision={decision} month={s.month} mode={s.mode} row={ind.row} sims={{ base: L.base, opt: L.optSims }}
    others={siteStates.filter((x) => x.id !== loc.id)} onSelect={(id) => dispatch({ type: "SELECT", siteId: id })} onReopen={() => dispatch({ type: "HAND", open: true })}
    canUndo={decision && decision.month === s.month} onUndo={() => dispatch({ type: "UNDO" })} />;
  const hand = <DecisionHand loc={loc} decision={decision} month={s.month} opts={opts} tests={tests} afterBill={afterBill} mode={s.mode} onDecide={decide}
    onClose={decision ? () => dispatch({ type: "HAND", open: false }) : null} />;
  const right = <RightPanel crisis={s.crisis} setCrisis={(patch) => dispatch({ type: "CRISIS", patch })} month={s.month} path={path} active={active} ind={ind} loc={loc}
    opts={opts} tests={tests} weights={weights} setWeights={setWeights} log={s.log} mode={s.mode} decision={decision} />;

  return (
    <>
      <div className="flex flex-col" style={{ height: "100%", minHeight: 720 }}>
        <TopBar month={s.month} path={path} dis={dis} blockade={blockade} mode={s.mode} setMode={setMode} onDeck={() => dispatch({ type: "DECK", open: true })} onRestart={() => dispatch({ type: "RESTART" })} />
        <div className="relative min-h-0 flex-1" style={wide ? undefined : { minHeight: "58vh" }}>
          <GameMap sites={siteStates} selectedId={loc.id} onSelect={(id) => dispatch({ type: "SELECT", siteId: id })} onPlaceCustom={(ll) => dispatch({ type: "CUSTOM", loc: makeCustom(ll) })}
            custom={s.custom} disruption={dis} blockade={blockade} layer={s.layer} setLayer={(layer) => dispatch({ type: "LAYER", layer })} countryVals={countryVals} insets={insets} pings={s.pings} flyKey={s.phase === "play" ? s.flyKey : 0} />
          {wide && s.phase !== "intro" && (
            <>
              <div className="rise absolute bottom-2 left-2 top-2 w-[348px]">{site}</div>
              <div className="rise absolute bottom-2 right-2 top-2 w-[332px]" style={{ animationDelay: "0.08s" }}>{right}</div>
              {handVisible && <div className="absolute bottom-2" style={{ left: 360, right: 344 }}>{hand}</div>}
            </>
          )}
        </div>
        <Timeline month={s.month} events={s.events} path={path} rows={L.rows} decision={decision} decisions={s.decisions} names={names} playing={s.playing}
          onPlay={(on) => dispatch({ type: "PLAY", on })} onAdvance={advance} randomOn={s.randomOn} setRandom={(on) => dispatch({ type: "RANDOM", on })}
          onReview={() => dispatch({ type: "REVIEW" })} disabled={s.phase === "intro"} loc={loc} base={s.base} />
      </div>
      {!wide && s.phase !== "intro" && (
        <div className="space-y-3 p-3">
          {handVisible && <div className="overflow-x-auto scroll-thin"><div className="min-w-[620px]">{hand}</div></div>}
          <div className="grid gap-3 md:grid-cols-2"><div className="min-h-[600px]">{site}</div><div className="min-h-[640px]">{right}</div></div>
        </div>
      )}
      {s.mode === "analyst" && s.phase !== "intro" && (
        <div ref={analystRef}><AnalystDesk loc={loc} opts={opts} tests={tests} G={G} month={s.month} decision={decision}
          base={s.base} setBase={(patch) => dispatch({ type: "BASE", patch })} costs={s.costs} setCosts={(patch) => dispatch({ type: "COSTS", patch })} /></div>
      )}

      {s.phase === "intro" && <Intro onStart={(l) => dispatch({ type: "START", siteId: l.id, name: l.name })} onExplore={() => dispatch({ type: "EXPLORE" })} sites={ISLANDS} />}
      {s.queue.length > 0 && s.phase !== "intro" && <EventModal ev={s.queue[0]} loc={loc} G={G} month={s.month} names={names} onClose={() => dispatch({ type: "DISMISS" })} />}
      {s.decisionModal && <DecisionModal m={s.decisionModal} onClose={() => dispatch({ type: "CLOSE_DECISION" })} onAdvance={() => { dispatch({ type: "CLOSE_DECISION" }); dispatch({ type: "PLAY", on: true }); }} />}
      {s.deckOpen && <Deck onClose={() => dispatch({ type: "DECK", open: false })} onPlay={(etype) => dispatch({ type: "TRIGGER", etype, sites })} loc={loc} />}
      {s.phase === "review" && <Review sites={sites} decisions={s.decisions} G={G} onClose={() => dispatch({ type: "RESUME" })} onRestart={() => dispatch({ type: "RESTART" })} month={s.month} />}
    </>
  );
}

function TopBar({ month, path, dis, blockade, mode, setMode, onDeck, onRestart }) {
  const brent = path.brent[month];
  const obs = month === 0;
  return (
    <header className="z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[#1a2846] bg-[#060b16] px-4 py-2">
      <div className="flex items-center gap-3">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M13 1 L25 13 L13 25 L1 13 Z" fill="none" stroke="#2ee6c9" strokeWidth="1.5" /><path d="M1 13 H25 M13 1 V25" stroke="#f0a83c" strokeWidth="1.2" /><circle cx="13" cy="13" r="2.6" fill="#f0cf6a" /></svg>
        <div className="font-pixel text-[13px] leading-none text-white" style={{ textShadow: "2px 2px 0 #c9821f" }}>ENERGY CROSSROADS</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-baseline gap-2 rounded-full border border-[#22314f] px-3 py-1">
          <span className="hud-label text-[14px] text-white">{monthDate(month).toUpperCase()}</span>
          <span className="num text-[10.5px] text-[#6d7a91]">month {month}/{GAME_MONTHS}</span>
        </div>
        <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] ${dis > 0 ? (blockade ? "border-[#ff7a5c80] text-[#ffb4a2]" : "border-[#f0a83c80] text-[#ffd59a]") : "border-[#2ee6c980] text-[#9ff3e4]"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${dis > 0 ? "animate-pulse" : ""}`} style={{ background: dis > 0 ? (blockade ? "#ff7a5c" : "#f0a83c") : "#2ee6c9" }} />
          <span className="hud-label">HORMUZ {dis > 0 ? `${Math.round(dis * 100)}% DISRUPTED` : "OPEN"}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-[#22314f] px-3 py-1 text-[11.5px] text-[#cfd8e6]" title={obs ? `Observed: ICE Brent front-month settled $${MARKET.brentFutures.value} on 10 Nov 2026 (snapshot ${SNAPSHOT_RETRIEVED}); the game uses your chosen disruption price.` : "Hypothetical path from your scenario and events"}>
          Brent <span className="num text-white">${brent.toFixed(0)}</span><span className="text-[10px] text-[#6d7a91]">{obs ? "scenario · obs. $92.57 on 10 Nov" : "scenario"}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div role="radiogroup" aria-label="Mode" className="flex rounded-full border border-[#2b3b5c] p-[3px]">
          {[["game", "Game"], ["analyst", "Analyst"]].map(([k, l]) => (
            <button key={k} role="radio" aria-checked={mode === k} type="button" onClick={() => setMode(k)} className={`rounded-full px-3 py-[3px] text-[12px] font-medium ${mode === k ? "bg-[#1b2a48] text-white" : "text-[#8b98ae] hover:text-white"}`}>{l} mode</button>
          ))}
        </div>
        <button type="button" onClick={onDeck} className="rounded-full border border-[#2b3b5c] px-3 py-[5px] text-[12px] text-[#cfd8e6] hover:border-[#4a5d85] hover:text-white">Event deck</button>
        <button type="button" onClick={onRestart} className="rounded-full border border-[#2b3b5c] px-3 py-[5px] text-[12px] text-[#8b98ae] hover:text-white">Restart</button>
      </div>
    </header>
  );
}
