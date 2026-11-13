import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { feature } from "topojson-client";
import world from "world-atlas/countries-50m.json";
import { ROUTES, BYPASS, CHOKEPOINTS, HORMUZ } from "../data/routes";
import { COUNTRIES, exposureIndex } from "../data/countries";
import { pvoutScale, exposureScale, advantageScale, bivarColor, NO_DATA, TEAL_RAMP, AMBER_RAMP, DIVERGING, BIVAR } from "./scales";
import { Segmented, Tag, fmtNum } from "./ui";

const ALL = feature(world, world.objects.countries).features.filter((f) => f.properties.name !== "Antarctica");
export const COUNTRY_FEATURES = ALL;
const CENTROIDS = ALL.map((f) => ({ name: f.properties.name, c: d3.geoCentroid(f) }));

export function lookupCountry([lon, lat]) {
  const hit = ALL.find((f) => d3.geoContains(f, [lon, lat]));
  if (hit) return { name: hit.properties.name, inside: true };
  let best = null, bd = Infinity;
  for (const c of CENTROIDS) {
    const d = d3.geoDistance(c.c, [lon, lat]);
    if (d < bd) { bd = d; best = c.name; }
  }
  return { name: best, inside: false, distKm: bd * 6371 };
}

export const LAYERS = [
  { value: "renewable", label: "Renewable potential" },
  { value: "exposure", label: "Fossil exposure" },
  { value: "econ", label: "Substitution economics" },
  { value: "nexus", label: "Economics × security" },
];

const Countries = memo(function Countries({ paths, fills, hatch, onHover, onLeave }) {
  return (
    <g>
      {paths.map((p) => (
        <path
          key={p.name + p.i}
          d={p.d}
          className="country"
          fill={fills[p.name] || NO_DATA}
          stroke="#25324a"
          strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
          onMouseMove={(e) => onHover(e, p.name)}
          onMouseLeave={onLeave}
        />
      ))}
      {paths.filter((p) => hatch[p.name]).map((p) => (
        <path key={"h" + p.name + p.i} d={p.d} fill="url(#hatch)" stroke="none" pointerEvents="none" />
      ))}
    </g>
  );
});

