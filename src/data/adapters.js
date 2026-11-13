// Live-data adapter seam. Each adapter returns { value, asOf, tier: "live", src } or throws.
// In the hosted artifact, the content-security policy blocks fetch() to other hosts, so
// these are not called. They document the intended integration points.
//
// EIA API v2 (needs a free key): Brent daily spot
//   https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=KEY&frequency=daily&data[0]=value
//   &facets[series][]=RBRTE&sort[0][column]=period&sort[0][direction]=desc&length=1
// IMF PortWatch daily chokepoint transits (ArcGIS FeatureServer, "Daily_Chokepoints_Data")
// World Bank Pink Sheet (monthly commodity prices, incl. LNG Japan)
// Global Solar Atlas / Solargis PVOUT for site-level specific yield
// NASA POWER climatology API for site irradiance when GSA is unavailable

export const LIVE_FEEDS = [
  { id: "eia-brent", name: "EIA API v2 · Brent spot (RBRTE)", status: "blocked-by-host", needsKey: true },
  { id: "portwatch", name: "IMF PortWatch · Hormuz daily transits", status: "blocked-by-host", needsKey: false },
  { id: "wb-pink", name: "World Bank Pink Sheet · LNG Japan", status: "blocked-by-host", needsKey: false },
  { id: "gsa", name: "Global Solar Atlas · site PVOUT", status: "blocked-by-host", needsKey: false },
];

export async function fetchEiaBrent(apiKey) {
  const url = `https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=${encodeURIComponent(apiKey)}&frequency=daily&data[0]=value&facets[series][]=RBRTE&sort[0][column]=period&sort[0][direction]=desc&length=1`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`EIA responded ${r.status}`);
  const j = await r.json();
  const row = j?.response?.data?.[0];
  if (!row) throw new Error("No data in EIA response");
  return { value: Number(row.value), asOf: row.period, tier: "live", src: "eia" };
}
