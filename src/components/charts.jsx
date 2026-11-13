import React, { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { fmtMoney, fmtNum, monthLabel, Segmented, Tag, Btn } from "./ui";

export const C = { fossil: "#c9821f", renew: "#1fa89b", storage: "#5b88f0", neutral: "#66758c", grid: "#1e2a40", axis: "#6f7c93", ink: "#e4e9f1", ink2: "#a3aec0", panel: "#0e1626" };
const MONO = "IBM Plex Mono, ui-monospace, monospace";

export function useWidth(min = 200) {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(min, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [min]);
  return [ref, w];
}

// ---- export helpers -------------------------------------------------------------
async function svgToPngDataUrl(svg) {
  const clone = svg.cloneNode(true);
  const { width, height } = svg.getBoundingClientRect();
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", width);
  clone.setAttribute("height", height);
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%"); bg.setAttribute("height", "100%"); bg.setAttribute("fill", C.panel);
  clone.insertBefore(bg, clone.firstChild);
  const xml = new XMLSerializer().serializeToString(clone);
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const canvas = document.createElement("canvas");
  canvas.width = width * 2; canvas.height = height * 2;
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);
  ctx.drawImage(img, 0, 0);
  return { png: canvas.toDataURL("image/png"), svg: xml };
}

export function ChartFrame({ title, sub, tier = "estimated", right, children, csv, footnote }) {
  const bodyRef = useRef(null);
  const [exp, setExp] = useState(null);
  const [copied, setCopied] = useState("");
  const doExport = async () => {
    const svg = bodyRef.current?.querySelector("svg");
    if (!svg) return;
    try { setExp(await svgToPngDataUrl(svg)); } catch (e) { setExp({ error: String(e) }); }
  };
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(""), 1600); } catch (_) { setCopied("blocked"); }
  };
  return (
    <figure className="panel flex min-w-0 flex-col p-3">
      <figcaption className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-cond text-[13px] font-semibold text-ink">{title}</h3>
            <Tag tier={tier} />
          </div>
          {sub && <div className="text-[11.5px] text-ink3">{sub}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {right}
          <Btn onClick={doExport} title="Export this chart as an image">Export</Btn>
        </div>
      </figcaption>
      <div ref={bodyRef} className="min-w-0">{children}</div>
      {footnote && <div className="mt-1.5 text-[10.5px] leading-snug text-ink3">{footnote}</div>}
      {exp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setExp(null)}>
          <div className="panel max-h-full max-w-4xl overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="font-cond text-[13px] font-semibold">{title}</div>
              <div className="flex gap-1.5">
                {exp.svg && <Btn onClick={() => copy(exp.svg, "svg")}>{copied === "svg" ? "Copied" : "Copy SVG"}</Btn>}
                {csv && <Btn onClick={() => copy(csv(), "csv")}>{copied === "csv" ? "Copied" : "Copy data (CSV)"}</Btn>}
                <Btn onClick={() => setExp(null)}>Close</Btn>
              </div>
            </div>
            {exp.png ? <img src={exp.png} alt={title} className="max-w-full rounded-[3px] border border-line" /> : <div className="text-ink3">Image export failed here: {exp.error}. Use Copy SVG instead.</div>}
            <div className="mt-2 text-[11px] text-ink3">This viewer blocks direct downloads. Right-click the image and choose “Save image as…”, or copy the SVG/CSV.{copied === "blocked" && " Clipboard access was refused by the browser."}</div>
          </div>
        </div>
      )}
    </figure>
  );
}

const Axis = ({ scale, orient, ticks = 5, fmt, x = 0, y = 0, length }) => {
  const tv = scale.ticks ? scale.ticks(ticks) : scale.domain();
  return (
    <g transform={`translate(${x},${y})`} fontFamily={MONO} fontSize={9.5} fill={C.axis}>
      {tv.map((t) => {
        const p = scale(t);
        return orient === "left" ? (
          <g key={t} transform={`translate(0,${p})`}>
            <line x1={0} x2={length} stroke={C.grid} />
            <text x={-6} dy="0.32em" textAnchor="end">{fmt ? fmt(t) : t}</text>
          </g>
        ) : (
          <g key={t} transform={`translate(${p},0)`}>
            <text y={12} textAnchor="middle">{fmt ? fmt(t) : t}</text>
          </g>
        );
      })}
    </g>
  );
};

