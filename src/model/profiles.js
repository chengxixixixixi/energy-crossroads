// Synthetic hourly profiles (8,760 h). These are ESTIMATED shapes, not measured data:
// solar geometry + a seeded day-to-day cloudiness process, scaled so the annual
// total equals the site's specific yield (kWh/kWp/yr). Multi-day cloudy spells are
// deliberately included so storage sizing is stress-tested.
import { mulberry32, gaussFactory, hashSeed } from "./rng";

const DEG = Math.PI / 180;
const cache = new Map();

export function solarProfile(lat, pvout) {
  const key = `s:${lat.toFixed(1)}:${Math.round(pvout)}`;
  if (cache.has(key)) return cache.get(key);
  const g = gaussFactory(mulberry32(hashSeed(key)));
  const out = new Float64Array(8760);
  const phi = lat * DEG;
  const tilt = Math.min(Math.abs(lat), 30) * DEG;
  const phiE = phi - (lat >= 0 ? 1 : -1) * tilt; // equator-facing fixed tilt
  let k = 0.75;
  let sum = 0;
  for (let d = 0; d < 365; d++) {
    const decl = 23.45 * DEG * Math.sin((2 * Math.PI * (284 + d + 1)) / 365);
    k = 0.55 * k + 0.45 * 0.75 + 0.17 * g(); // AR(1) daily clearness
    const kd = Math.min(1, Math.max(0.12, k));
    for (let h = 0; h < 24; h++) {
      const om = (h + 0.5 - 12) * 15 * DEG;
      const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(om);
      let v = 0;
      if (cosZ > 0.01) {
        const cosT = Math.max(0, Math.sin(phiE) * Math.sin(decl) + Math.cos(phiE) * Math.cos(decl) * Math.cos(om));
        const zen = Math.acos(cosZ) / DEG;
        const am = 1 / (cosZ + 0.50572 * Math.pow(Math.max(0.1, 96.07995 - zen), -1.6364));
        const beam = Math.pow(0.7, Math.pow(am, 0.678));
        const hourly = Math.min(1.15, Math.max(0.35, 1 + 0.1 * g()));
        v = cosT * beam * kd * hourly + 0.12 * cosZ * (1.1 - 0.5 * kd);
      }
      out[d * 24 + h] = v;
      sum += v;
    }
  }
  // scale to the annual yield, apply inverter clipping at 0.9 MW per MWp, rescale once
  let s = pvout / sum;
  let sum2 = 0;
  for (let i = 0; i < 8760; i++) {
    out[i] = Math.min(0.9, out[i] * s);
    sum2 += out[i];
  }
  s = pvout / sum2;
  for (let i = 0; i < 8760; i++) out[i] = Math.min(0.92, out[i] * s);
  cache.set(key, out);
  return out;
}

export function windProfile(cf, seedKey) {
  const key = `w:${seedKey}:${cf.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key);
  const g = gaussFactory(mulberry32(hashSeed(key)));
  const z = new Float64Array(8760);
  let x = 0;
  const rho = 0.97;
  const sd = Math.sqrt(1 - rho * rho);
  for (let i = 0; i < 8760; i++) {
    x = rho * x + sd * g();
    const day = Math.floor(i / 24);
    const hr = i % 24;
    z[i] = x + 0.25 * Math.cos((2 * Math.PI * day) / 365) + 0.12 * Math.sin((2 * Math.PI * (hr - 9)) / 24);
  }
  const curve = (u) => (u < 3 ? 0 : u >= 25 ? 0 : u >= 12 ? 1 : (u ** 3 - 27) / (1728 - 27));
  const meanFor = (m) => {
    let s = 0;
    for (let i = 0; i < 8760; i++) s += curve(m * Math.exp(0.45 * z[i]));
    return s / 8760;
  };
  let lo = 1, hi = 20;
  for (let it = 0; it < 30; it++) {
    const mid = (lo + hi) / 2;
    if (meanFor(mid) < cf) lo = mid;
    else hi = mid;
  }
  const m = (lo + hi) / 2;
  const out = new Float64Array(8760);
  for (let i = 0; i < 8760; i++) out[i] = curve(m * Math.exp(0.45 * z[i]));
  cache.set(key, out);
  return out;
}

const SHAPES = {
  island: [0.78, 0.74, 0.72, 0.71, 0.72, 0.76, 0.85, 0.92, 0.98, 1.02, 1.05, 1.07, 1.07, 1.06, 1.05, 1.04, 1.05, 1.12, 1.28, 1.32, 1.27, 1.15, 0.98, 0.86],
  industrial: [0.62, 0.6, 0.6, 0.6, 0.62, 0.7, 0.95, 1.18, 1.25, 1.27, 1.28, 1.25, 1.2, 1.26, 1.27, 1.26, 1.22, 1.12, 0.98, 0.9, 0.84, 0.78, 0.7, 0.65],
  system: [0.82, 0.78, 0.76, 0.75, 0.77, 0.83, 0.93, 1.0, 1.04, 1.07, 1.09, 1.1, 1.1, 1.1, 1.09, 1.08, 1.08, 1.12, 1.2, 1.22, 1.16, 1.06, 0.95, 0.87],
};
const WEEKEND = { island: 0.96, industrial: 0.72, system: 0.93 };
const SEASON = { island: 0.04, industrial: 0.02, system: 0.08 };

export function loadProfile(shape, lat = 10) {
  const key = `l:${shape}:${lat >= 0 ? "n" : "s"}`;
  if (cache.has(key)) return cache.get(key);
  const g = gaussFactory(mulberry32(hashSeed(key)));
  const base = SHAPES[shape] || SHAPES.island;
  const out = new Float64Array(8760);
  let sum = 0;
  const flip = lat >= 0 ? 0 : Math.PI;
  for (let d = 0; d < 365; d++) {
    const wk = d % 7 >= 5 ? WEEKEND[shape] : 1;
    const season = 1 + SEASON[shape] * Math.cos((2 * Math.PI * (d - 196)) / 365 + flip);
    for (let h = 0; h < 24; h++) {
      const v = base[h] * wk * season * (1 + 0.025 * g());
      out[d * 24 + h] = v;
      sum += v;
    }
  }
  const s = 8760 / sum;
  for (let i = 0; i < 8760; i++) out[i] *= s;
  cache.set(key, out);
  return out;
}

// Grid outage hours for industrial sites: seeded 3-hour events.
export function outageMask(hoursPerYear, seedKey) {
  const key = `o:${seedKey}:${Math.round(hoursPerYear)}`;
  if (cache.has(key)) return cache.get(key);
  const rng = mulberry32(hashSeed(key));
  const mask = new Uint8Array(8760);
  const events = Math.round(hoursPerYear / 3);
  for (let e = 0; e < events; e++) {
    const start = Math.floor(rng() * (8760 - 3));
    for (let k = 0; k < 3; k++) mask[start + k] = 1;
  }
  cache.set(key, mask);
  return mask;
}

export function peakOf(arr) {
  let p = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i] > p) p = arr[i];
  return p;
}
