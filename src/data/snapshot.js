// Market snapshot for the Hormuz Risk Monitor.
// These are OBSERVED, dated values retrieved by web search on 2026-11-12 (Asia/Shanghai).
// They are NOT a live feed: the artifact sandbox blocks network calls to data APIs.
// Swap this module for a live adapter (see src/data/adapters.js) when hosting allows.

export const SNAPSHOT_RETRIEVED = "2026-11-12";
export const CRISIS_START = "2026-02-28"; // US–Israeli campaign against Iran began (Barchart market commentary)

export const SOURCES = {
  star: { label: "Xinhua via The Star, 10 Nov 2026", url: "https://www.thestar.com.my/news/world/2026/11/10/crude-futures-settle-lower" },
  eia: { label: "EIA RBRTE spot series (datahub.io mirror)", url: "https://github.com/datasets/oil-prices" },
  eiaHormuz: { label: "EIA, Today in Energy: Strait of Hormuz chokepoint", url: "https://www.eia.gov/todayinenergy/detail.php?id=65504" },
  ieaFactsheet: { label: "IEA, Strait of Hormuz 2026 factsheet", url: "https://iea.blob.core.windows.net/assets/c8248eba-8689-46d9-ae4b-b858b59c0f1c/StraitofHormuz2026-Factsheet.pdf" },
  jkm: { label: "JOGMEC via GlobalLNGHub weekly update, 9 Nov 2026", url: "https://globallnghub.com/?p=20947" },
  jkmPrewar: { label: "Platts via Hellenic Shipping News (Nov 2025 JKM)", url: "https://www.hellenicshippingnews.com/asia-lng-moc-nov-jkm-physical-market-sees-second-highest-activity-despite-shoulder-season-lull/" },
  lloyds: { label: "Lloyd's List Intelligence, Hormuz Brief 5 Nov 2026", url: "https://www.lloydslistintelligence.com/resources/blog/strait-of-hormuz-brief-5-november-2026" },
  spg: { label: "S&P Global, Hormuz Oct crossings (2 Nov 2026)", url: "https://www.spglobal.com/energy/en/news-research/latest-news/shipping/110226-hormuz-oct-crossings-at-3-month-high-despite-attacks-red-sea-traffic-also-rises" },
  kpler: { label: "Kpler, Hormuz normalisation (20 Oct 2026)", url: "https://www.kpler.com/blog/hormuz-normalisation-no-longer-needs-to-wait-for-a-deal" },
  windward: { label: "Windward via ShipUniverse (1 Nov 2026)", url: "https://www.shipuniverse.com/?p=26444" },
  fipi: { label: "FIPI Policy & Economic Report, Apr 2026 (Argus/OPEC data)", url: "https://fipi.org.in/Policy_Economic_Report/April26/files/basic-html/page36.html" },
  qci: { label: "Quantum Commodity Intelligence, 23 Oct 2026", url: "https://www.qcintel.com/article/east-of-suez-crude-extends-gains-gasoil-crack-nears-70-b-75867.html" },
  plattsCrack: { label: "S&P Global Platts, 15 Dec 2025", url: "https://www.spglobal.com/energy/en/news-research/latest-news/refined-products/121525-commodities-2026-asian-gasoil-faces-supply-pressure-us-refinery-cuts-to-boost-jet-arbitrage" },
  bnefBess: { label: "BNEF Energy Storage System Cost Survey 2025 (via Energy-Storage.news)", url: "https://www.energy-storage.news/battery-storage-system-prices-continue-to-fall-sharply-bnef-and-ember-reports-find/" },
  irena: { label: "IRENA, Renewable Power Generation Costs in 2024", url: "https://www.irena.org/-/media/Files/IRENA/Agency/Publication/2025/Jul/IRENA_TEC_RPGC_in_2024_Summary_2025.pdf" },
};