export default function MapView({ layer, setLayer, countryVals, points, activeId, compareIds, onSelect, onToggleCompare, onPlaceCustom, disruption, custom }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const zoomRef = useRef(null);
  const [size, setSize] = useState({ w: 900, h: 520 });
  const [t, setT] = useState(d3.zoomIdentity);
  const [hover, setHover] = useState(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width > 50 && height > 50) setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const projection = useMemo(() => {
    // Fill the panel: take the larger of "whole world fits the width" and "the inhabited band
    // (50°S–72°N) fits the height". Sides may crop slightly on tall panels; the map pans.
    const sphere = { type: "Sphere" };
    const pw = d3.geoNaturalEarth1().rotate([-75, 0]).fitWidth(size.w - 12, sphere).scale();
    const band = d3.geoNaturalEarth1().rotate([-75, 0]).fitExtent([[0, 8], [size.w, size.h - 8]], { type: "MultiPoint", coordinates: [[75, 72], [75, -50]] }).scale();
    return d3.geoNaturalEarth1().rotate([-75, 0]).center([0, 11]).scale(Math.max(pw, Math.min(band, pw * 1.25))).translate([size.w / 2, size.h / 2]).precision(0.3);
  }, [size.w, size.h]);
  const geoPath = useMemo(() => d3.geoPath(projection), [projection]);
  const paths = useMemo(() => ALL.map((f, i) => ({ name: f.properties.name, d: geoPath(f), i })), [geoPath]);
  const sphere = useMemo(() => geoPath({ type: "Sphere" }), [geoPath]);
  const sphereBounds = useMemo(() => {
    const [[x0, y0], [x1, y1]] = geoPath.bounds({ type: "Sphere" });
    return [[Math.min(0, x0 - 20), Math.min(0, y0 - 20)], [Math.max(size.w, x1 + 20), Math.max(size.h, y1 + 20)]];
  }, [geoPath, size.w, size.h]);
  const graticule = useMemo(() => geoPath(d3.geoGraticule10()), [geoPath]);
  const routePaths = useMemo(() => ROUTES.map((r) => ({ ...r, d: geoPath({ type: "LineString", coordinates: r.pts }) })), [geoPath]);
  const bypassPaths = useMemo(() => BYPASS.map((r) => ({ ...r, d: geoPath({ type: "LineString", coordinates: r.pts }) })), [geoPath]);

  useEffect(() => {
    const z = d3
      .zoom()
      .scaleExtent([1, 12])
      .translateExtent(sphereBounds)
      .clickDistance(4)
      .filter((ev) => {
        if (ev.target?.closest?.("[data-nozoom]")) return false;
        if (ev.type === "wheel") return ev.ctrlKey || ev.metaKey;
        return !ev.button && !ev.ctrlKey;
      })
      .on("zoom", (ev) => setT(ev.transform));
    d3.select(svgRef.current).call(z).on("dblclick.zoom", null);
    zoomRef.current = z;
  }, [size.w, size.h, sphereBounds]);

  const zoomBy = (k) => d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, k);
  const zoomReset = () => d3.select(svgRef.current).transition().duration(400).call(zoomRef.current.transform, d3.zoomIdentity);
  const zoomTo = (lon, lat, k) => {
    const [x, y] = projection([lon, lat]);
    d3.select(svgRef.current).transition().duration(600).call(zoomRef.current.transform, d3.zoomIdentity.translate(size.w / 2, size.h / 2).scale(k).translate(-x, -y));
  };

  const toLonLat = (evt) => {
    const [mx, my] = d3.pointer(evt, svgRef.current);
    const [x, y] = t.invert([mx, my]);
    return projection.invert([x, y]);
  };

  const screen = useCallback(
    (lon, lat) => {
      const p = projection([lon, lat]);
      return p ? [t.applyX(p[0]), t.applyY(p[1])] : [-99, -99];
    },
    [projection, t]
  );

  const onCountryHover = useCallback((e, name) => {
    const r = wrapRef.current.getBoundingClientRect();
    setHover({ kind: "country", name, x: e.clientX - r.left, y: e.clientY - r.top });
  }, []);
  const onLeave = useCallback(() => setHover(null), []);

  const fills = useMemo(() => {
    const out = {};
    for (const [name, v] of Object.entries(countryVals)) {
      if (layer === "renewable") out[name] = v.pvout ? pvoutScale(v.pvout) : NO_DATA;
      else if (layer === "exposure") out[name] = v.exposure != null ? exposureScale(v.exposure) : v.producer ? "#2a2116" : NO_DATA;
      else if (layer === "econ") out[name] = v.advantage != null ? advantageScale(v.advantage) : NO_DATA;
      else out[name] = (v.exposure != null && v.advantage != null && bivarColor(v.exposure, v.advantage)) || NO_DATA;
    }
    return out;
  }, [countryVals, layer]);
  const hatch = useMemo(() => {
    const h = {};
    if (layer === "exposure" || layer === "nexus") for (const [n, v] of Object.entries(countryVals)) if (v.producer) h[n] = true;
    return h;
  }, [countryVals, layer]);

  const pointColor = (p) => {
    if (layer === "renewable") return pvoutScale(p.pvout);
    if (layer === "exposure") return exposureScale(p.exposure);
    if (layer === "econ") return advantageScale(p.gap);
    return bivarColor(p.exposure, p.gap) || NO_DATA;
  };

  const hz = screen(HORMUZ.lon, HORMUZ.lat);
  const flowOpacity = 0.25 + 0.6 * (1 - disruption);
  const k = t.k;

  const onSvgClick = (e) => {
    if (e.target.closest("[data-nozoom]")) return;
    const ll = toLonLat(e.nativeEvent);
    if (ll && isFinite(ll[0])) onPlaceCustom(ll);
  };

  const startDrag = (e) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(true);
  };
  const moveDrag = (e) => {
    if (!drag) return;
    const ll = toLonLat(e.nativeEvent);
    if (ll && isFinite(ll[0])) onPlaceCustom(ll, true);
  };
  const endDrag = (e) => {
    if (!drag) return;
    setDrag(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const ll = toLonLat(e.nativeEvent);
    if (ll && isFinite(ll[0])) onPlaceCustom(ll, false);
  };

  const hoverPoint = hover?.kind === "point" ? points.find((p) => p.id === hover.id) : null;
  const hoverCountry = hover?.kind === "country" ? countryVals[hover.name] : null;

  return (
    <div className="relative flex h-full min-h-[420px] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <Segmented options={LAYERS} value={layer} onChange={setLayer} label="Map layer" />
        <div className="flex items-center gap-2 text-[11px] text-ink3">
          <span className="hidden xl:inline">Click the map to analyse any site · drag the pin · Shift-click to compare · Ctrl/⌘-scroll to zoom</span>
        </div>
      </div>
      <div ref={wrapRef} className="relative flex-1 overflow-hidden" style={{ background: "radial-gradient(ellipse at 45% 45%, #0f1a2e 0%, #0a111e 75%)" }}>
        <svg
          ref={svgRef}
          width={size.w}
          height={size.h}
          role="img"
          aria-label="World map of energy substitution economics and Hormuz exposure"
          onClick={onSvgClick}
          style={{ cursor: "crosshair", display: "block", touchAction: "none" }}
        >
          <defs>
            <pattern id="hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" stroke="#e8a33a" strokeOpacity="0.45" strokeWidth="1.2" />
            </pattern>
            <radialGradient id="hzGlow">
              <stop offset="0%" stopColor="#e8a33a" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#e8a33a" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g transform={t.toString()}>
            <path d={sphere} fill="#0b1424" stroke="#1e2a40" vectorEffect="non-scaling-stroke" />
            <path d={graticule} fill="none" stroke="#16223a" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
            <Countries paths={paths} fills={fills} hatch={hatch} onHover={onCountryHover} onLeave={onLeave} />
            {routePaths.map((r) => (
              <g key={r.id} pointerEvents="none">
                <path d={r.d} fill="none" stroke={r.kind === "lng" ? "#7aa2ff" : "#e8a33a"} strokeOpacity={0.12} strokeWidth={r.weight * 1.6 + 2} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                <path d={r.d} fill="none" stroke={r.kind === "lng" ? "#9bb8ff" : "#f0b45a"} strokeOpacity={flowOpacity} strokeWidth={Math.max(1, r.weight * 0.45)} vectorEffect="non-scaling-stroke" className="route-flow" strokeLinecap="round" style={{ animationDuration: `${1.2 + 3 * disruption}s` }} />
              </g>
            ))}
            {bypassPaths.map((r) => (
              <path key={r.id} d={r.d} fill="none" stroke="#e4e9f1" strokeOpacity={0.7} strokeWidth={1.4} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" pointerEvents="none" />
            ))}
          </g>

          {/* screen-space overlays */}
          <g pointerEvents="none">
            {CHOKEPOINTS.map((c) => {
              const [x, y] = screen(c.lon, c.lat);
              return (
                <g key={c.id} transform={`translate(${x},${y})`}>
                  <rect x={-3} y={-3} width={6} height={6} transform="rotate(45)" fill="#0a111e" stroke="#a3aec0" strokeWidth={1} />
                  {k > 1.6 && <text x={7} y={3} fontSize={10} fill="#a3aec0" fontFamily="IBM Plex Sans Condensed, Arial Narrow, sans-serif">{c.name}</text>}
                </g>
              );
            })}
            <g transform={`translate(${hz[0]},${hz[1]})`}>
              <circle r={26 + 30 * disruption} fill="url(#hzGlow)" />
              <circle r={10} fill="none" stroke="#e8a33a" strokeWidth={1.5} className="pulse" />
              <circle r={4.5} fill="#e8a33a" stroke="#0a111e" strokeWidth={2} />
              <text x={-8} y={-12} textAnchor="end" fontSize={10.5} fontWeight={600} fill="#f3c27a" fontFamily="IBM Plex Sans Condensed, Arial Narrow, sans-serif" letterSpacing="0.06em">STRAIT OF HORMUZ</text>
              <text x={-8} y={1} textAnchor="end" fontSize={10} fill="#e4e9f1" fontFamily="IBM Plex Mono, monospace">{Math.round(disruption * 100)}% disrupted</text>
            </g>
          </g>

          <g>
            {points.map((p) => {
              const [x, y] = screen(p.lon, p.lat);
              const isActive = p.id === activeId;
              const slot = compareIds.indexOf(p.id);
              const r = isActive ? 7 : 5;
              const shape = p.useCase === "island" ? "circle" : p.useCase === "industrial" ? "square" : "diamond";
              const fill = pointColor(p);
              return (
                <g
                  key={p.id}
                  data-nozoom
                  transform={`translate(${x},${y})`}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey) onToggleCompare(p.id);
                    else onSelect(p.id);
                  }}
                  onMouseMove={(e) => {
                    const rr = wrapRef.current.getBoundingClientRect();
                    setHover({ kind: "point", id: p.id, x: e.clientX - rr.left, y: e.clientY - rr.top });
                  }}
                  onMouseLeave={onLeave}
                  role="button"
                  tabIndex={0}
                  aria-label={`${p.name}, ${p.region}`}
                  onKeyDown={(e) => { if (e.key === "Enter") onSelect(p.id); }}
                >
                  <circle r={14} fill="transparent" />
                  {isActive && <circle r={r + 5} fill="none" stroke="#e4e9f1" strokeOpacity={0.9} strokeWidth={1.2} />}
                  {shape === "circle" && <circle r={r} fill={fill} stroke="#0a111e" strokeWidth={2} />}
                  {shape === "square" && <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={1.5} fill={fill} stroke="#0a111e" strokeWidth={2} />}
                  {shape === "diamond" && <rect x={-r * 0.9} y={-r * 0.9} width={r * 1.8} height={r * 1.8} transform="rotate(45)" fill={fill} stroke="#0a111e" strokeWidth={2} />}
                  {slot >= 0 && (
                    <g transform="translate(8,-12)">
                      <rect x={-1} y={-8} width={12} height={12} rx={2} fill="#e4e9f1" />
                      <text x={5} y={1.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#0a111e" fontFamily="IBM Plex Mono, monospace">{"ABC"[slot]}</text>
                    </g>
                  )}
                  {(isActive || k > 2.2) && (
                    <text x={r + 6} y={4} fontSize={11} fill="#e4e9f1" fontFamily="IBM Plex Sans Condensed, Arial Narrow, sans-serif" fontWeight={isActive ? 600 : 500} paintOrder="stroke" stroke="#0a111e" strokeWidth={3}>
                      {p.name}
                    </text>
                  )}
                </g>
              );
            })}
            {custom && (() => {
              const [x, y] = screen(custom.lon, custom.lat);
              return (
                <g data-nozoom transform={`translate(${x},${y})`} style={{ cursor: drag ? "grabbing" : "grab" }} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onClick={(e) => { e.stopPropagation(); onSelect("custom"); }}>
                  <circle r={16} fill="transparent" />
                  <path d="M0,0 L-7,-16 A8,8 0 1,1 7,-16 Z" fill="#e4e9f1" stroke="#0a111e" strokeWidth={2} />
                  <circle cy={-19} r={3} fill="#0a111e" />
                  <text x={10} y={-16} fontSize={11} fill="#e4e9f1" fontFamily="IBM Plex Sans Condensed, Arial Narrow, sans-serif" fontWeight={600} paintOrder="stroke" stroke="#0a111e" strokeWidth={3}>Custom site</text>
                </g>
              );
            })()}
          </g>
        </svg>

        {/* zoom controls */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1">
          {[["+", () => zoomBy(1.6), "Zoom in"], ["−", () => zoomBy(1 / 1.6), "Zoom out"], ["⟲", zoomReset, "Reset view"]].map(([l, f, title]) => (
            <button key={title} type="button" onClick={f} title={title} aria-label={title} className="h-7 w-7 rounded-[3px] border border-line2 bg-panel text-[13px] text-ink2 hover:text-ink">{l}</button>
          ))}
          <button type="button" onClick={() => zoomTo(95, 8, 2.2)} title="Focus Indo-Pacific" className="h-7 rounded-[3px] border border-line2 bg-panel px-1 text-[10px] text-ink2 hover:text-ink">IND-PAC</button>
          <button type="button" onClick={() => zoomTo(160, -12, 2.6)} title="Focus Pacific islands" className="h-7 rounded-[3px] border border-line2 bg-panel px-1 text-[10px] text-ink2 hover:text-ink">PACIFIC</button>
        </div>

        <Legend layer={layer} />

        {hover && (hoverPoint || hover.kind === "country") && (
          <div className="tip text-[11.5px]" style={{ left: Math.min(hover.x + 14, size.w - 290), top: Math.min(hover.y + 12, size.h - 150) }}>
            {hoverPoint ? <PointTip p={hoverPoint} /> : <CountryTip name={hover.name} v={hoverCountry} layer={layer} />}
          </div>
        )}
      </div>
    </div>
  );
}