// ---- 1. time series: shock vs long-run economics --------------------------------
export function TimeSeries({ r, path, driver, start = 0 }) {
  const [ref, w] = useWidth(320);
  const [span, setSpan] = useState("life");
  const [hi, setHi] = useState(null);
  const H = r.core.H;
  const N = span === "life" ? H : Math.min(H, 60);
  const ml = 52, mr = 118, pw = w - ml - mr;
  const hA = 70, hB = 120, hC = 110, gap = 26;
  const x = d3.scaleLinear().domain([0, N]).range([0, pw]);
  const E = r.sims.base.loadMWh / 12;
  const rows = useMemo(() => {
    const out = [];
    let cum = 0;
    for (let m = 0; m < H; m++) {
      cum += r.core.net[m] * r.core.df[m];
      const drv = driver === "brent" ? path.brent[m] : driver === "lng" ? path.lng[m] : null;
      out.push({ m, drv, base: r.core.baseCost[m] / E, hyb: r.core.hybCost[m] / E, cum });
    }
    return out;
  }, [r, path, driver, H, E]);
  const vis = rows.slice(0, N);
  const drvRows = driver === "tariff" ? vis.map((d) => ({ ...d, drv: d.base })) : vis;
  const yA = d3.scaleLinear().domain([0, d3.max(drvRows, (d) => d.drv) * 1.1 || 1]).nice().range([hA, 0]);
  const yB = d3.scaleLinear().domain([0, d3.max(vis, (d) => Math.max(d.base, d.hyb)) * 1.08 || 1]).nice().range([hB, 0]);
  const cumExt = d3.extent(vis, (d) => d.cum);
  const yC = d3.scaleLinear().domain([Math.min(0, cumExt[0]), Math.max(0, cumExt[1])]).nice().range([hC, 0]);
  const line = (yS, acc) => d3.line().x((d) => x(d.m + 0.5)).y((d) => yS(acc(d))).curve(d3.curveMonotoneX);
  const shockEnd = Math.min(N, path.D);
  const normEnd = Math.min(N, path.D + path.R);
  const lead = r.core.lead;
  const total = hA + hB + hC + gap * 2 + 34;
  const top = [0, hA + gap, hA + hB + gap * 2];
  const drvLabel = driver === "brent" ? "Brent, $/bbl" : driver === "lng" ? "LNG, $/MMBtu" : "Grid supply cost, $/MWh";
  const fmtX = (m) => (N > 72 ? `Y${Math.round(m / 12)}` : monthLabel(m + start).replace(" 20", " ’"));
  const xticks = N > 72 ? d3.range(0, N + 1, 60) : d3.range(0, N + 1, 12);
  const h = hi != null ? rows[Math.min(hi, rows.length - 1)] : null;
  const onMove = (e) => {
    const [mx] = d3.pointer(e);
    const m = Math.max(0, Math.min(N - 1, Math.floor(x.invert(mx - ml))));
    setHi(m);
  };
  const csv = () => "month,date,driver,cost_fossil_only_per_mwh,cost_hybrid_per_mwh,cum_discounted_cashflow_usd\n" + rows.map((d) => `${d.m},${monthLabel(d.m + start)},${d.drv ?? ""},${d.base.toFixed(2)},${d.hyb.toFixed(2)},${d.cum.toFixed(0)}`).join("\n");
  const last = vis[vis.length - 1];
  const band = (yTop, height) => (
    <>
      {shockEnd > 0 && <rect x={0} y={yTop} width={x(shockEnd)} height={height} fill="#e8a33a" opacity={0.08} />}
      {normEnd > shockEnd && <rect x={x(shockEnd)} y={yTop} width={x(normEnd) - x(shockEnd)} height={height} fill="#e8a33a" opacity={0.035} />}
    </>
  );
  return (
    <ChartFrame
      title="Short-term shock vs long-term project economics"
      sub={`Monthly, from ${monthLabel(start)}. Shaded: disruption window and normalisation. ${lead > 0 ? `Replacement capacity online after ~${lead} months.` : "Pre-emptive: capacity already online."}`}
      right={<Segmented value={span} onChange={setSpan} options={[{ value: "5y", label: "First 5 yrs" }, { value: "life", label: "Project life" }]} />}
      csv={csv}
      footnote="Three panels share one time axis instead of a dual-axis chart. Cost of supply = fuel or energy purchases + O&M of the retained fleet + renewable O&M; capital enters the cash-flow panel only."
    >
      <div ref={ref} className="relative">
        <svg width={w} height={total} onMouseMove={onMove} onMouseLeave={() => setHi(null)} role="img" aria-label="Price path, cost of supply and cumulative discounted cash flow over time">
          <g transform={`translate(${ml},16)`}>
            {/* A: driver */}
            <g transform={`translate(0,${top[0]})`}>
              {band(0, hA)}
              <Axis scale={yA} orient="left" ticks={3} length={pw} fmt={(v) => fmtNum(v)} />
              <path d={line(yA, (d) => d.drv)(drvRows)} fill="none" stroke={driver === "tariff" ? C.fossil : C.fossil} strokeWidth={2} />
              <text x={0} y={-6} fontSize={10.5} fill={C.ink2} fontFamily="IBM Plex Sans Condensed, Arial Narrow, sans-serif">{driver === "tariff" ? "Grid + backup cost of supply, $/MWh (fossil-only)" : drvLabel}</text>
              <circle cx={x(N - 0.5)} cy={yA(drvRows[drvRows.length - 1].drv)} r={4} fill={C.fossil} stroke={C.panel} strokeWidth={2} />
              <text x={pw + 8} y={yA(drvRows[drvRows.length - 1].drv)} dy="0.32em" fontSize={10} fontFamily={MONO} fill={C.ink2}>{fmtNum(drvRows[drvRows.length - 1].drv, driver === "lng" ? 1 : 0)}</text>
            </g>
            {/* B: cost of supply */}
            <g transform={`translate(0,${top[1]})`}>
              {band(0, hB)}
              <Axis scale={yB} orient="left" ticks={4} length={pw} fmt={(v) => fmtNum(v)} />
              <text x={0} y={-4} fontSize={10.5} fill={C.ink2} fontFamily="IBM Plex Sans Condensed, Arial Narrow, sans-serif">Cost of reliable supply, $/MWh</text>
              <path d={line(yB, (d) => d.base)(vis)} fill="none" stroke={C.fossil} strokeWidth={2} />
              <path d={line(yB, (d) => d.hyb)(vis)} fill="none" stroke={C.renew} strokeWidth={2} />
              {lead > 0 && lead < N && (
                <g>
                  <line x1={x(lead)} x2={x(lead)} y1={0} y2={hB} stroke={C.ink2} strokeOpacity={0.6} />
                  <text x={x(lead) + 4} y={10} fontSize={10} fill={C.ink2} fontFamily="IBM Plex Sans Condensed, Arial Narrow, sans-serif">online</text>
                </g>
              )}
              <EndLabel x={pw} y={yB(last.base)} color={C.fossil} label={`Fossil-only ${fmtNum(last.base)}`} other={yB(last.hyb)} />
              <EndLabel x={pw} y={yB(last.hyb)} color={C.renew} label={`Hybrid ${fmtNum(last.hyb)}`} other={yB(last.base)} />
            </g>
            {/* C: cumulative discounted cash flow */}
            <g transform={`translate(0,${top[2]})`}>
              <Axis scale={yC} orient="left" ticks={4} length={pw} fmt={(v) => fmtMoney(v, 0)} />
              <text x={0} y={-4} fontSize={10.5} fill={C.ink2} fontFamily="IBM Plex Sans Condensed, Arial Narrow, sans-serif">Cumulative discounted cash flow of the hybrid investment</text>
              <line x1={0} x2={pw} y1={yC(0)} y2={yC(0)} stroke={C.ink2} strokeOpacity={0.5} />
              <path d={d3.area().x((d) => x(d.m + 0.5)).y0(yC(0)).y1((d) => yC(d.cum)).curve(d3.curveMonotoneX)(vis)} fill={C.renew} opacity={0.1} />
              <path d={line(yC, (d) => d.cum)(vis)} fill="none" stroke={C.renew} strokeWidth={2} />
              <circle cx={x(N - 0.5)} cy={yC(last.cum)} r={4} fill={C.renew} stroke={C.panel} strokeWidth={2} />
              <text x={pw + 8} y={yC(last.cum)} dy="0.32em" fontSize={10} fontFamily={MONO} fill={C.ink}>{fmtMoney(last.cum)}</text>
              {r.core.paybackD && r.core.paybackD * 12 < N && (
                <g transform={`translate(${x(r.core.paybackD * 12)},${yC(0)})`}>
                  <circle r={4} fill={C.ink} stroke={C.panel} strokeWidth={2} />
                  <text y={-8} textAnchor="middle" fontSize={10} fill={C.ink2} fontFamily="IBM Plex Sans Condensed, Arial Narrow, sans-serif">discounted payback {r.core.paybackD.toFixed(1)} y</text>
                </g>
              )}
              <g transform={`translate(0,${hC + 4})`} fontFamily={MONO} fontSize={9.5} fill={C.axis}>
                {xticks.map((t) => <text key={t} x={x(t)} y={10} textAnchor="middle">{fmtX(t)}</text>)}
              </g>
            </g>
            {h && hi < N && (
              <g pointerEvents="none">
                <line x1={x(hi + 0.5)} x2={x(hi + 0.5)} y1={0} y2={top[2] + hC} stroke={C.ink2} strokeOpacity={0.5} />
              </g>
            )}
          </g>
        </svg>
        {h && hi < N && (
          <div className="tip text-[11px]" style={{ left: Math.min(w - 230, ml + x(hi) + 14), top: top[1] + 20, width: 220 }}>
            <div className="mb-0.5 font-medium text-ink">{monthLabel(hi + start)}</div>
            {h.drv != null && <TipRow k={drvLabel} v={fmtNum(h.drv, 1)} />}
            <TipRow k="Fossil-only, $/MWh" v={fmtNum(h.base)} sw={C.fossil} />
            <TipRow k="Hybrid, $/MWh" v={fmtNum(h.hyb)} sw={C.renew} />
            <TipRow k="Cumulative DCF" v={fmtMoney(h.cum)} />
          </div>
        )}
        <Legend items={[["Fossil-only system", C.fossil], ["Solar + storage hybrid", C.renew]]} />
      </div>
    </ChartFrame>
  );
}

