import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { COUNTRY_FEATURES } from "../MapView";
import { COUNTRIES, exposureIndex } from "../../data/countries";
import { ROUTES, HORMUZ } from "../../data/routes";

// A low-resolution (256×132) pixel-art world, upscaled with nearest-neighbour.
// Land is coloured by Hormuz supply risk; tankers crawl along the stylised routes.
const W = 256, H = 132;
const PAL = {
  ocean: [7, 17, 40], ocean2: [10, 24, 52], wave: [22, 44, 86],
  low: [40, 88, 76], mid: [118, 116, 50], high: [200, 132, 40], prod: [168, 66, 38], none: [50, 70, 100],
};
const hex = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

function buildBase(projection) {
  const off = document.createElement("canvas");
  off.width = W; off.height = H;
  const ctx = off.getContext("2d");
  const path = d3.geoPath(projection, ctx);
  for (const f of COUNTRY_FEATURES) {
    const c = COUNTRIES[f.properties.name];
    const e = exposureIndex(c);
    const col = c?.role === "producer" ? PAL.prod : e == null ? PAL.none : e >= 0.55 ? PAL.high : e >= 0.25 ? PAL.mid : PAL.low;
    ctx.beginPath(); path(f); ctx.fillStyle = hex(col); ctx.fill();
  }
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const lands = [PAL.low, PAL.mid, PAL.high, PAL.prod, PAL.none];
  const isLand = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const a = d[i * 4 + 3];
    if (a > 110) {
      // snap anti-aliased edges to the nearest palette colour
      let best = lands[0], bd = Infinity;
      for (const p of lands) { const dd = (d[i * 4] - p[0]) ** 2 + (d[i * 4 + 1] - p[1]) ** 2 + (d[i * 4 + 2] - p[2]) ** 2; if (dd < bd) { bd = dd; best = p; } }
      d[i * 4] = best[0]; d[i * 4 + 1] = best[1]; d[i * 4 + 2] = best[2]; d[i * 4 + 3] = 255;
      isLand[i] = 1;
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (isLand[i]) {
      const coast = (x > 0 && !isLand[i - 1]) || (x < W - 1 && !isLand[i + 1]) || (y > 0 && !isLand[i - W]) || (y < H - 1 && !isLand[i + W]);
      if (coast) for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.min(255, d[i * 4 + k] + 38);
      else if ((x + y) % 7 === 0) for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.max(0, d[i * 4 + k] - 10);
    } else {
      const c = (x + y) % 2 === 0 ? PAL.ocean : PAL.ocean2;
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
    }
  }
  return { img, isLand };
}

function routePixels(projection) {
  return ROUTES.map((r) => {
    const out = [];
    for (let s = 0; s < r.pts.length - 1; s++) {
      const a = r.pts[s], b = r.pts[s + 1];
      const pa = projection(a), pb = projection(b);
      if (!pa || !pb) continue;
      const steps = Math.max(2, Math.ceil(Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) * 1.5));
      const interp = d3.geoInterpolate(a, b);
      for (let k = 0; k < steps; k++) {
        const p = projection(interp(k / steps));
        const q = [Math.round(p[0]), Math.round(p[1])];
        const last = out[out.length - 1];
        if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
      }
    }
    return { kind: r.kind, weight: r.weight, px: out };
  });
}