function PointTip({ p }) {
  return (
    <div>
      <div className="font-cond text-[12.5px] font-semibold text-ink">{p.name}</div>
      <div className="mb-1 text-ink3">{p.region} · {p.useCaseLabel}</div>
      <Row k="Cost of supply now → with solar" v={`$${fmtNum(p.lcoeBase)} → $${fmtNum(p.lcoeHyb)}/MWh`} />
      <Row k="Incremental NPV" v={p.npvLabel} />
      <Row k="Hormuz exposure" v={`${Math.round(p.exposure * 100)}%`} />
      <Row k="Solar yield" v={`${fmtNum(p.pvout)} kWh/kWp`} />
      <div className="mt-1 text-[10.5px] text-ink3">Click to open · Shift-click to compare</div>
    </div>
  );
}
function CountryTip({ name, v, layer }) {
  if (!v || (!v.pvout && !v.producer)) return (<div><div className="font-cond font-semibold text-ink">{name}</div><div className="text-ink3">No reference data in this build</div></div>);
  return (
    <div>
      <div className="flex items-center gap-2"><span className="font-cond text-[12.5px] font-semibold text-ink">{name}</span><Tag tier="illustrative" /></div>
      {v.producer && <div className="text-ink3">Gulf producer: exposure is to export revenue, not import supply</div>}
      <Row k="PV yield (indicative)" v={v.pvout ? `${fmtNum(v.pvout)} kWh/kWp` : "—"} />
      <Row k="Hormuz exposure index" v={v.exposure != null ? `${Math.round(v.exposure * 100)}%` : "—"} />
      {v.advantage != null && <Row k="Diesel − solar-hybrid cost" v={`${v.advantage >= 0 ? "+" : "−"}$${fmtNum(Math.abs(v.advantage))}/MWh`} />}
      {layer === "econ" && <div className="mt-1 text-[10.5px] text-ink3">Screening proxy for remote, diesel-supplied systems in this country</div>}
    </div>
  );
}
const Row = ({ k, v }) => (
  <div className="flex justify-between gap-3"><span className="text-ink3">{k}</span><span className="num text-ink">{v}</span></div>
);

