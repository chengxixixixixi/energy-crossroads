import React, { useCallback, useDeferredValue, useMemo, useState } from "react";
import MapView, { lookupCountry } from "./components/MapView";
import ScenarioPanel from "./components/ScenarioPanel";
import Monitor from "./components/Monitor";
import Dashboard, { summaryText, breakEvenText, verdict } from "./components/Dashboard";
import Compare from "./components/Compare";
import Methodology from "./components/Methodology";
import SiteEditor from "./components/SiteEditor";
import { Btn, Tag, fmtMoney, fmtNum, fmtPct } from "./components/ui";
import { LOCATIONS, USE_CASES } from "./data/locations";
import { COUNTRIES, exposureIndex } from "./data/countries";
import { COSTS, TECH, SIZING, PRESETS, BASE_SCENARIO, EPISODES } from "./data/defaults";
import { BRENT_MONTHLY, BRENT_MONTHLY_DATES } from "./data/history";
import { SNAPSHOT_RETRIEVED, SOURCES } from "./data/snapshot";
import { buildScenarioPath, buildReplayPath, evaluateLocation, evaluateCore, deployMonths, levelizedPrices, screeningAdvantage, dieselPrice } from "./model/finance";
import { runSims } from "./model/dispatch";

const estimatePvout = (lat) => Math.round(Math.max(900, Math.min(1900, 1850 - 12 * Math.max(0, Math.abs(lat) - 18))) / 10) * 10;

function makeCustom([lon, lat], prev) {
  const hit = lookupCountry([lon, lat]);
  const c = COUNTRIES[hit.name];
  const base = {
    id: "custom", useCase: prev?.useCase || "island", avgMW: prev?.avgMW || 5, margin: 0.08, tax: 0, storageDays: 30,
    tariff: 120, tariffLink: 0.3, gridFuel: "lng", outageHours: 100, heatRate: 7, regas: 1, windCF: 0, switchShare: 0.3, exportCredit: 0,
  };
  return {
    ...base,
    name: "Custom site",
    region: `${hit.inside ? hit.name : `Open water near ${hit.name}`} · ${lat.toFixed(2)}°, ${lon.toFixed(2)}°`,
    country: hit.name,
    lat, lon,
    pvout: c?.pvout ?? estimatePvout(lat),
    pvoutTier: c?.pvout ? "illustrative" : "estimated",
    hzOil: c ? (c.role === "producer" ? 0.05 : c.hzOil) : 0.3,
    hzLng: c?.hzLng ?? 0,
    logistics: c ? c.logi + (hit.inside ? 0.05 : 0.15) : 0.3,
    note: c ? `Parameters inherited from the ${hit.name} reference layer (illustrative). Edit them below.` : "No country reference data: PV yield estimated from latitude. Edit below.",
  };
}

