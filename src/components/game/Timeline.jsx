import React, { useMemo, useState } from "react";
import * as d3 from "d3";
import { useWidth } from "../charts";
import { OPTIONS, GAME_MONTHS, monthDate, capexMults } from "../../game/engine";
import { EVENT_TYPES } from "../../game/events";

export default function Timeline({ month, events, path, rows, decision, decisions, names, playing, onPlay, onAdvance, randomOn, setRandom, onReview, disabled, loc, base }) {
  const [ref, w] = useWidth(300);
  const [hi, setHi] = useState(null);
  const ml = 92, mr = 14, pw = Math.max(100, w - ml - mr);
  const x = d3.scaleLinear().domain([0, GAME_MONTHS]).range([0, pw]);
  const chartH = 78, laneH = 13, gap = 5;
  const lanes = { ev: chartH + 8, build: chartH + 8 + laneH + gap, cost: chartH + 8 + 2 * (laneH + gap) };
  const H = lanes.cost + laneH + 16;
  const youCol = decision && decision.option !== "diesel" ? OPTIONS[decision.option].glow : "#f0a83c";
  const y = useMemo(() => d3.scaleLinear().domain([0, d3.max(rows, (r) => Math.max(r.perMWh, r.cfPerMWh)) * 1.08]).nice().range([chartH, 4]), [rows]);
  const line = (acc, from, to) => d3.line().x((r) => x(r.m + 0.5)).y((r) => y(acc(r))).curve(d3.curveMonotoneX)(rows.slice(from, to));
  const bands = path.dEv.map((e) => ({ e, a: e.start, b: Math.min(GAME_MONTHS, e.end), c: Math.min(GAME_MONTHS, e.end + e.norm) }));
  const others = events.filter((e) => e.kind !== "disruption");
  const idx = d3.range(0, GAME_MONTHS + 1).map((m) => capexMults(events, base, m).batt);
  const yIdx = d3.scaleLinear().domain([Math.min(...idx) * 0.95, 1]).range([lanes.cost + laneH - 2, lanes.cost + 2]);
  const decided = Object.entries(decisions).filter(([, d]) => d.option !== "diesel");
  const onTrack = (e) => {
    if (disabled) return;
    const [mx] = d3.pointer(e);
    const m = Math.round(x.invert(mx - ml));
    if (m > month) onAdvance(Math.min(GAME_MONTHS, m) - month);
  };
  const laneLabel = (yy, t) => <text x={-8} y={yy + laneH / 2} dy="0.34em" textAnchor="end" fontSize={9.5} fill="#8b98ae" className="hud-label">{t}</text>;
  const hov = hi != null ? rows[hi] : null;
  return (
    <div className="z-20 border-t border-[#1a2846] bg-[#070d19] px-3 pb-2 pt-2">
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="flex shrink-0 flex-col justify-between gap-2" style={{ width: 236 }}>
          <div className="flex items-center gap-2">
            <button type="button" disabled={disabled || month >= GAME_MONTHS} onClick={() => onPlay(!playing)} aria-label={playing ? "Pause" : "Play"}
              className="flex h-11 w-11 items-center justify-center rounded-full text-[#04111a] shadow-[0_0_24px_rgba(46,230,201,0.35)] transition hover:brightness-110"
              style={{ background: "linear-gradient(135deg,#1fa89b,#2ee6c9)" }}>
              {playing ? <svg width="14" height="14"><rect x="2" y="1" width="3.5" height="12" fill="#04111a" /><rect x="8.5" y="1" width="3.5" height="12" fill="#04111a" /></svg> : <svg width="14" height="14"><path d="M3 1 L13 7 L3 13 Z" fill="#04111a" /></svg>}
            </button>
            <div>
              <div className="hud-label text-[12.5px] text-white">ADVANCE TIME</div>
              <div className="text-[10.5px] text-[#6d7a91]">{playing ? "Playing · pauses on events" : "Play, or step ahead"}</div>
            </div>
          </div>
          <div className="flex gap-1.5">
            {[[1, "+1 mo"], [6, "+6 mo"], [12, "+1 yr"]].map(([n, l]) => (
              <button key={n} type="button" disabled={disabled || month >= GAME_MONTHS} onClick={() => onAdvance(n)} className="flex-1 rounded-lg border border-[#2b3b5c] py-1 text-[12px] font-medium text-[#cfd8e6] hover:border-[#4a5d85] hover:text-white">{l}</button>
            ))}
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#8b98ae]">
            <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={randomOn} onChange={(e) => setRandom(e.target.checked)} className="accent-[#2ee6c9]" />Random events</label>
            <button type="button" onClick={onReview} disabled={disabled} className="underline hover:text-white">Decade review</button>
          </div>
        </div>
        <div ref={ref} className="relative min-w-0 flex-1">
          <div className="mb-0.5 flex flex-wrap items-center gap-x-3 text-[10.5px] text-[#8b98ae]" style={{ paddingLeft: ml }}>
            <span className="hud-label text-[11px] text-[#cfd8e6]">{loc.name.toUpperCase()} · ELECTRICITY COST, $/MWh</span>
            <span className="flex items-center gap-1"><i className="inline-block h-[2px] w-3" style={{ background: youCol }} />your system</span>
            {decision && decision.option !== "diesel" && <span className="flex items-center gap-1"><i className="inline-block h-[2px] w-3 bg-[#c9821f]" />if you had kept diesel</span>}
            <span className="text-[#6d7a91]">solid = played · faint = expected from what is known now</span>
          </div>
          <svg width={w} height={H} onClick={onTrack} onMouseMove={(e) => { const [mx] = d3.pointer(e); setHi(Math.max(0, Math.min(GAME_MONTHS, Math.round(x.invert(mx - ml))))); }} onMouseLeave={() => setHi(null)}
            style={{ cursor: disabled ? "default" : "pointer" }} role="img" aria-label="Game timeline with events, construction and electricity cost">
            <g transform={`translate(${ml},0)`}>
              {/* shock bands behind chart */}
              {bands.map(({ e, a, b, c }) => (
                <g key={e.id}>
                  <rect x={x(a)} y={0} width={Math.max(1, x(b) - x(a))} height={chartH} fill={e.disruption >= 0.9 ? "#ff7a5c" : "#f0a83c"} opacity={0.1} />
                  <rect x={x(b)} y={0} width={Math.max(0, x(c) - x(b))} height={chartH} fill="#f0a83c" opacity={0.04} />
                </g>
              ))}
              {y.ticks(3).map((v) => <g key={v}><line x1={0} x2={pw} y1={y(v)} y2={y(v)} stroke="#15223b" /><text x={-8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={9.5} fill="#6d7a91" fontFamily="IBM Plex Mono, monospace">${v}</text></g>)}
              {decision && decision.option !== "diesel" && <>
                <path d={line((r) => r.cfPerMWh, 0, month + 1)} fill="none" stroke="#c9821f" strokeWidth={1.6} />
                <path d={line((r) => r.cfPerMWh, month, GAME_MONTHS + 1)} fill="none" stroke="#c9821f" strokeOpacity={0.3} strokeWidth={1.4} />
              </>}
              <path d={line((r) => r.perMWh, 0, month + 1)} fill="none" stroke={youCol} strokeWidth={2.2} />
              <path d={line((r) => r.perMWh, month, GAME_MONTHS + 1)} fill="none" stroke={youCol} strokeOpacity={0.3} strokeWidth={1.6} />

              {/* event lane */}
              {laneLabel(lanes.ev, "SHOCKS")}
              <rect x={0} y={lanes.ev} width={pw} height={laneH} rx={3} fill="#0c1628" />
              {bands.map(({ e, a, b }) => <rect key={e.id} x={x(a)} y={lanes.ev + 2} width={Math.max(2, x(b) - x(a))} height={laneH - 4} rx={2} fill={e.disruption >= 0.9 ? "#ff7a5c" : "#f0a83c"} opacity={0.75}><title>{`${e.title}: ${monthDate(a)} to ${monthDate(b)} (temporary)`}</title></rect>)}
              {others.map((e) => {
                const T = EVENT_TYPES[e.type];
                const cx = x(e.start);
                if (e.kind === "spike" || e.kind === "replay") {
                  const len = e.kind === "spike" ? e.months : e.ratios.length;
                  return <rect key={e.id} x={cx} y={lanes.ev + 4} width={Math.max(2, x(e.start + len) - cx)} height={laneH - 8} rx={2} fill={e.kind === "replay" ? "#b59cff" : "#ffd59a"} opacity={0.85}><title>{`${T.title} (temporary, ${T.tier})`}</title></rect>;
                }
                if (T.type === "structural") return (
                  <g key={e.id}><line x1={cx} x2={pw} y1={lanes.ev + laneH / 2} y2={lanes.ev + laneH / 2} stroke="#2ee6c9" strokeOpacity={0.35} />
                    <rect x={cx - 4} y={lanes.ev + laneH / 2 - 4} width={8} height={8} transform={`rotate(45 ${cx} ${lanes.ev + laneH / 2})`} fill="#2ee6c9"><title>{`${T.title} (structural, ${T.tier})`}</title></rect></g>
                );
                return <circle key={e.id} cx={cx} cy={lanes.ev + laneH / 2} r={4} fill={e.kind === "peace" ? "#2ee6c9" : "#7aa2ff"} stroke="#070d19" strokeWidth={1.5}><title>{`${T.title} (${T.type}, ${T.tier})`}</title></circle>;
              })}

              {/* build lane */}
              {laneLabel(lanes.build, "PROJECTS")}
              <rect x={0} y={lanes.build} width={pw} height={laneH} rx={3} fill="#0c1628" />
              {decided.map(([id, d], i) => {
                const O = OPTIONS[d.option];
                const on = d.month + d.lead;
                return (
                  <g key={id} opacity={id === loc.id ? 1 : 0.5}>
                    <rect x={x(d.month)} y={lanes.build + 1} width={Math.max(2, x(Math.min(on, GAME_MONTHS)) - x(d.month))} height={laneH - 2} rx={2} fill={O.glow} opacity={0.45} />
                    {on < GAME_MONTHS && <rect x={x(on)} y={lanes.build + 1} width={pw - x(on)} height={laneH - 2} rx={2} fill={O.glow} opacity={0.9} />}
                    <text x={x(d.month) + 4} y={lanes.build + laneH / 2} dy="0.34em" fontSize={9} fill="#04111a" fontWeight={600}>{names[id]}</text>
                  </g>
                );
              })}

              {/* equipment cost lane */}
              {laneLabel(lanes.cost, "BATTERY COST")}
              <rect x={0} y={lanes.cost} width={pw} height={laneH} rx={3} fill="#0c1628" />
              <path d={d3.line().x((v, i) => x(i)).y((v) => yIdx(v))(idx)} fill="none" stroke="#5b88f0" strokeWidth={1.5} />
              <text x={pw - 4} y={lanes.cost + laneH / 2} dy="0.34em" textAnchor="end" fontSize={9} fill="#8b98ae" paintOrder="stroke" stroke="#0c1628" strokeWidth={4}>{`index ${Math.round(idx[GAME_MONTHS] * 100)} by 2036 · −${(base.battTrend * 100).toFixed(1)}%/yr trend + breakthroughs`}</text>

              {/* years */}
              {d3.range(2, GAME_MONTHS + 1, 12).map((m) => (
                <text key={m} x={x(m)} y={H - 4} textAnchor="middle" fontSize={9.5} fill="#6d7a91" fontFamily="IBM Plex Mono, monospace">{2027 + Math.floor((m - 2) / 12)}</text>
              ))}

              {/* playhead */}
              <line x1={x(month)} x2={x(month)} y1={0} y2={H - 14} stroke="#e8edf5" strokeWidth={1.5} />
              <circle cx={x(month)} cy={2} r={4} fill="#e8edf5" />
              {hi != null && hi !== month && <line x1={x(hi)} x2={x(hi)} y1={0} y2={H - 14} stroke="#e8edf5" strokeOpacity={0.3} />}
            </g>
          </svg>
          {hov && (
            <div className="tip text-[11px]" style={{ left: Math.min(w - 220, ml + x(hi) + 16), top: 6, width: 210 }}>
              <div className="font-medium text-white">{monthDate(hi)}{hi > month ? " · expected" : ""}</div>
              <div className="flex justify-between text-[#a7b2c5]"><span>Your cost</span><span className="num text-white">${Math.round(hov.perMWh)}/MWh</span></div>
              {decision && decision.option !== "diesel" && <div className="flex justify-between text-[#a7b2c5]"><span>Diesel-only</span><span className="num text-white">${Math.round(hov.cfPerMWh)}/MWh</span></div>}
              <div className="flex justify-between text-[#a7b2c5]"><span>Brent · diesel</span><span className="num text-white">${Math.round(hov.brent)} · ${hov.p.toFixed(2)}/L</span></div>
              {hi > month && <div className="mt-0.5 text-[10px] text-[#6d7a91]">Click to jump here (stops at new events)</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