export default function PixelWorld({ markers = [], focus, centerLon = 75, focusLabel }) {
  const ref = useRef(null);
  const wrap = useRef(null);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const [box, setBox] = useState(null);
  const proj = useRef(null);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext("2d");
    const projection = d3.geoNaturalEarth1().rotate([-centerLon, 0]).fitWidth(W, { type: "Sphere" });
    proj.current = projection;
    const [, cy] = projection([centerLon, 8]);
    projection.translate([projection.translate()[0], projection.translate()[1] + (H / 2 - cy)]);
    const { img, isLand } = buildBase(projection);
    const routes = routePixels(projection);
    const hz = projection([HORMUZ.lon, HORMUZ.lat]).map(Math.round);
    const marks = markers.map((m) => ({ ...m, p: projection([m.lon, m.lat]).map(Math.round) }));
    const ships = [];
    routes.forEach((r, ri) => { const n = Math.max(1, Math.round(r.weight)); for (let k = 0; k < n; k++) ships.push({ ri, t: (k / n) * r.px.length + ri * 7, v: 0.35 + ((ri * 13 + k * 7) % 10) / 40 }); });
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const px = (x, y, c, a = 1) => { if (x < 0 || y < 0 || x >= W || y >= H) return; ctx.globalAlpha = a; ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
    const ring = (cx, cy, r, c, a) => { // midpoint circle
      let x = r, y = 0, err = 1 - r;
      while (x >= y) {
        [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]].forEach(([dx, dy]) => px(cx + dx, cy + dy, c, a));
        y++;
        if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; }
      }
    };
    let frame = 0, raf = 0, last = 0;
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 85) return; // ~12 fps for a retro cadence
      last = now; frame++;
      ctx.globalAlpha = 1;
      ctx.putImageData(img, 0, 0);
      // shimmering waves
      for (let k = 0; k < 40; k++) {
        const x = (k * 97 + frame * 3) % W, y = (k * 53 + Math.floor(frame / 3) * 11) % H;
        if (!isLand[y * W + x]) px(x, y, hex(PAL.wave), 0.8);
      }
      // faint route lines
      for (const r of routes) for (let i = 0; i < r.px.length; i += 2) px(r.px[i][0], r.px[i][1], r.kind === "lng" ? "#3b5a9c" : "#6a4a1c", 0.7);
      // tankers with short trails
      for (const s of ships) {
        const r = routes[s.ri];
        if (!r.px.length) continue;
        s.t = (s.t + s.v) % r.px.length;
        const i = Math.floor(s.t);
        const col = r.kind === "lng" ? "#a9c2ff" : "#ffd27a";
        for (let k = 3; k >= 1; k--) { const j = i - k * 1; if (j >= 0) px(r.px[j][0], r.px[j][1], col, 0.25 * (4 - k)); }
        px(r.px[i][0], r.px[i][1], col, 1);
      }
      // Hormuz: blinking core + expanding pixel rings
      const blink = frame % 8 < 5;
      const rr = 2 + (frame % 14) * 0.6;
      ring(hz[0], hz[1], Math.round(rr), "#ff7a5c", Math.max(0, 1 - rr / 10));
      ring(hz[0], hz[1], Math.round((rr + 4) % 10) + 1, "#ffb347", 0.35);
      [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => px(hz[0] + dx, hz[1] + dy, blink ? "#ff5a3c" : "#ffd27a"));
      // playable islands
      for (const m of marks) {
        const on = focusRef.current === m.id;
        const b = on ? frame % 4 < 2 : frame % 10 < 7;
        px(m.p[0], m.p[1], b ? "#2ee6c9" : "#1fa89b");
        if (on) { [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => px(m.p[0] + dx, m.p[1] + dy, "#2ee6c9")); ring(m.p[0], m.p[1], 3 + (frame % 4 < 2 ? 0 : 1), "#e8edf5", 0.9); }
      }
      ctx.globalAlpha = 1;
      if (reduce) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerLon]);
  // map canvas pixels to screen (object-fit: cover) for HTML labels
  const toScreen = (lon, lat) => {
    if (!box || !proj.current) return null;
    const p = proj.current([lon, lat]);
    const sc = Math.max(box.w / W, box.h / H);
    return [p[0] * sc + (box.w - W * sc) / 2, p[1] * sc + (box.h - H * sc) / 2];
  };
  const hz = toScreen(HORMUZ.lon, HORMUZ.lat);
  const fm = markers.find((m) => m.id === focus);
  const fp = fm ? toScreen(fm.lon, fm.lat) : null;
  return (
    <div ref={wrap} className="absolute inset-0">
      <canvas ref={ref} width={W} height={H} aria-hidden="true" className="pixel-canvas" />
      {hz && box && hz[0] > 0 && hz[0] < box.w - 60 && (
        <div className="pointer-events-none absolute font-pixel text-[9px] leading-[1.6] text-[#ffb4a2]" style={{ left: hz[0] + 18, top: hz[1] - 34 }}>
          <div className="pixel-box px-2 py-1"><span className="blink text-[#ff7a5c]">!</span> STRAIT OF HORMUZ<br /><span className="text-[#e8edf5]">DAY 258 · DISRUPTED</span></div>
        </div>
      )}
      {fp && box && fp[0] > 0 && fp[0] < box.w - 40 && (
        <div className="pointer-events-none absolute font-pixel text-[9px] text-[#2ee6c9]" style={{ left: fp[0] + 16, top: fp[1] + 10 }}>
          <div className="pixel-box px-2 py-1">▲ {focusLabel}</div>
        </div>
      )}
    </div>
  );
}
