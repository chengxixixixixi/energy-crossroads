import React, { useEffect, useMemo, useState } from "react";
import PixelWorld from "./PixelWorld";
import { EVENT_TYPES } from "../../game/events";
import { OPTIONS, monthDate, ledger, capexMults, evaluateOption, markToMarket, GAME_MONTHS, gamePath } from "../../game/engine";
import { MARKET, SHIPPING, SNAPSHOT_RETRIEVED } from "../../data/snapshot";
import { Tag } from "../ui";
import { Tw } from "./anim";
import { money } from "./Panels";

const TIER_LABEL = { observed: "BASED ON OBSERVED DATA", historical: "HISTORICAL REPLAY", hypothetical: "HYPOTHETICAL" };
const TIER_TAG = { observed: "observed", historical: "observed", hypothetical: "hypothetical" };

function Shell({ children, onClose, wide, label }) {
  useEffect(() => {
    const f = (e) => { if (e.key === "Escape" && onClose) onClose(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-[#02060dcc] p-4" role="dialog" aria-modal="true" aria-label={label} onClick={onClose}>
      <div className={`rise glass max-h-[92vh] w-full overflow-y-auto scroll-thin ${wide ? "max-w-4xl" : "max-w-lg"}`} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

// ---- Intro (pixel-art title screen) -------------------------------------------------
const PICKS = [
  { id: "mv-addu", hook: "Atoll capital. Small grid, long supply line, 30 days of fuel.", tag: "EASY", sprite: "atoll" },
  { id: "to-tongatapu", hook: "Pacific kingdom in the cyclone belt. Fuel comes from Singapore.", tag: "STORMY", sprite: "cyclone" },
  { id: "sc-mahe", hook: "A 50 MW national grid. Big bills, big decisions.", tag: "HARD", sprite: "pylon" },
  { id: "bb-barbados", hook: "Little Hormuz exposure, full oil-price exposure.", tag: "TWIST", sprite: "barrel" },
];

const SPRITES = {
  atoll: { pal: { g: "#2ee6c9", G: "#1fa89b", b: "#a86b2a", y: "#f0cf6a", w: "#5b88f0", W: "#7aa2ff" }, px: [
    "..gg..GG....", ".ggGgggGg...", "gg..gbg.gg..", "G....b....G.", ".....b......", "......b.....",
    "......b.....", "......b.....", "...yyyyyyy..", ".yyyyyyyyyyy", "wwwWwwwwWwww", ".w.ww.W.ww.w"] },
  cyclone: { pal: { c: "#a9c2ff", d: "#5b88f0", r: "#e8edf5" }, px: [
    "....cccc....", "..cc....cc..", ".c..dddd..c.", "c..d....d...", "c.d..rr..d..", "c.d.r..r.d.c",
    "..d.r..r.d.c", "..d..rr..d.c", "...d....d..c", ".c..dddd..c.", "..cc....cc..", "....cccc...."] },
  pylon: { pal: { k: "#a7b2c5", a: "#f0cf6a" }, px: [
    ".....kk.....", "....k..k....", "kkkkkkkkkkkk", "...k.kk.k...", "....kaak....", "kkkkkakkkkkk",
    "...k.ak.k...", "...k.kak....", "..k..kk.ak..", "..k.k..k.k..", ".k.k....k.k.", ".k........k."] },
  barrel: { pal: { o: "#5f421c", r: "#c9821f", y: "#f0cf6a" }, px: [
    "...oooooo...", "..rrrrrrrr..", "..oooooooo..", "..rrryyrrr..", "..rryrrrrr..", "..rrryyrrr..",
    "..rrrrryrr..", "..rryyrrrr..", "..oooooooo..", "..rrrrrrrr..", "..oooooooo..", "...rrrrrr..."] },
};

export function Sprite({ name, size = 48 }) {
  const S = SPRITES[name];
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true">
      {S.px.flatMap((row, y) => row.split("").map((ch, x) => (S.pal[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={S.pal[ch]} /> : null)))}
    </svg>
  );
}

const Bar = ({ label, v, color }) => {
  const n = Math.max(0, Math.min(5, Math.round(v * 5)));
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${n}/5`}>
      <span className="w-[32px] shrink-0 text-[12px] text-[#8b98ae]">{label}</span>
      <span className="flex gap-[2px]">{[0, 1, 2, 3, 4].map((i) => <i key={i} className="inline-block h-[8px] w-[8px]" style={{ background: i < n ? color : "#1a2846" }} />)}</span>
    </div>
  );
};

export function Intro({ onStart, onExplore, sites }) {
  const byId = Object.fromEntries(sites.map((s) => [s.id, s]));
  const [sel, setSel] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const go = (i) => {
    if (leaving) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { onStart(byId[PICKS[i].id]); return; }
    setSel(i); setLeaving(true);
    setTimeout(() => onStart(byId[PICKS[i].id]), 520);
  };
  useEffect(() => {
    const f = (e) => {
      if (["ArrowRight", "ArrowDown"].includes(e.key)) { e.preventDefault(); setSel((i) => (i + 1) % PICKS.length); }
      else if (["ArrowLeft", "ArrowUp"].includes(e.key)) { e.preventDefault(); setSel((i) => (i + PICKS.length - 1) % PICKS.length); }
      else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); go(sel); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });
  const markers = PICKS.map((p) => ({ id: p.id, lon: byId[p.id].lon, lat: byId[p.id].lat }));
  const [wide, setWide] = useState(typeof window !== "undefined" && window.innerWidth >= 1100);
  useEffect(() => { const f = () => setWide(window.innerWidth >= 1100); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const sep = <i className="mx-3 inline-block h-[6px] w-[6px] bg-[#ff7a5c] align-middle" />;
  const ticker = <>BREAKING{sep}DAY 258 OF THE HORMUZ DISRUPTION{sep}BRENT ${MARKET.brentFutures.value} (10 NOV){sep}ASIAN DIESEL MARGIN NEAR $70/BBL{sep}REFINED-PRODUCT FLOWS {SHIPPING.productFlows.value}% VS PRE-WAR{sep}ISLANDS RUN ON IMPORTED DIESEL{sep}</>;
  return (
    <div className={`pixel-screen fixed inset-0 z-50 overflow-y-auto ${leaving ? "pixel-out" : ""}`}>
      <div className="fixed inset-0"><PixelWorld markers={markers} focus={PICKS[sel].id} focusLabel={byId[PICKS[sel].id].name.toUpperCase()} centerLon={wide ? 5 : 75} /></div>
      <div className="pointer-events-none fixed inset-0" style={{ background: wide ? "linear-gradient(90deg, rgba(4,8,18,0.92) 0%, rgba(4,8,18,0.84) 42%, rgba(4,8,18,0.2) 62%, rgba(4,8,18,0.1) 85%, rgba(4,8,18,0.45) 100%)" : "rgba(4,8,18,0.72)" }} />
      <div className="crt pointer-events-none fixed inset-0" />

      <div className="relative z-10 border-b-4 border-[#0b1426] bg-[#2a0d0d] py-1.5">
        <div className="marquee font-pixel text-[10px] leading-none text-[#ffb4a2]">
          <span>{ticker}</span>
          <span aria-hidden="true">{ticker}</span>
        </div>
      </div>

      <div className={`relative z-10 flex min-h-[calc(100%-32px)] flex-col justify-center px-5 py-5 ${wide ? "ml-[5vw] max-w-[680px]" : "mx-auto max-w-5xl"}`}>
        <div className="font-pixel text-[11px] tracking-[0.2em] text-[#2ee6c9]">A GEOPOLITICAL ENERGY STRATEGY GAME</div>
        <h1 className="pixel-title mt-4 font-pixel leading-[1.05] text-white">
          <span className="block text-[30px] sm:text-[46px]">ENERGY</span>
          <span className="block text-[30px] text-[#f0cf6a] sm:text-[46px]">CROSSROADS</span>
        </h1>
        <p className="mt-5 max-w-2xl font-pixelbody text-[21px] leading-snug text-[#e8edf5]">
          A disruption in the Strait of Hormuz threatens global energy supplies. <span className="text-[#2ee6c9]">Can you build a more resilient energy system?</span>
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <PixFact v={`$${MARKET.brentFutures.value}`} l="Brent front-month, settled 10 Nov" />
          <PixFact v="≈$70" l="Asian diesel margin per barrel, late Oct (≈$20 pre-war)" />
          <PixFact v={`${SHIPPING.productFlows.value}%`} l="Product flows vs pre-war (Kpler, 20 Oct)" />
        </div>

        <div className="mt-6 flex items-baseline justify-between gap-3">
          <div className="font-pixel text-[13px] text-white">SELECT YOUR ISLAND</div>
          <div className="hidden font-pixelbody text-[15px] text-[#8b98ae] sm:block">← → to choose · ENTER to start</div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {PICKS.map((p, i) => {
            const s = byId[p.id];
            const on = sel === i;
            return (
              <button key={p.id} type="button" onMouseEnter={() => setSel(i)} onFocus={() => setSel(i)} onClick={() => go(i)}
                className={`pixel-card relative text-left ${on ? "pixel-card-on" : ""}`}>
                {on && <span className="blink absolute -left-1 top-1/2 -translate-x-full -translate-y-1/2 font-pixel text-[16px] text-[#2ee6c9]" aria-hidden="true">▶</span>}
                <div className="flex gap-3">
                  <div className="shrink-0 bg-[#0b1426] p-1.5" style={{ boxShadow: "0 0 0 3px #1a2846" }}><Sprite name={p.sprite} size={52} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-pixel text-[13px] leading-snug text-white">{s.name.toUpperCase()}</div>
                      <span className="shrink-0 bg-[#1a2846] px-1.5 py-[3px] font-pixel text-[8px] text-[#f0cf6a]">{p.tag}</span>
                    </div>
                    <div className="font-pixelbody text-[15px] text-[#8b98ae]">{s.region}</div>
                    <p className="mt-1 font-pixelbody text-[16px] leading-tight text-[#cfd8e6]">{p.hook}</p>
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2 font-pixelbody">
                  <Bar label="RISK" v={s.hzOil / 0.7} color="#f0a83c" />
                  <Bar label="SUN" v={(s.pvout - 1300) / 500} color="#2ee6c9" />
                  <Bar label="SIZE" v={Math.log10(s.avgMW * 2) / 2.3} color="#7aa2ff" />
                </div>
                {on && <div className="blink mt-2 font-pixel text-[10px] text-[#2ee6c9]">PRESS ENTER TO START</div>}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={onExplore} className="mt-4 self-start font-pixelbody text-[17px] text-[#a7b2c5] underline decoration-[#2b3b5c] underline-offset-4 hover:text-white">
          Or explore the map and pick any island, or click anywhere to found your own outpost →
        </button>
        <p className="mt-3 max-w-3xl font-pixelbody text-[13px] leading-snug text-[#6d7a91]">Market figures are a dated snapshot retrieved {SNAPSHOT_RETRIEVED}, not live data. Everything after today in the game is a hypothetical scenario you control. Island parameters are representative, not audited utility data. Map colour: Hormuz supply risk (amber = high, rust = Gulf producers).</p>
      </div>
    </div>
  );
}
const PixFact = ({ v, l }) => (
  <div className="pixel-box px-3 py-2">
    <div className="flex items-center gap-2"><span className="font-pixel text-[15px] text-white">{v}</span><Tag tier="observed" /></div>
    <div className="mt-1 font-pixelbody text-[15px] leading-tight text-[#a7b2c5]">{l}</div>
  </div>
);

// ---- Event card ---------------------------------------------------------------------
export function EventModal({ ev, loc, G, month, names, onClose }) {
  const T = EVENT_TYPES[ev.type];
  const impact = useMemo(() => {
    // impact = this month with the event vs the same month without it
    const ev0 = G.events.filter((e) => e.id !== ev.id);
    const G0 = { ...G, events: ev0, path: gamePath(ev0, G.base) };
    const before = ledger(loc, null, G0, month).rows[month];
    const now = ledger(loc, null, G, month).rows[month];
    const k0 = capexMults(G.events.filter((e) => e.id !== ev.id), G.base, month), k1 = capexMults(G.events, G.base, month);
    return { before, now, k0, k1 };
  }, [ev, loc, G, month]);
  const temporary = T.type === "temporary";
  const dur = ev.kind === "disruption" ? `${ev.months} months` : ev.kind === "spike" ? `${ev.months} months` : ev.kind === "replay" ? `${ev.ratios.length} months` : ev.kind === "weather" ? `${ev.blockDays} days` : ev.kind === "peace" ? "now" : "";
  const accent = ev.kind === "tech" || ev.kind === "peace" ? "#2ee6c9" : ev.kind === "weather" ? "#7aa2ff" : ev.kind === "replay" ? "#b59cff" : "#ff7a5c";
  return (
    <Shell onClose={onClose} label={T.title}>
      <div className="p-5" style={{ boxShadow: `inset 0 3px 0 ${accent}` }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hud-label rounded-full px-2.5 py-[2px] text-[11px]" style={{ color: accent, border: `1px solid ${accent}80`, background: `${accent}14` }}>EVENT · {monthDate(month).toUpperCase()}</span>
          <span className="hud-label rounded-full border border-[#2b3b5c] px-2.5 py-[2px] text-[11px] text-[#cfd8e6]">{temporary ? `TEMPORARY SHOCK${dur ? ` · ${dur.toUpperCase()}` : ""}` : "STRUCTURAL CHANGE · PERMANENT"}</span>
          <span className="hud-label flex items-center gap-1.5 text-[11px] text-[#8b98ae]">{TIER_LABEL[T.tier]} <Tag tier={TIER_TAG[T.tier]} /></span>
        </div>
        <h2 className="display mt-3 text-[26px] font-semibold leading-tight text-white"><span className="mr-2" aria-hidden="true">{T.icon}</span>{T.title}{ev.kind === "weather" ? ` hits ${names[ev.siteId] || "an island"}` : ""}</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[#cfd8e6]">{T.blurb}</p>
        <div className="mt-4 rounded-xl border border-[#22314f] bg-[#0b1426] p-3">
          <div className="hud-label mb-1 text-[11px] text-[#8b98ae]">WHAT CHANGES IN THE MODEL</div>
          <ul className="space-y-1 text-[12.5px] text-[#dfe6f1]">{T.effects(ev).map((l) => <li key={l} className="flex gap-2"><span style={{ color: accent }}>›</span>{l}</li>)}</ul>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {ev.kind === "tech" ? (
            <>
              <Delta label="Solar capital cost" a={impact.k0.pv} b={impact.k1.pv} fmt={(v) => `${Math.round(v * 100)}`} unit="index" good="down" />
              <Delta label="Battery capital cost" a={impact.k0.batt} b={impact.k1.batt} fmt={(v) => `${Math.round(v * 100)}`} unit="index" good="down" />
              <div className="rounded-xl border border-[#22314f] bg-[#0b1426] p-2 text-[11px] leading-snug text-[#a7b2c5]">Applies to projects you start from now. Built projects keep their locked-in cost.</div>
            </>
          ) : (
            <>
              <Delta label={`Delivered diesel, ${loc.name} (without → with event)`} a={impact.before.p} b={impact.now.p} fmt={(v) => `$${v.toFixed(2)}`} unit="/L" good="down" />
              <Delta label="Diesel-only power cost" a={impact.before.cfPerMWh} b={impact.now.cfPerMWh} fmt={(v) => `$${Math.round(v)}`} unit="/MWh" good="down" />
              <Delta label="Supply shortfall now" a={impact.before.seff} b={impact.now.seff} fmt={(v) => `${Math.round(v * 100)}%`} unit="" good="down" />
            </>
          )}
        </div>
        <p className="mt-3 text-[11px] text-[#6d7a91]">Crude moves are passed to diesel through an explicit chain (crude + refining margin + freight + war-risk surcharge + local margin), so a 40% crude spike is not a 40% diesel spike.</p>
        <button type="button" autoFocus onClick={onClose} className="mt-4 w-full rounded-xl py-2.5 text-[14px] font-semibold text-[#04111a]" style={{ background: "linear-gradient(90deg,#1fa89b,#2ee6c9)" }}>Continue</button>
      </div>
    </Shell>
  );
}

function Delta({ label, a, b, fmt, unit, good }) {
  const up = b > a + 1e-9, down = b < a - 1e-9;
  const isGood = (good === "down" && down) || (good === "up" && up);
  const col = !up && !down ? "#a7b2c5" : isGood ? "#9ff3e4" : "#ffb4a2";
  return (
    <div className="rounded-xl border border-[#22314f] bg-[#0b1426] p-2">
      <div className="text-[10.5px] leading-tight text-[#8b98ae]">{label}</div>
      <div className="num mt-1 text-[12px] text-[#8b98ae]">{fmt(a)} <span className="text-[#6d7a91]">→</span></div>
      <div className="num text-[17px]" style={{ color: col }}><Tw value={b} fmt={fmt} dur={900} /><span className="text-[10.5px] text-[#6d7a91]">{unit}</span></div>
    </div>
  );
}

// ---- Decision before/after -----------------------------------------------------------
export function DecisionModal({ m, onClose, onAdvance }) {
  const O = OPTIONS[m.option];
  const isD = m.option === "diesel";
  return (
    <Shell onClose={onClose} label="Decision made">
      <div className="p-5" style={{ boxShadow: `inset 0 3px 0 ${O.glow}` }}>
        <div className="hud-label text-[11px] text-[#8b98ae]">DECISION LOCKED IN · {m.site.toUpperCase()}</div>
        <h2 className="display mt-1 text-[26px] font-semibold text-white">{O.title}</h2>
        <p className="mt-1 text-[13px] text-[#cfd8e6]">{isD ? "No construction. Your island keeps buying imported diesel at whatever the market charges." : `Construction starts now and finishes around ${m.onlineLabel}. Until then, you still run on diesel.`}</p>
        <div className="mt-4 space-y-2">
          {m.rows.map((r) => {
            const better = r.better === "lower" ? r.after < r.before - 1e-6 : r.after > r.before + 1e-6;
            const same = Math.abs(r.after - r.before) < 1e-6;
            const fmt = (v) => (r.unit === "$M" ? money(v * 1e6) : r.unit === "%" ? `${Math.round(v)}%` : `$${Math.round(v)}`);
            const max = Math.max(Math.abs(r.before), Math.abs(r.after)) || 1;
            return (
              <div key={r.label} className="rounded-xl border border-[#22314f] bg-[#0b1426] p-2.5">
                <div className="flex items-baseline justify-between gap-2"><span className="text-[12.5px] text-white">{r.label}</span><span className="num text-[12px]" style={{ color: same ? "#a7b2c5" : better ? "#9ff3e4" : "#ffb4a2" }}>{same ? "no change" : better ? "better" : "worse"}</span></div>
                <div className="mt-1.5 grid grid-cols-[52px_1fr_70px] items-center gap-2 text-[11px]">
                  <span className="text-[#8b98ae]">Before</span>
                  <div className="h-2 rounded-full bg-[#14223d]"><div className="h-full rounded-full bg-[#c9821f]" style={{ width: `${(Math.abs(r.before) / max) * 100}%` }} /></div>
                  <span className="num text-right text-[#cfd8e6]">{fmt(r.before)}</span>
                  <span className="text-[#8b98ae]">After</span>
                  <div className="h-2 rounded-full bg-[#14223d]"><div className="h-full rounded-full transition-all duration-1000" style={{ width: `${(Math.abs(r.after) / max) * 100}%`, background: O.glow }} /></div>
                  <span className="num text-right text-white"><Tw value={r.after} fmt={fmt} dur={1100} /></span>
                </div>
                {r.note && <div className="mt-1 text-[10.5px] text-[#6d7a91]">{r.note}</div>}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" autoFocus onClick={onAdvance} className="flex-1 rounded-xl py-2.5 text-[14px] font-semibold text-[#04111a]" style={{ background: "linear-gradient(90deg,#1fa89b,#2ee6c9)" }}>▶ Advance time and watch</button>
          <button type="button" onClick={onClose} className="rounded-xl border border-[#2b3b5c] px-4 text-[13px] text-[#cfd8e6] hover:text-white">Stay here</button>
        </div>
      </div>
    </Shell>
  );
}

// ---- Event deck -------------------------------------------------------------------------
export function Deck({ onClose, onPlay, loc }) {
  const keys = Object.keys(EVENT_TYPES).filter((k) => k !== "hormuz2026");
  return (
    <Shell onClose={onClose} wide label="Event deck">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="hud-label text-[11px] text-[#8b98ae]">SANDBOX</div>
            <h2 className="display text-[24px] font-semibold text-white">Event deck</h2>
            <p className="mt-1 max-w-2xl text-[13px] text-[#cfd8e6]">Play any event now and see how {loc.name} copes. Every card lists the exact model variables it changes. Historical cards replay real EIA monthly Brent moves; the rest are hypothetical.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-[#2b3b5c] px-3 py-1 text-[12px] text-[#cfd8e6] hover:text-white">Close</button>
        </div>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {keys.map((k) => {
            const T = EVENT_TYPES[k];
            const sample = T.make({ siteId: loc.id });
            return (
              <div key={k} className="flex flex-col rounded-xl border border-[#22314f] bg-[#0b1426] p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="hud-label rounded-full border border-[#2b3b5c] px-2 py-[1px] text-[10px] text-[#cfd8e6]">{T.type === "temporary" ? "TEMPORARY" : "STRUCTURAL"}</span>
                  <span className="hud-label text-[10px] text-[#8b98ae]">{TIER_LABEL[T.tier]}</span>
                </div>
                <div className="display mt-1.5 text-[16px] font-semibold text-white"><span className="mr-1.5" aria-hidden="true">{T.icon}</span>{T.title}</div>
                <p className="mt-0.5 text-[12px] leading-snug text-[#a7b2c5]">{T.blurb}</p>
                <ul className="mt-1.5 flex-1 space-y-0.5 text-[11.5px] text-[#cfd8e6]">{T.effects(sample).map((l) => <li key={l}>› {l}</li>)}</ul>
                <button type="button" onClick={() => onPlay(k)} className="mt-2 rounded-lg border border-[#2b3b5c] py-1.5 text-[12.5px] font-medium text-white hover:border-[#2ee6c9aa]">Play this event now</button>
              </div>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}

// ---- Decade review ----------------------------------------------------------------------
export function Review({ sites, decisions, G, onClose, onRestart, month }) {
  const played = sites.filter((s) => decisions[s.id]);
  const list = played.length ? played : sites.slice(0, 1);
  const rows = list.map((loc) => {
    const d = decisions[loc.id];
    const L = ledger(loc, d, G, month);
    let cost = 0, cf = 0, out = 0, outCf = 0, fuel = 0, fuelCf = 0;
    for (const r of L.rows) { cost += r.cost; cf += r.cfCost; out += (1 - r.served) * 30.44; outCf += (1 - r.cfServed) * 30.44; fuel += r.fuelL; fuelCf += r.cfFuelL; }
    const mtm = markToMarket(loc, d, G);
    // what-if: the two build options taken on day one, under the same events
    const alts = (!d || d.option === "diesel" || d.month > 0) ? ["hybrid", "solar"].filter((k) => !(d && d.option === k && d.month === 0)).map((k) => {
      const r0 = evaluateOption(loc, k, 0, G, { withMC: false });
      const dd = { option: k, month: 0, lead: Math.round(r0.dep.mid), capex: r0.core.capex };
      const LA = ledger(loc, dd, G, month);
      let c = 0, o = 0;
      for (const rr of LA.rows) { c += rr.cost; o += (1 - rr.served) * 30.44; }
      return { k, saved: cf - c, out: o, npv: markToMarket(loc, { ...dd, npvAtDecision: r0.core.npv }, G).npv };
    }) : [];
    return { loc, d, cost, cf, out, outCf, fuel, fuelCf, mtm, re: L.rows[month].re, alts };
  });
  return (
    <Shell onClose={onClose} wide label="Decade review">
      <div className="p-5">
        <div className="hud-label text-[11px] text-[#8b98ae]">{month >= GAME_MONTHS ? "THE DECADE IS OVER" : `REVIEW AT ${monthDate(month).toUpperCase()}`}</div>
        <h2 className="display text-[28px] font-semibold text-white">How your strategy played out</h2>
        <p className="mt-1 text-[13px] text-[#cfd8e6]">Compared with what would have happened if each island had simply kept diesel, under exactly the same events.</p>
        <div className="mt-4 space-y-3">
          {rows.map((r) => {
            const O = r.d ? OPTIONS[r.d.option] : OPTIONS.diesel;
            return (
              <div key={r.loc.id} className="rounded-xl border border-[#22314f] bg-[#0b1426] p-3" style={{ boxShadow: `inset 3px 0 0 ${O.glow}` }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="display text-[18px] font-semibold text-white">{r.loc.name} <span className="text-[13px] font-normal text-[#8b98ae]">· {r.d ? O.title : "No decision"}</span></div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Score label="Affordability" main={Math.abs(r.cf - r.cost) < 1 ? "baseline" : r.cf - r.cost > 0 ? `${money(r.cf - r.cost)} saved` : `${money(r.cost - r.cf)} extra`} sub={`total power cost ${money(r.cost)} vs ${money(r.cf)} on diesel`} good={Math.abs(r.cf - r.cost) < 1 ? null : r.cf - r.cost > 0} />
                  <Score label="Reliability" main={`${r.out.toFixed(1)} days short`} sub={`diesel-only: ${r.outCf.toFixed(1)} days of shortfall`} good={r.mtm ? r.out <= r.outCf : r.out > 0.05 ? false : null} />
                  <Score label="Independence" main={`${Math.round(r.re * 100)}% local power`} sub={`${((r.fuelCf - r.fuel) / 1e6).toFixed(1)} million litres of imports avoided`} good={r.re > 0 ? true : null} />
                  <Score label="Financial return" main={r.mtm ? money(r.mtm.npv) : "$0"} sub={r.mtm ? `NPV today vs ${money(r.d.npvAtDecision)} when decided` : "no investment"} good={r.mtm ? r.mtm.npv >= 0 : null} />
                </div>
                {r.alts.length > 0 && (
                  <div className="mt-2 rounded-lg border border-dashed border-[#2b3b5c] px-2.5 py-2 text-[12px] text-[#cfd8e6]">
                    <span className="hud-label mr-2 text-[10.5px] text-[#8b98ae]">ROADS NOT TAKEN</span>
                    {r.alts.map((a) => (
                      <span key={a.k} className="mr-4 inline-block">Building <b style={{ color: OPTIONS[a.k].glow }}>{OPTIONS[a.k].short.toLowerCase()}</b> in Nov 2026: <span className="num">{a.saved >= 0 ? `${money(a.saved)} saved` : `${money(-a.saved)} extra`}</span> to date, <span className="num">{a.out.toFixed(1)}</span> days short, NPV <span className="num">{money(a.npv)}</span>.</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-[#6d7a91]">Shortfall days are equivalent full days of unserved demand from fuel stock-outs. NPV covers each project's full 25-year life using what is known at this point; costs to date are realised under the events you experienced.</p>
        <div className="mt-4 flex gap-2">
          {month < GAME_MONTHS && <button type="button" onClick={onClose} className="rounded-xl border border-[#2b3b5c] px-4 py-2 text-[13px] text-[#cfd8e6] hover:text-white">Keep playing</button>}
          <button type="button" onClick={onRestart} className="rounded-xl px-4 py-2 text-[13px] font-semibold text-[#04111a]" style={{ background: "linear-gradient(90deg,#1fa89b,#2ee6c9)" }}>Play again with different choices</button>
        </div>
      </div>
    </Shell>
  );
}
const Score = ({ label, main, sub, good }) => (
  <div className="rounded-lg bg-[#0e1a31] p-2">
    <div className="text-[10.5px] text-[#8b98ae]">{label}</div>
    <div className="num text-[14px]" style={{ color: good == null ? "#e8edf5" : good ? "#9ff3e4" : "#ffb4a2" }}>{main}</div>
    <div className="text-[10.5px] leading-snug text-[#6d7a91]">{sub}</div>
  </div>
);