const EndLabel = ({ x, y, color, label, other }) => {
  const dy = Math.abs(y - other) < 12 ? (y < other ? -6 : 6) : 0;
  return (
    <g>
      <circle cx={x} cy={y} r={4} fill={color} stroke={C.panel} strokeWidth={2} />
      <text x={x + 8} y={y + dy} dy="0.32em" fontSize={10} fontFamily={MONO} fill={C.ink2}>{label}</text>
    </g>
  );
};
const TipRow = ({ k, v, sw }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="flex items-center gap-1.5 text-ink3">{sw && <span className="inline-block h-[2px] w-3" style={{ background: sw }} />}{k}</span>
    <span className="num text-ink">{v}</span>
  </div>
);
export const Legend = ({ items }) => (
  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink2">
    {items.map(([l, c, kind]) => (
      <span key={l} className="flex items-center gap-1.5">
        {kind === "box" ? <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: c }} /> : <span className="inline-block h-[2px] w-4 rounded" style={{ background: c }} />}
        {l}
      </span>
    ))}
  </div>
);

// ---- 2. levelised cost stack -------------------------------------------------------
export function CostStack({ r, useCase }) {
  const [ref, w] = useWidth(260);
  const [hov, setHov] = useState(null);
  const lc = r.lcoe, lf = r.lcoeFlat;
  const fuelLabel = useCase === "island" ? "Diesel fuel" : useCase === "industrial" ? "Grid energy & backup fuel" : "LNG fuel";
  const SEG = [
    ["fuel", fuelLabel, C.fossil],
    ["om", "Fleet & plant O&M", C.neutral],
    ["capex", "Fossil fleet capex (new-build)", "#3d4a60"],
    ["pv", "Solar capex", C.renew],
    ["batt", "Storage capex", C.storage],
    ["repl", "Battery replacement", "#3f63b8"],
  ];
  const bars = [
    { key: "base", label: useCase === "island" ? "Diesel only" : useCase === "industrial" ? "Grid + diesel backup" : "Gas generation", parts: lc.base, total: lc.baseTotal, flat: lf.baseTotal },
    { key: "hyb", label: "With solar + storage", parts: lc.hyb, total: lc.hybTotal, flat: lf.hybTotal },
  ];
  const ml = 128, mr = 64, pw = w - ml - mr;
  const xmax = d3.max(bars, (b) => Math.max(b.total, b.flat)) * 1.05;
  const x = d3.scaleLinear().domain([0, xmax]).nice().range([0, pw]);
  const bh = 22, rowH = 46;
  const csv = () => "system," + SEG.map((s) => s[0]).join(",") + ",total,total_no_shock\n" + bars.map((b) => [b.label, ...SEG.map((s) => (b.parts[s[0]] || 0).toFixed(2)), b.total.toFixed(2), b.flat.toFixed(2)].join(",")).join("\n");
  return (
    <ChartFrame title="Levelised cost of reliable supply" sub="$/MWh over the project life, same demand and reliability in both systems" csv={csv}
      footnote={`Tick mark = same system with no shock (flat long-run prices). Existing fossil assets are treated as sunk unless “new-build” is switched on.`}>
      <div ref={ref}>
        <svg width={w} height={bars.length * rowH + 22} role="img" aria-label="Levelised cost comparison">
          <g transform={`translate(${ml},6)`}>
            <Axis scale={x} orient="bottom" ticks={5} y={bars.length * rowH - 4} fmt={(v) => fmtNum(v)} />
            {x.ticks(5).map((t) => <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={bars.length * rowH - 8} stroke={C.grid} />)}
            {bars.map((b, i) => {
              let acc = 0;
              return (
                <g key={b.key} transform={`translate(0,${i * rowH + 6})`}>
                  <text x={-8} y={bh / 2} dy="0.32em" textAnchor="end" fontSize={11} fill={C.ink2} fontFamily="IBM Plex Sans, system-ui, sans-serif">{b.label}</text>
                  {SEG.map(([k, label, col]) => {
                    const v = b.parts[k] || 0;
                    if (v <= 0.05) return null;
                    const x0 = x(acc), x1 = x(acc + v);
                    acc += v;
                    const wd = Math.max(0, x1 - x0 - 2);
                    return (
                      <g key={k} onMouseEnter={() => setHov({ i, k, label, v })} onMouseLeave={() => setHov(null)}>
                        <rect x={x0} y={0} width={wd} height={bh} rx={2} fill={col} opacity={hov && (hov.i !== i || hov.k !== k) ? 0.55 : 1} />
                        {wd > 34 && <text x={x0 + 5} y={bh / 2} dy="0.32em" fontSize={10} fontFamily={MONO} fill={k === "fuel" || k === "pv" ? "#0a111e" : "#ffffff"}>{fmtNum(v)}</text>}
                      </g>
                    );
                  })}
                  <line x1={x(b.flat)} x2={x(b.flat)} y1={-4} y2={bh + 4} stroke={C.ink} strokeWidth={1.5} />
                  <text x={x(b.total) + 6} y={bh / 2} dy="0.32em" fontSize={11} fontFamily={MONO} fill={C.ink}>{fmtNum(b.total)}</text>
                </g>
              );
            })}
          </g>
        </svg>
        <div className="h-4 text-[11px] text-ink2">{hov ? `${hov.label}: $${fmtNum(hov.v, 1)}/MWh` : ""}</div>
        <Legend items={SEG.filter(([k]) => bars.some((b) => (b.parts[k] || 0) > 0.05)).map(([, l, c]) => [l, c, "box"])} />
      </div>
    </ChartFrame>
  );
}

