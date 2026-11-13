import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { COUNTRY_FEATURES as ALL } from "../MapView";
import { ROUTES, BYPASS, CHOKEPOINTS, HORMUZ } from "../../data/routes";
import { pvoutScale, exposureScale, bivarColor, NO_DATA, TEAL_RAMP, AMBER_RAMP, BIVAR } from "../scales";
import { OPTIONS } from "../../game/engine";

const LAND = "#13203a";

const Countries = memo(function Countries({ paths, fills, onHover, onLeave }) {
  return (
    <g>
      {paths.map((p) => (
        <path key={p.name + p.i} d={p.d} className="country" fill={fills[p.name] || LAND} stroke="#22314f" strokeWidth={0.5} vectorEffect="non-scaling-stroke"
          onMouseMove={(e) => onHover(e, p.name)} onMouseLeave={onLeave} />
      ))}
    </g>
  );
});

export default function GameMap({ sites, selectedId, onSelect, onPlaceCustom, custom, disruption, blockade, layer, setLayer, countryVals, insets, pings, flyKey }) {
  const wrapRef = useRef(null), svgRef = useRef(null), zoomRef = useRef(null);
  const [size, setSize] = useState({ w: 1200, h: 700 });
  const [t, setT] = useState(d3.zoomIdentity);
  const [hover, setHover] = useState(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => { const { width, height } = e.contentRect; if (width > 50 && height > 50) setSize({ w: Math.round(width), h: Math.round(height) }); });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const inner = useMemo(() => ({ x0: insets.left, y0: insets.top, x1: size.w - insets.right, y1: size.h - insets.bottom }), [insets, size]);
  const projection = useMemo(() => {
    const iw = Math.max(200, inner.x1 - inner.x0), ih = Math.max(200, inner.y1 - inner.y0);
    const sphere = { type: "Sphere" };
    const pw = d3.geoNaturalEarth1().rotate([-80, 0]).fitWidth(iw * 1.05, sphere).scale();
    const band = d3.geoNaturalEarth1().rotate([-80, 0]).fitExtent([[0, 0], [iw, ih]], { type: "MultiPoint", coordinates: [[80, 62], [80, -42]] }).scale();
    return d3.geoNaturalEarth1().rotate([-80, 0]).center([0, 8]).scale(Math.max(pw, Math.min(band, pw * 1.7))).translate([(inner.x0 + inner.x1) / 2, (inner.y0 + inner.y1) / 2]).precision(0.3);
  }, [inner]);
  const geoPath = useMemo(() => d3.geoPath(projection), [projection]);
  const paths = useMemo(() => ALL.map((f, i) => ({ name: f.properties.name, d: geoPath(f), i })), [geoPath]);
  const sphere = useMemo(() => geoPath({ type: "Sphere" }), [geoPath]);
  const graticule = useMemo(() => geoPath(d3.geoGraticule10()), [geoPath]);
  const routePaths = useMemo(() => ROUTES.map((r) => ({ ...r, d: geoPath({ type: "LineString", coordinates: r.pts }) })), [geoPath]);
  const bypassPaths = useMemo(() => BYPASS.map((r) => ({ ...r, d: geoPath({ type: "LineString", coordinates: r.pts }) })), [geoPath]);

  useEffect(() => {
    const z = d3.zoom().scaleExtent([0.8, 14]).clickDistance(4)
      .filter((ev) => {
        if (ev.target?.closest?.("[data-nozoom]")) return false;
        if (ev.type === "wheel") return ev.ctrlKey || ev.metaKey;
        return !ev.button && !ev.ctrlKey;
      })
      .on("zoom", (ev) => setT(ev.transform));
    d3.select(svgRef.current).call(z).on("dblclick.zoom", null);
    zoomRef.current = z;
  }, [size.w, size.h]);

  const flyTo = useCallback((lon, lat, k) => {
    const p = projection([lon, lat]);
    if (!p || !zoomRef.current) return;
    const cx = (inner.x0 + inner.x1) / 2, cy = (inner.y0 + inner.y1) / 2;
    d3.select(svgRef.current).transition().duration(1100).ease(d3.easeCubicInOut).call(zoomRef.current.transform, d3.zoomIdentity.translate(cx, cy).scale(k).translate(-p[0], -p[1]));
  }, [projection, inner]);

  const sel = sites.find((s) => s.id === selectedId);
  useEffect(() => {
    if (flyKey && sel) {
      // keep the Strait in frame for Indian Ocean sites; centre far sites on themselves
      const near = d3.geoDistance([sel.lon, sel.lat], [HORMUZ.lon, HORMUZ.lat]) < 0.75;
      const c = near ? d3.geoInterpolate([sel.lon, sel.lat], [HORMUZ.lon, HORMUZ.lat])(0.45) : [sel.lon, sel.lat];
      flyTo(c[0], c[1], near ? 1.45 : 2.1);
    }
    else if (!flyKey && zoomRef.current) d3.select(svgRef.current).transition().duration(800).call(zoomRef.current.transform, d3.zoomIdentity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyKey]);

  const screen = useCallback((lon, lat) => { const p = projection([lon, lat]); return p ? [t.applyX(p[0]), t.applyY(p[1])] : [-99, -99]; }, [projection, t]);
  const toLonLat = (evt) => { const [mx, my] = d3.pointer(evt, svgRef.current); return projection.invert(t.invert([mx, my])); };

  const onHover = useCallback((e, name) => { const r = wrapRef.current.getBoundingClientRect(); setHover({ kind: "country", name, x: e.clientX - r.left, y: e.clientY - r.top }); }, []);
  const onLeave = useCallback(() => setHover(null), []);

  const fills = useMemo(() => {
    const out = {};
    for (const [name, v] of Object.entries(countryVals)) {
      if (layer === "sun") out[name] = v.pvout ? pvoutScale(v.pvout) : LAND;
      else if (layer === "risk") out[name] = v.exposure != null ? exposureScale(v.exposure) : v.producer ? "#3a2a14" : LAND;
      else out[name] = (v.exposure != null && v.advantage != null && bivarColor(v.exposure, v.advantage)) || LAND;
    }
    return out;
  }, [countryVals, layer]);

  const hz = screen(HORMUZ.lon, HORMUZ.lat);
  const routeCol = blockade ? "#ff7a5c" : "#f0b45a";
  const flowOp = 0.3 + 0.65 * (1 - disruption);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 48%, #0c1a33 0%, #070e1c 60%, #050a14 100%)" }}>
      <svg ref={svgRef} width={size.w} height={size.h} style={{ display: "block", cursor: "crosshair", touchAction: "none" }}
        onClick={(e) => { if (e.target.closest("[data-nozoom]")) return; const ll = toLonLat(e.nativeEvent); if (ll && isFinite(ll[0])) onPlaceCustom(ll); }}
        role="img" aria-label="World map: shipping routes from the Strait of Hormuz and playable island sites">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="bigglow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6" /></filter>
          <radialGradient id="hzCore"><stop offset="0%" stopColor="#ffb347" stopOpacity="0.9" /><stop offset="60%" stopColor="#ff8a3d" stopOpacity="0.25" /><stop offset="100%" stopColor="#ff8a3d" stopOpacity="0" /></radialGradient>
          <radialGradient id="vignette" cx="50%" cy="50%" r="70%"><stop offset="60%" stopColor="#000" stopOpacity="0" /><stop offset="100%" stopColor="#000" stopOpacity="0.55" /></radialGradient>
        </defs>
        <g transform={t.toString()}>
          <path d={sphere} fill="#081428" stroke="#1a2846" vectorEffect="non-scaling-stroke" />
          <path d={graticule} fill="none" stroke="#10203c" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
          <Countries paths={paths} fills={fills} onHover={onHover} onLeave={onLeave} />
          <g filter="url(#glow)" pointerEvents="none">
            {routePaths.map((r) => (
              <g key={r.id}>
                <path d={r.d} fill="none" stroke={r.kind === "lng" ? "#7aa2ff" : routeCol} strokeOpacity={0.14 * flowOp + 0.04} strokeWidth={r.weight * 2 + 3} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                <path d={r.d} fill="none" stroke={r.kind === "lng" ? "#a9c2ff" : routeCol} strokeOpacity={flowOp} strokeWidth={Math.max(1, r.weight * 0.5)} vectorEffect="non-scaling-stroke" className="route-flow" strokeLinecap="round" style={{ animationDuration: `${1.1 + 4 * disruption}s` }} />
              </g>
            ))}
          </g>
          {bypassPaths.map((r) => <path key={r.id} d={r.d} fill="none" stroke="#e8edf5" strokeOpacity={0.6} strokeWidth={1.3} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" pointerEvents="none" />)}
        </g>
        <rect width={size.w} height={size.h} fill="url(#vignette)" pointerEvents="none" />

        <g pointerEvents="none">
          {CHOKEPOINTS.map((c) => { const [x, y] = screen(c.lon, c.lat); return <rect key={c.id} x={x - 3} y={y - 3} width={6} height={6} transform={`rotate(45 ${x} ${y})`} fill="#070e1c" stroke="#8796ad" strokeWidth={1} />; })}
          <g transform={`translate(${hz[0]},${hz[1]})`}>
            <circle r={34 + 46 * disruption} fill="url(#hzCore)" opacity={0.35 + 0.65 * disruption} />
            {[0, 0.7, 1.4].map((d) => <circle key={d} r={12} fill="none" stroke={blockade ? "#ff7a5c" : "#ffb347"} strokeWidth={1.5} className="pulse" style={{ animationDelay: `${d}s`, opacity: disruption > 0 ? 1 : 0.25 }} />)}
            <circle r={5} fill={disruption > 0 ? (blockade ? "#ff7a5c" : "#ffb347") : "#2ee6c9"} stroke="#070e1c" strokeWidth={2} />
            <text x={-12} y={-16} textAnchor="end" className="hud-label" fontSize={11} fill="#ffd59a">STRAIT OF HORMUZ</text>
            <text x={-12} y={-3} textAnchor="end" fontSize={10.5} fill="#e8edf5" fontFamily="IBM Plex Mono, monospace">{disruption > 0 ? `${Math.round(disruption * 100)}% disrupted` : "open"}</text>
          </g>
          {pings.map((p) => { const [x, y] = screen(p.lon, p.lat); return (
            <g key={p.key} transform={`translate(${x},${y})`}>
              <circle r={10} fill="none" stroke={p.color} strokeWidth={2} className="ping" />
              <circle r={10} fill="none" stroke={p.color} strokeWidth={1.5} className="ping" style={{ animationDelay: "0.5s" }} />
            </g>); })}
        </g>

        <g>
          {sites.map((s) => {
            const [x, y] = screen(s.lon, s.lat);
            const isSel = s.id === selectedId;
            const col = s.status === "solar" ? OPTIONS.solar.glow : s.status === "hybrid" ? OPTIONS.hybrid.glow : s.status === "building" ? "#2ee6c9" : "#ffb347";
            const r = isSel ? 7 : 5;
            return (
              <g key={s.id} data-nozoom transform={`translate(${x},${y})`} style={{ cursor: s.id === "custom" ? (drag ? "grabbing" : "grab") : "pointer" }}
                onClick={(e) => { e.stopPropagation(); onSelect(s.id); }}
                onPointerDown={s.id === "custom" ? (e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); } : undefined}
                onPointerMove={s.id === "custom" ? (e) => { if (!drag) return; const ll = toLonLat(e.nativeEvent); if (ll && isFinite(ll[0])) onPlaceCustom(ll); } : undefined}
                onPointerUp={s.id === "custom" ? () => setDrag(false) : undefined}
                onMouseMove={(e) => { const rr = wrapRef.current.getBoundingClientRect(); setHover({ kind: "site", s, x: e.clientX - rr.left, y: e.clientY - rr.top }); }}
                onMouseLeave={onLeave}
                role="button" tabIndex={0} aria-label={`${s.name}, ${s.region}`} onKeyDown={(e) => { if (e.key === "Enter") onSelect(s.id); }}>
                <circle r={16} fill="transparent" />
                <circle r={r + 8} fill={col} opacity={0.22} filter="url(#bigglow)" className={s.status === "diesel" || s.status === "undecided" ? "ember" : ""} />
                {isSel && <circle r={r + 6} fill="none" stroke="#e8edf5" strokeWidth={1.3} />}
                {s.status === "building" ? (
                  <>
                    <circle r={r} fill="#0a1426" stroke="#2ee6c9" strokeWidth={1.5} strokeOpacity={0.35} />
                    <path d={d3.arc()({ innerRadius: r - 1, outerRadius: r + 1.5, startAngle: 0, endAngle: 2 * Math.PI * Math.max(0.04, s.progress) })} fill="#2ee6c9" />
                  </>
                ) : (
                  <circle r={r} fill={col} stroke="#070e1c" strokeWidth={2} />
                )}
                {(s.status === "solar" || s.status === "hybrid") && <g stroke="#070e1c" strokeWidth={1.2}>{[0, 60, 120].map((a) => <line key={a} x1={-r * 0.55} x2={r * 0.55} transform={`rotate(${a})`} />)}</g>}
                {s.id === "custom" && <text x={0} y={-r - 8} textAnchor="middle" fontSize={9} className="hud-label" fill="#e8edf5">OUTPOST</text>}
                {(isSel || t.k > 2.4) && (
                  <text x={r + 8} y={4} fontSize={isSel ? 12.5 : 11} className="hud-label" fill="#f1f5fb" paintOrder="stroke" stroke="#050a14" strokeWidth={3.5}>{s.name}</text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute flex items-center gap-1 rounded-full border border-[#2b3b5c] bg-[#0a1426d9] p-1 backdrop-blur" style={{ left: insets.left + 10, top: insets.top + 6 }}>
        {[["risk", "Supply risk"], ["sun", "Sunlight"], ["opportunity", "Opportunity"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setLayer(k)} className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition ${layer === k ? "bg-[#1b2a48] text-white" : "text-[#8b98ae] hover:text-[#cfd8e6]"}`}>{l}</button>
        ))}
      </div>
      <MapLegend layer={layer} style={{ left: insets.left + 10, top: insets.top + 50 }} />
      <div className="absolute flex flex-col gap-1" style={{ right: insets.right + 10, bottom: insets.bottom + 10 }}>
        {[["+", 1.6], ["−", 1 / 1.6]].map(([l, k]) => <button key={l} type="button" aria-label={l === "+" ? "Zoom in" : "Zoom out"} onClick={() => d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, k)} className="h-8 w-8 rounded-full border border-[#2b3b5c] bg-[#0a1426d9] text-[15px] text-[#cfd8e6] hover:text-white">{l}</button>)}
        <button type="button" aria-label="Reset view" onClick={() => d3.select(svgRef.current).transition().duration(600).call(zoomRef.current.transform, d3.zoomIdentity)} className="h-8 w-8 rounded-full border border-[#2b3b5c] bg-[#0a1426d9] text-[13px] text-[#cfd8e6] hover:text-white">⟲</button>
      </div>

      {hover && (
        <div className="tip text-[11.5px]" style={{ left: Math.min(hover.x + 14, size.w - 260), top: Math.min(hover.y + 12, size.h - 120) }}>
          {hover.kind === "site" ? (
            <div>
              <div className="hud-label text-[13px] text-white">{hover.s.name}</div>
              <div className="text-[#8b98ae]">{hover.s.region}</div>
              <div className="mt-1 text-[#cfd8e6]">{hover.s.statusLabel}</div>
              <div className="mt-0.5 text-[10.5px] text-[#8b98ae]">Click to play this island</div>
            </div>
          ) : (
            <CountryTip name={hover.name} v={countryVals[hover.name]} />
          )}
        </div>
      )}
    </div>
  );
}

function CountryTip({ name, v }) {
  return (
    <div>
      <div className="hud-label text-[13px] text-white">{name}</div>
      {!v || (!v.pvout && !v.producer) ? <div className="text-[#8b98ae]">No reference data</div> : (
        <>
          {v.producer && <div className="text-[#ffd59a]">Gulf producer: exposed through exports</div>}
          {v.exposure != null && <div className="text-[#cfd8e6]">Hormuz supply risk <span className="num text-white">{Math.round(v.exposure * 100)}%</span></div>}
          {v.pvout && <div className="text-[#cfd8e6]">Sunlight <span className="num text-white">{v.pvout.toLocaleString()} kWh/kWp</span></div>}
          <div className="mt-0.5 text-[10.5px] text-[#8b98ae]">Indicative values · click to found an outpost here</div>
        </>
      )}
    </div>
  );
}

function MapLegend({ layer, style }) {
  const box = "absolute rounded-xl border border-[#22314f] bg-[#0a1426d9] px-3 py-2 backdrop-blur";
  if (layer === "opportunity") return (
    <div className={box} style={style}>
      <div className="hud-label mb-1 text-[10.5px] text-[#8b98ae]">WHERE ECONOMICS MEETS SECURITY</div>
      <div className="flex items-center gap-2">
        <div>{[2, 1, 0].map((r) => <div key={r} className="flex">{[0, 1, 2].map((c) => <span key={c} className="m-[1px] h-3 w-3 rounded-[2px]" style={{ background: BIVAR[r][c] }} />)}</div>)}</div>
        <div className="text-[10.5px] leading-tight text-[#8b98ae]">↑ supply risk<br />→ solar advantage<br /><span className="text-[#f0cf6a]">gold = both high</span></div>
      </div>
    </div>
  );
  const cols = layer === "sun" ? TEAL_RAMP : AMBER_RAMP;
  return (
    <div className={box} style={style}>
      <div className="hud-label mb-1 text-[10.5px] text-[#8b98ae]">{layer === "sun" ? "SUNLIGHT · PV YIELD" : "HORMUZ SUPPLY RISK"}</div>
      <div className="flex">{cols.map((c) => <span key={c} className="h-1.5 w-6 first:rounded-l last:rounded-r" style={{ background: c }} />)}</div>
      <div className="num mt-0.5 flex justify-between text-[9.5px] text-[#6d7a91]"><span>{layer === "sun" ? "1,000" : "low"}</span><span>{layer === "sun" ? "1,900 kWh/kWp" : "high"}</span></div>
    </div>
  );
}