export default function App() {
  const [mode, setModeRaw] = useState("live");
  const [sc, setSc] = useState(BASE_SCENARIO);
  const [preset, setPreset] = useState("snapshot");
  const [costs, setCosts] = useState(COSTS);
  const [tech, setTech] = useState(TECH);
  const [sizingOv, setSizingOv] = useState({});
  const [locEdits, setLocEdits] = useState({});
  const [custom, setCustom] = useState(null);
  const [activeId, setActiveId] = useState("mv-addu");
  const [compareIds, setCompareIds] = useState(["mv-addu", "cv-saovicente", "pk-rlng"]);
  const [layer, setLayer] = useState("nexus");
  const [timing, setTiming] = useState("reactive");
  const [episode, setEpisode] = useState("hormuz2026");
  const [replayRatio, setReplayRatio] = useState(true);
  const [replayIdx, setReplayIdx] = useState(0);
  const [optimizing, setOptimizing] = useState(false);
  const [copied, setCopied] = useState("");

  const setScUser = useCallback((f) => { setPreset(null); setSc(f); }, []);
  const applyPreset = useCallback((k) => { setPreset(k); setSc((s) => ({ ...s, ...PRESETS[k].sc })); }, []);
  const setMode = (m) => {
    setModeRaw(m);
    if (m === "live") applyPreset("snapshot");
  };

  const locations = useMemo(() => {
    const list = LOCATIONS.map((l) => (locEdits[l.id] ? { ...l, ...locEdits[l.id] } : l));
    if (custom) list.push({ ...custom, ...(locEdits.custom || {}) });
    return list;
  }, [locEdits, custom]);
  const byId = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l])), [locations]);
  const activeLoc = byId[activeId] || locations[0];

  const dsc = useDeferredValue(sc);
  const dcosts = useDeferredValue(costs);
  const dtech = useDeferredValue(tech);

  const path = useMemo(() => {
    if (mode === "replay") {
      const ep = EPISODES.find((e) => e.id === episode);
      const a = BRENT_MONTHLY_DATES.indexOf(ep.start), b = BRENT_MONTHLY_DATES.indexOf(ep.end);
      return buildReplayPath(dsc, BRENT_MONTHLY.slice(a, b + 1), replayRatio);
    }
    return buildScenarioPath(dsc);
  }, [dsc, mode, episode, replayRatio]);

  const sizingFor = useCallback((l) => {
    const s = sizingOv[l.id] || SIZING[l.useCase];
    return l.maxPvRatio != null ? { ...s, pvRatio: Math.min(s.pvRatio, l.maxPvRatio) } : s;
  }, [sizingOv]);
  const ctx = useMemo(() => ({ sc: dsc, path, costsFor: (l) => dcosts[l.useCase], sizingFor, tech: dtech, timing }), [dsc, path, dcosts, sizingFor, dtech, timing]);

  const pointResults = useMemo(() => locations.map((l) => {
    const r = evaluateLocation(l, ctx);
    return {
      id: l.id, name: l.name, region: l.region, lat: l.lat, lon: l.lon, useCase: l.useCase, useCaseLabel: USE_CASES[l.useCase].short,
      pvout: l.pvout, exposure: l.useCase === "lng" ? l.hzLng : l.hzOil,
      gap: r.lcoe.baseTotal - r.lcoe.hybTotal, lcoeBase: r.lcoe.baseTotal, lcoeHyb: r.lcoe.hybTotal, npvLabel: fmtMoney(r.core.npv),
    };
  }), [locations, ctx]);

  const countryVals = useMemo(() => {
    const lev = levelizedPrices(path, dcosts.island.wacc, dcosts.island.life);
    const out = {};
    for (const [name, c] of Object.entries(COUNTRIES)) {
      const s = screeningAdvantage(c, dsc, dcosts.island, lev);
      out[name] = { pvout: c.pvout, exposure: exposureIndex(c), producer: c.role === "producer", advantage: s?.advantage ?? null };
    }
    return out;
  }, [path, dsc, dcosts]);

  const active = useMemo(() => evaluateLocation(activeLoc, ctx, { withMC: true, withSens: true }), [activeLoc, ctx]);
  const compareResults = useMemo(() => compareIds.filter((id) => byId[id]).map((id) => (id === activeLoc.id ? active : evaluateLocation(byId[id], ctx, { withMC: true }))), [compareIds, byId, ctx, active, activeLoc.id]);

  const toggleCompare = useCallback((id) => {
    setCompareIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(-3)));
  }, []);
  const onPlaceCustom = useCallback((ll) => {
    setCustom((prev) => makeCustom(ll, prev));
    setActiveId("custom");
  }, []);

  const optimize = () => {
    setOptimizing(true);
    setTimeout(() => {
      const l = activeLoc;
      const c = costs[l.useCase];
      const base = sizingFor(l);
      const maxPv = l.maxPvRatio ?? 6;
      let best = null;
      const pvs = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6].filter((x) => x <= maxPv + 1e-9);
      for (const pv of pvs) for (const bh of [0, 1, 2, 3, 4, 6, 8, 10]) {
        const sz = { ...base, pvRatio: pv, battHours: bh };
        const sims = runSims(l, sz, tech);
        const dep = deployMonths(l, sz, c, sc);
        const npv = evaluateCore(l, sims, sc, c, path, timing, dep.mid).npv;
        if (!best || npv > best.npv) best = { npv, sz };
      }
      setSizingOv((o) => ({ ...o, [l.id]: best.sz }));
      setOptimizing(false);
    }, 30);
  };

  const dieselNow = dieselPrice(activeLoc, sc, path, 0);

  // ---- exports -------------------------------------------------------------------
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); } catch (_) { setCopied("blocked"); }
    setTimeout(() => setCopied(""), 1800);
  };
  const summaryMd = () => {
    const r = active;
    const lines = [
      `# Hormuz to Home · scenario summary`,
      `Generated ${new Date().toISOString().slice(0, 10)} · market snapshot retrieved ${SNAPSHOT_RETRIEVED} (not live) · mode: ${mode}${mode === "replay" ? ` (${EPISODES.find((e) => e.id === episode).label}, ${replayRatio ? "% moves" : "nominal $"})` : ""}`,
      ``,
      `## Scenario (hypothetical inputs)`,
      `- Hormuz disruption ${Math.round(sc.disruption * 100)}% for ${Math.round(sc.durationDays)} days, normalisation ${sc.normalizeMonths} months`,
      `- Brent: shock $${sc.brentShock}/bbl, long-run $${sc.brentLR}/bbl · gasoil crack: shock $${sc.crackShock}/bbl, long-run $${sc.crackLR}/bbl`,
      `- LNG: shock $${sc.lngShock}/MMBtu, long-run $${sc.lngLR}/MMBtu · war-risk surcharge $${sc.freightSurcharge}/L · logistics ×${sc.logisticsMult}`,
      `- Volatility ${Math.round(sc.volatility * 100)}%/yr · repeat disruption ${Math.round(sc.recurProb * 100)}%/yr · market substitution ${Math.round(sc.substitution * 100)}% · VoLL $${sc.voll}/MWh · timing: ${timing}`,
      ``,
      `## ${r.loc.name}, ${r.loc.region} (${USE_CASES[r.loc.useCase].label})`,
      summaryText(r, sc),
      ``,
      `| Metric | Value |`, `|---|---|`,
      `| Verdict | ${verdict(r).label} |`,
      `| Baseline cost (no shock) | $${fmtNum(r.lcoeFlat.baseTotal)}/MWh |`,
      `| Fossil-only LCOE on this scenario | $${fmtNum(r.lcoe.baseTotal)}/MWh |`,
      `| Hybrid LCOE | $${fmtNum(r.lcoe.hybTotal)}/MWh |`,
      `| Incremental NPV | ${fmtMoney(r.core.npv)} (P10 ${fmtMoney(r.mc.p10)}, P90 ${fmtMoney(r.mc.p90)}) |`,
      `| P(NPV>0) | ${fmtPct(r.mc.probPositive)} |`,
      `| Payback | ${r.core.payback ? r.core.payback.toFixed(1) + " yrs" : "> life"} |`,
      `| Break-even | ${breakEvenText(r, sc).main} |`,
      `| Renewable share | ${fmtPct(r.sims.hyb.reFraction)} |`,
      `| Deployment | ~${Math.round(r.dep.mid)} months |`,
      `| Value of being early | ${fmtMoney(r.valueOfEarly)} |`,
      ``,
      `## Comparison`,
      `| Site | NPV | NPV per $ | P(NPV>0) | Hybrid LCOE | Payback |`, `|---|---|---|---|---|---|`,
      ...compareResults.map((x) => `| ${x.loc.name} | ${fmtMoney(x.core.npv)} | ${(x.core.npv / x.core.capex).toFixed(2)} | ${fmtPct(x.mc.probPositive)} | $${fmtNum(x.lcoe.hybTotal)}/MWh | ${x.core.payback ? x.core.payback.toFixed(1) + " y" : "> life"} |`),
      ``,
      `All model outputs are calculated from the stated assumptions; site and country parameters are illustrative. Sources: ${Object.values(SOURCES).map((s) => s.label).join("; ")}.`,
    ];
    return lines.join("\n");
  };
  const cashCsv = () => {
    const r = active;
    return "month,base_cost_usd,hybrid_cost_usd,capex_usd,net_usd,discount_factor\n" + Array.from(r.core.net).map((n, m) => `${m},${r.core.baseCost[m].toFixed(0)},${r.core.hybCost[m].toFixed(0)},${r.core.capexFlow[m].toFixed(0)},${n.toFixed(0)},${r.core.df[m].toFixed(5)}`).join("\n");
  };

  const activeForMonitor = useMemo(() => ({ ...active, pathBrent: path.brent }), [active, path]);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#0a111ef2] px-4 py-2 backdrop-blur">
        <div className="flex items-baseline gap-3">
          <h1 className="font-cond text-[19px] font-bold tracking-[0.02em] text-ink">HORMUZ <span className="text-[#e8a33a]">→</span> HOME</h1>
          <span className="hidden text-[12px] text-ink3 md:inline">The geography of energy substitution: where renewable economics and energy security align</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="num mr-1 hidden items-center gap-1.5 text-[11px] text-ink3 lg:flex">Snapshot {SNAPSHOT_RETRIEVED}<Tag tier="observed" /></span>
          <Btn onClick={() => copy(summaryMd(), "md")}>{copied === "md" ? "Copied" : "Copy summary"}</Btn>
          <Btn onClick={() => copy(cashCsv(), "csv")}>{copied === "csv" ? "Copied" : "Copy cash flows"}</Btn>
          <Btn onClick={() => copy(JSON.stringify({ scenario: sc, costs, tech, timing, sizing: sizingOv, siteEdits: locEdits, custom }, null, 2), "json")}>{copied === "json" ? "Copied" : "Copy scenario JSON"}</Btn>
          <a href="#methodology" className="rounded-[3px] border border-line2 px-2 py-[3px] text-[11.5px] font-medium text-ink2 hover:text-ink">Methodology</a>
          {copied === "blocked" && <span className="text-[11px] text-[#f0a37a]">Clipboard blocked by the browser</span>}
        </div>
      </header>

      <main className="space-y-3 p-3">
        <div className="grid gap-3 xl:h-[680px] xl:grid-cols-[290px_minmax(0,1fr)_330px]">
          <aside className="panel order-2 overflow-hidden xl:order-1 xl:h-full" aria-label="Scenario controls">
            <ScenarioPanel sc={sc} setSc={setScUser} preset={preset} applyPreset={applyPreset} mode={mode} costs={costs} setCosts={setCosts} activeLoc={activeLoc} tech={tech} setTech={setTech} dieselNow={dieselNow} />
          </aside>
          <div className="panel order-1 h-[560px] overflow-hidden xl:order-2 xl:h-full">
            <MapView layer={layer} setLayer={setLayer} countryVals={countryVals} points={pointResults} activeId={activeLoc.id} compareIds={compareIds}
              onSelect={setActiveId} onToggleCompare={toggleCompare} onPlaceCustom={onPlaceCustom} disruption={sc.disruption} custom={custom} />
          </div>
          <aside className="panel order-3 overflow-hidden xl:h-full" aria-label="Hormuz risk monitor">
            <Monitor mode={mode} setMode={setMode} applyPreset={applyPreset} sc={sc} setSc={setScUser} episode={episode} setEpisode={setEpisode}
              replayRatio={replayRatio} setReplayRatio={setReplayRatio} replayIdx={replayIdx} setReplayIdx={setReplayIdx} active={activeForMonitor} />
          </aside>
        </div>

        <Dashboard r={active} sc={dsc} path={path} timing={timing} setTiming={setTiming}
          onCompare={() => toggleCompare(activeLoc.id)} inCompare={compareIds.includes(activeLoc.id)} onOptimize={optimize} optimizing={optimizing}
          editor={<SiteEditor loc={activeLoc} sizing={sizingFor(activeLoc)} isCustom={activeLoc.id === "custom"}
            onLoc={(patch) => setLocEdits((e) => ({ ...e, [activeLoc.id]: { ...(e[activeLoc.id] || {}), ...patch } }))}
            onSizing={(s) => setSizingOv((o) => ({ ...o, [activeLoc.id]: s }))}
            onReset={() => { setLocEdits((e) => { const n = { ...e }; delete n[activeLoc.id]; return n; }); setSizingOv((o) => { const n = { ...o }; delete n[activeLoc.id]; return n; }); }} />} />

        <Compare results={compareResults} sc={dsc} activeId={activeLoc.id} onOpen={setActiveId} onRemove={(id) => setCompareIds((ids) => ids.filter((x) => x !== id))} />
        <Methodology />
        <footer className="px-1 pb-4 text-[11px] text-ink3">Prototype research tool. Not investment advice. Model outputs depend entirely on the editable assumptions shown; country and site parameters are illustrative.</footer>
      </main>
    </div>
  );
}