// ---- 3. NPV sensitivity to the long-run price driver -------------------------------
export function Sensitivity({ r, sc }) {
  const [ref, w] = useWidth(260);
  const [hi, setHi] = useState(null);
  const s = r.sens;
  if (!s) return null;
  const ml = 54, mr = 16, pw = w - ml - mr, ph = 170;
  const x = d3.scaleLinear().domain(d3.extent(s.pts, (d) => d.x)).range([0, pw]);
  const yext = [d3.min(s.pts, (d) => Math.min(d.flat, d.shock)), d3.max(s.pts, (d) => Math.max(d.flat, d.shock))];
  const y = d3.scaleLinear().domain([Math.min(0, yext[0]), Math.max(0, yext[1])]).nice().range([ph, 0]);
  const ln = (acc) => d3.line().x((d) => x(d.x)).y((d) => y(acc(d)))(s.pts);
  const cur = s.driver === "brent" ? sc.brentLR : s.driver === "lng" ? sc.lngLR : r.loc.tariff;
  const be = r.breakEven.value;
  const beIn = be >= x.domain()[0] && be <= x.domain()[1];
  const onMove = (e) => {
    const [mx] = d3.pointer(e);
    const xv = x.invert(mx - ml);
    const i = d3.bisector((d) => d.x).center(s.pts, xv);
    setHi(s.pts[i]);
  };
  const csv = () => `${s.driver}_${s.unit},npv_no_shock,npv_with_shock\n` + s.pts.map((d) => `${d.x},${d.flat.toFixed(0)},${d.shock.toFixed(0)}`).join("\n");
  return (
    <ChartFrame title="NPV vs long-run price" sub={`${s.label} (${s.unit}), held flat in real terms`} csv={csv}
      footnote={beIn ? `Break-even ≈ ${fmtNum(be)} ${s.unit} with no shock.` : be < x.domain()[0] ? `NPV stays positive across the range: break-even is below ${x.domain()[0]} ${s.unit}.` : `NPV stays negative across the range.`}>
      <div ref={ref}>
        <svg width={w} height={ph + 26} onMouseMove={onMove} onMouseLeave={() => setHi(null)} role="img" aria-label="NPV sensitivity">
          <g transform={`translate(${ml},6)`}>
            <Axis scale={y} orient="left" ticks={4} length={pw} fmt={(v) => fmtMoney(v, 0)} />
            <Axis scale={x} orient="bottom" ticks={6} y={ph + 2} />
            <line x1={0} x2={pw} y1={y(0)} y2={y(0)} stroke={C.ink2} strokeOpacity={0.6} />
            <line x1={x(cur)} x2={x(cur)} y1={0} y2={ph} stroke={C.ink2} strokeOpacity={0.35} />
            <text x={x(cur) + 4} y={10} fontSize={10} fill={C.ink2} fontFamily="IBM Plex Sans Condensed, Arial Narrow, sans-serif">current long-run</text>
            <path d={ln((d) => d.flat)} fill="none" stroke={C.storage} strokeWidth={2} />
            <path d={ln((d) => d.shock)} fill="none" stroke={C.fossil} strokeWidth={2} />
            {beIn && <circle cx={x(be)} cy={y(0)} r={4.5} fill={C.ink} stroke={C.panel} strokeWidth={2} />}
            {hi && <line x1={x(hi.x)} x2={x(hi.x)} y1={0} y2={ph} stroke={C.ink2} strokeOpacity={0.5} />}
          </g>
        </svg>
        <div className="h-4 text-[11px] text-ink2 num">{hi ? `${hi.x} ${s.unit}: no shock ${fmtMoney(hi.flat)} · with shock ${fmtMoney(hi.shock)}` : ""}</div>
        <Legend items={[["No shock", C.storage], ["With selected shock premium", C.fossil]]} />
      </div>
    </ChartFrame>
  );
}