function Legend({ layer }) {
  const box = "absolute bottom-3 left-3 rounded-[4px] border border-line bg-[#0b1322e6] px-3 py-2";
  const ramp = (cols, lo, hi, title, note) => (
    <div className={box}>
      <div className="eyebrow mb-1">{title}</div>
      <div className="flex">{cols.map((c) => <span key={c} style={{ background: c }} className="h-2 w-7 first:rounded-l-[2px] last:rounded-r-[2px]" />)}</div>
      <div className="num mt-0.5 flex justify-between text-[10px] text-ink3"><span>{lo}</span><span>{hi}</span></div>
      {note && <div className="mt-1 max-w-[220px] text-[10px] text-ink3">{note}</div>}
      <Shapes />
    </div>
  );
  if (layer === "renewable") return ramp(TEAL_RAMP, "1,000", "1,900 kWh/kWp·yr", "PV specific yield", "Country values indicative; sites use the hourly model.");
  if (layer === "exposure") return ramp(AMBER_RAMP, "0%", "90%", "Hormuz exposure index", "Hatched: Gulf producers (export-side exposure).");
  if (layer === "econ") return ramp(DIVERGING, "Diesel cheaper", "Solar-hybrid cheaper", "Diesel − hybrid cost, $/MWh", "Levelised over project life on the current price path.");
  return (
    <div className={box}>
      <div className="eyebrow mb-1">Where economics meets security</div>
      <div className="flex items-end gap-2">
        <div className="flex flex-col items-center"><span className="text-[9.5px] text-ink3" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>Exposure →</span></div>
        <div>
          {[2, 1, 0].map((r) => (
            <div key={r} className="flex">{[0, 1, 2].map((c) => <span key={c} className="m-[1px] h-3.5 w-3.5 rounded-[1px]" style={{ background: BIVAR[r][c] }} />)}</div>
          ))}
          <div className="text-[9.5px] text-ink3">Solar advantage →</div>
        </div>
        <div className="max-w-[130px] text-[10px] leading-snug text-ink3"><span className="inline-block h-2 w-2 rounded-[1px]" style={{ background: BIVAR[2][2] }} /> Gold: high advantage and high exposure. Both pay.</div>
      </div>
      <Shapes />
    </div>
  );
}
const Shapes = () => (
  <div className="mt-1.5 flex gap-3 border-t border-line pt-1 text-[10px] text-ink3">
    <span className="flex items-center gap-1"><svg width="9" height="9"><circle cx="4.5" cy="4.5" r="4" fill="#a3aec0" /></svg>Island</span>
    <span className="flex items-center gap-1"><svg width="9" height="9"><rect x="1" y="1" width="7" height="7" fill="#a3aec0" /></svg>Industrial</span>
    <span className="flex items-center gap-1"><svg width="10" height="10"><rect x="2" y="2" width="6" height="6" transform="rotate(45 5 5)" fill="#a3aec0" /></svg>LNG power</span>
    <span className="flex items-center gap-1"><svg width="14" height="6"><line x1="0" y1="3" x2="14" y2="3" stroke="#e4e9f1" strokeDasharray="3 2" /></svg>Bypass</span>
  </div>
);