// Each item: value, unit, asOf, tier, source key, note
export const MARKET = {
  brentFutures: { label: "ICE Brent front-month (Jan-27)", value: 92.57, unit: "$/bbl", asOf: "2026-11-10", tier: "observed", src: "star", note: "Settlement; down 5.85% on the day" },
  brentSpot: { label: "Brent spot (EIA RBRTE)", value: 107.03, unit: "$/bbl", asOf: "2026-11-03", tier: "observed", src: "eia", note: "Latest daily value in the EIA mirror; physical spot has traded well above futures during the crisis" },
  brentOctAvg: { label: "Brent spot, Oct 2026 avg", value: 123.93, unit: "$/bbl", asOf: "2026-10", tier: "observed", src: "eia" },
  brentPrewar: { label: "Brent spot, Feb 2026 avg (pre-war)", value: 70.89, unit: "$/bbl", asOf: "2026-02", tier: "observed", src: "eia" },
  jkm: { label: "JKM spot LNG (Dec delivery)", value: 32, unit: "$/MMBtu", asOf: "2026-11-06", tier: "observed", src: "jkm", note: "Assessed in the low-$32s" , approx: true },
  jkmPrewar: { label: "JKM, Nov 2025 avg (pre-war)", value: 11.02, unit: "$/MMBtu", asOf: "2025-11", tier: "observed", src: "jkmPrewar" },
  ttf: { label: "TTF (Dec delivery)", value: 28.0, unit: "$/MMBtu", asOf: "2026-11-06", tier: "observed", src: "jkm" },
  gasoilCrack: { label: "Singapore gasoil crack", value: 70, unit: "$/bbl", asOf: "2026-10-23", tier: "observed", src: "qci", note: "Reported as nearing $70/b", approx: true },
  gasoilCrackMar: { label: "Singapore gasoil crack vs Dubai, Mar 2026 avg", value: 63.64, unit: "$/bbl", asOf: "2026-03", tier: "observed", src: "fipi" },
  gasoilCrackPrewar: { label: "Singapore gasoil crack, pre-war", value: 20.35, unit: "$/bbl", asOf: "2025-12-15", tier: "observed", src: "plattsCrack" },
};

export const SHIPPING = {
  octTransits: { label: "Hormuz transits, Oct 2026 (observed + assumed)", value: 750, unit: "vessels / month", asOf: "2026-10", tier: "observed", src: "spg", note: "≈24 a day; 749 in September" },
  octLng: { label: "LNG carrier transits, Oct 2026", value: 32, unit: "vessels / month", asOf: "2026-10", tier: "observed", src: "spg", note: "Highest monthly count since the war began" },
  weekly: { label: "Non-Iranian-linked transits, week of 19–25 Oct", value: 116, unit: "vessels / week", asOf: "2026-10-25", tier: "observed", src: "lloyds", note: "124 the prior week; 95 tankers and gas carriers" },
  nov1: { label: "Crossings on 1 Nov 2026", value: 8, unit: "vessels / day", asOf: "2026-11-01", tier: "observed", src: "windward", note: "Includes 3 without AIS signal" },
  crudeFlows: { label: "Gulf crude exports incl. bypass routes", value: 18.5, unit: "mb/d", asOf: "2026-10-20", tier: "observed", src: "kpler", note: "Roughly pre-conflict levels once Saudi West Coast and UAE East Coast volumes are counted" },
  productFlows: { label: "Clean product flows vs pre-war", value: -50, unit: "%", asOf: "2026-10-20", tier: "observed", src: "kpler", note: "Products remain the binding constraint" },
  prewarFlow: { label: "Pre-war oil flow through Hormuz (2024)", value: 20, unit: "mb/d", asOf: "2024", tier: "observed", src: "eiaHormuz", note: "≈20% of global petroleum liquids consumption" },
  bypass: { label: "Unused Saudi/UAE bypass pipeline capacity", value: 2.6, unit: "mb/d", asOf: "2025", tier: "observed", src: "eiaHormuz", note: "IEA puts redirectable pipeline capacity at 3.5–5.5 mb/d" },
};

export const OUTLOOK = {
  text: "Kpler's base case (20 Oct 2026) is a slow, uneven normalisation; it does not expect full reopening within six months and extends its recovery curve through 2027.",
  src: "kpler",
};