// ---- 4. Monte Carlo histogram ----------------------------------------------------------
export function Histogram({ r, sc }) {
  const [ref, w] = useWidth(260);
  const [hi, setHi] = useState(null);
  const mc = r.mc;
  if (!mc) return null;
  const ml = 34, mr = 12, pw = w - ml - mr, ph = 150;
  const ext = d3.extent(mc.npvs);
  const pad = (ext[1] - ext[0]) * 0.05 || Math.abs(ext[0]) * 0.1 || 1;
  const x = d3.scaleLinear().domain([ext[0] - pad, ext[1] + pad]).nice().range([0, pw]);
  const bins = d3.bin().domain(x.domain()).thresholds(x.ticks(28))(mc.npvs);
  const y = d3.scaleLinear().domain([0, d3.max(bins, (b) => b.length)]).nice().range([ph, 0]);
  const csv = () => "npv_usd\n" + mc.npvs.map((v) => v.toFixed(0)).join("\n");
  return (
    <ChartFrame title="Risk-adjusted NPV distribution" sub={`400 price paths · σ ${Math.round(sc.volatility * 100)}%/yr · ${Math.round(sc.recurProb * 100)}%/yr chance of a repeat disruption`} csv={csv}
      footnote={`P(NPV > 0) = ${Math.round(mc.probPositive * 100)}%. Lifetime supply-cost dispersion is ${Math.round(mc.hedge * 100)}% lower with the hybrid: the hedge value of not buying fuel.`}>
      <div ref={ref}>
        <svg width={w} height={ph + 40} role="img" aria-label="Monte Carlo NPV histogram">
          <g transform={`translate(${ml},14)`}>
            <Axis scale={y} orient="left" ticks={3} length={pw} />
            <Axis scale={x} orient="bottom" ticks={5} y={ph + 2} fmt={(v) => fmtMoney(v, 0)} />
            {bins.map((b, i) => {
              const bw = Math.max(1, x(b.x1) - x(b.x0) - 2);
              const pos = (b.x0 + b.x1) / 2 >= 0;
              return (
                <g key={i} onMouseEnter={() => setHi(b)} onMouseLeave={() => setHi(null)}>
                  <rect x={x(b.x0) + 1} y={y(b.length)} width={bw} height={ph - y(b.length)} rx={Math.min(2, bw / 2)} fill={pos ? C.renew : C.fossil} opacity={hi && hi !== b ? 0.6 : 1} />
                </g>
              );
            })}
            {x.domain()[0] < 0 && x.domain()[1] > 0 && <line x1={x(0)} x2={x(0)} y1={-6} y2={ph} stroke={C.ink2} />}
            {[["P10", mc.p10], ["P50", mc.p50], ["P90", mc.p90]].map(([l, v], i) => (
              <g key={l} transform={`translate(${x(v)},0)`}>
                <line y1={-4} y2={ph} stroke={C.ink} strokeOpacity={0.55} strokeWidth={1} />
                <text y={-6 + (i === 1 ? 0 : 0)} textAnchor="middle" fontSize={9.5} fontFamily={MONO} fill={C.ink2}>{l}</text>
              </g>
            ))}
          </g>
        </svg>
        <div className="num h-4 text-[11px] text-ink2">{hi ? `${fmtMoney(hi.x0)} to ${fmtMoney(hi.x1)}: ${hi.length} paths` : `P10 ${fmtMoney(mc.p10)} · P50 ${fmtMoney(mc.p50)} · P90 ${fmtMoney(mc.p90)}`}</div>
      </div>
    </ChartFrame>
  );
}

// ---- 5. dispatch week ----------------------------------------------------------------
export function Dispatch({ r }) {
  const [ref, w] = useWidth(260);
  const [which, setWhich] = useState("typical");
  const [hi, setHi] = useState(null);
  const tr = r.sims.hyb.traces[which];
  const inc = r.loc.useCase === "island" ? "Diesel" : r.loc.useCase === "industrial" ? "Grid / backup" : "Gas";
  const ml = 44, mr = 10, pw = w - ml - mr, ph = 150;
  const n = 168;
  const data = d3.range(n).map((i) => ({ i, re: tr.re[i], batt: tr.batt[i], inc: tr.inc[i], load: tr.load[i], soc: tr.soc[i] }));
  const ymax = d3.max(data, (d) => Math.max(d.load, d.re + d.batt + d.inc)) * 1.05;
  const x = d3.scaleLinear().domain([0, n]).range([0, pw]);
  const y = d3.scaleLinear().domain([0, ymax]).nice().range([ph, 0]);
  const stack = d3.stack().keys(["re", "batt", "inc"])(data);
  const cols = [C.renew, C.storage, C.fossil];
  const area = d3.area().x((d) => x(d.data.i + 0.5)).y0((d) => y(d[0])).y1((d) => y(d[1])).curve(d3.curveStepAfter);
  const startDay = which === "typical" ? r.sims.hyb.traces.typStartDay : r.sims.hyb.traces.worstStartDay;
  const dayLabel = (d) => new Date(Date.UTC(2026, 0, 1 + d)).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const csv = () => "hour,load_mw,renewable_direct_mw,battery_mw,incumbent_mw,soc\n" + data.map((d) => `${d.i},${d.load.toFixed(3)},${d.re.toFixed(3)},${d.batt.toFixed(3)},${d.inc.toFixed(3)},${d.soc.toFixed(3)}`).join("\n");
  return (
    <ChartFrame title="Hourly dispatch, one week" sub={`Synthetic weather year · week from ${dayLabel(startDay || 0)} · MW`} csv={csv}
      right={<Segmented value={which} onChange={setWhich} options={[{ value: "typical", label: "Typical" }, { value: "worst", label: "Cloudiest" }]} />}
      footnote={`The ${inc.toLowerCase()} fleet is kept at full firm capacity, so both systems meet the same load at the same reliability. Renewable share over the year: ${Math.round(r.sims.hyb.reFraction * 100)}%.`}>
      <div ref={ref}>
        <svg width={w} height={ph + 24} onMouseMove={(e) => { const [mx] = d3.pointer(e); setHi(Math.max(0, Math.min(n - 1, Math.floor(x.invert(mx - ml))))); }} onMouseLeave={() => setHi(null)} role="img" aria-label="Weekly dispatch stack">
          <g transform={`translate(${ml},6)`}>
            <Axis scale={y} orient="left" ticks={4} length={pw} fmt={(v) => fmtNum(v, v < 10 ? 1 : 0)} />
            {stack.map((s, i) => <path key={s.key} d={area(s)} fill={cols[i]} opacity={0.85} />)}
            <path d={d3.line().x((d) => x(d.i + 0.5)).y((d) => y(d.load)).curve(d3.curveStepAfter)(data)} fill="none" stroke={C.ink} strokeWidth={1.5} />
            {d3.range(0, 8).map((d) => <text key={d} x={x(d * 24 + 12)} y={ph + 14} textAnchor="middle" fontSize={9.5} fontFamily={MONO} fill={C.axis}>{d < 7 ? dayLabel((startDay || 0) + d) : ""}</text>)}
            {d3.range(1, 7).map((d) => <line key={d} x1={x(d * 24)} x2={x(d * 24)} y1={0} y2={ph} stroke={C.grid} />)}
            {hi != null && <line x1={x(hi + 0.5)} x2={x(hi + 0.5)} y1={0} y2={ph} stroke={C.ink2} strokeOpacity={0.6} />}
          </g>
        </svg>
        <div className="num h-4 text-[11px] text-ink2">{hi != null ? `h${hi}: load ${fmtNum(data[hi].load, 1)} · solar ${fmtNum(data[hi].re, 1)} · battery ${fmtNum(data[hi].batt, 1)} · ${inc.toLowerCase()} ${fmtNum(data[hi].inc, 1)} MW · SoC ${Math.round(data[hi].soc * 100)}%` : ""}</div>
        <Legend items={[["Solar/wind to load", C.renew, "box"], ["Battery discharge", C.storage, "box"], [inc, C.fossil, "box"], ["Load", C.ink]]} />
      </div>
    </ChartFrame>
  );
}

// ---- 6. delivered diesel price build-up ----------------------------------------------
export function PriceChain({ r, sc, path }) {
  const [ref, w] = useWidth(260);
  const loc = r.loc;
  const mk = (m) => [
    ["Crude (Brent)", path.brent[m] / 158.987, C.fossil],
    ["Refining margin (crack)", path.crack[m] / 158.987, "#a86b1a"],
    ["Freight & local logistics", loc.logistics * sc.logisticsMult, C.neutral],
    ["War-risk surcharge", path.surch[m] * (loc.hzOil ?? 0), "#e0605a"],
    ["Distribution margin & tax", (loc.margin ?? 0.08) + (loc.tax ?? 0), "#3d4a60"],
  ];
  const lr = Math.min(path.brent.length - 1, Math.ceil(path.D + path.R) + 1);
  const rows = [{ label: "Now (month 1)", segs: mk(0) }, { label: "Long-run", segs: mk(lr) }];
  const ml = 98, mr = 52, pw = w - ml - mr;
  const tot = rows.map((r_) => r_.segs.reduce((s, x) => s + x[1], 0));
  const x = d3.scaleLinear().domain([0, d3.max(tot) * 1.05]).nice().range([0, pw]);
  const csv = () => "row," + rows[0].segs.map((s) => s[0]).join(",") + ",total_usd_per_litre\n" + rows.map((r_, i) => [r_.label, ...r_.segs.map((s) => s[1].toFixed(4)), tot[i].toFixed(4)].join(",")).join("\n");
  return (
    <ChartFrame title="Delivered diesel price build-up" sub="$/litre at the site. Crude is never equated with the retail fuel price." csv={csv}
      footnote="Crack spread and freight are set separately from crude: in 2026 the Singapore gasoil crack rose from about $20/b pre-war to $64–70/b, so products moved more than crude.">
      <div ref={ref}>
        <svg width={w} height={rows.length * 40 + 20} role="img" aria-label="Delivered diesel price components">
          <g transform={`translate(${ml},4)`}>
            <Axis scale={x} orient="bottom" ticks={5} y={rows.length * 40 - 2} fmt={(v) => `$${v.toFixed(2)}`} />
            {rows.map((row, i) => {
              let acc = 0;
              return (
                <g key={row.label} transform={`translate(0,${i * 40 + 4})`}>
                  <text x={-8} y={11} dy="0.32em" textAnchor="end" fontSize={11} fill={C.ink2}>{row.label}</text>
                  {row.segs.map(([l, v, c]) => {
                    if (v <= 0.0005) return null;
                    const x0 = x(acc); acc += v;
                    const wd = Math.max(0, x(acc) - x0 - 2);
                    return <rect key={l} x={x0} y={0} width={wd} height={22} rx={2} fill={c}><title>{`${l}: $${v.toFixed(3)}/L`}</title></rect>;
                  })}
                  <text x={x(tot[i]) + 6} y={11} dy="0.32em" fontSize={11} fontFamily={MONO} fill={C.ink}>${tot[i].toFixed(2)}</text>
                </g>
              );
            })}
          </g>
        </svg>
        <Legend items={rows[0].segs.filter((s) => rows.some((r_) => r_.segs.find((z) => z[0] === s[0])[1] > 0.0005)).map(([l, , c]) => [l, c, "box"])} />
      </div>
    </ChartFrame>
  );
}

// ---- 7. Brent history with episodes (replay) ----------------------------------------
export function HistoryChart({ series, dates, episodes, activeEp, playIdx, onPick }) {
  const [ref, w] = useWidth(240);
  const ph = 120, ml = 34, mr = 8, pw = w - ml - mr;
  const x = d3.scaleLinear().domain([0, series.length - 1]).range([0, pw]);
  const y = d3.scaleLinear().domain([0, d3.max(series) * 1.05]).nice().range([ph, 0]);
  const idx = (d) => dates.indexOf(d);
  return (
    <div ref={ref}>
      <svg width={w} height={ph + 22} role="img" aria-label="Brent monthly price history with episodes">
        <g transform={`translate(${ml},4)`}>
          <Axis scale={y} orient="left" ticks={3} length={pw} />
          {episodes.map((e) => {
            const a = idx(e.start), b = idx(e.end);
            const on = e.id === activeEp;
            return (
              <rect key={e.id} x={x(a)} y={0} width={Math.max(2, x(b) - x(a))} height={ph} fill="#e8a33a" opacity={on ? 0.22 : 0.08} style={{ cursor: "pointer" }} onClick={() => onPick(e.id)}>
                <title>{e.label}</title>
              </rect>
            );
          })}
          <path d={d3.line().x((d, i) => x(i)).y((d) => y(d))(series)} fill="none" stroke={C.fossil} strokeWidth={1.5} />
          {playIdx != null && <circle cx={x(playIdx)} cy={y(series[playIdx])} r={4} fill={C.ink} stroke={C.panel} strokeWidth={2} />}
          {[0, 120, 240, 360].filter((i) => i < series.length).concat(series.length - 1).map((i) => (
            <text key={i} x={x(i)} y={ph + 14} textAnchor={i === series.length - 1 ? "end" : "middle"} fontSize={9.5} fontFamily={MONO} fill={C.axis}>{dates[i].slice(0, 4)}</text>
          ))}
        </g>
      </svg>
    </div>
  );
}
