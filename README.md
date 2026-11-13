# Energy Crossroads

**A geopolitical energy strategy game.** The Strait of Hormuz is disrupted. You run an island power system that burns imported diesel. Keep diesel, build a hybrid, or go solar-led, then advance time and watch prices, shortages, cyclones and technology shifts play out over ten years.

It began as *Hormuz to Home: The Geography of Energy Substitution*, an analyst dashboard, and was redesigned as a game. Game Mode and Analyst Mode run on the same calculation engine.

> 一个关于能源安全的像素风策略游戏：霍尔木兹海峡受阻，你负责一个依赖进口柴油的海岛电网。选择继续用柴油、建混合系统，或以光伏+储能为主，然后推进时间，看油价、断供、台风和技术进步如何影响电费、供电可靠性、能源自主和投资回报。游戏模式和分析师模式用的是同一套计算引擎。

## Play

```bash
npm install
npm run dev        # http://localhost:5173
```

1. Pick an island on the title screen (arrow keys + Enter, or click).
2. Choose one of three moves: **Keep Diesel**, **Build Hybrid System**, **Build Solar + Battery**.
3. **Advance time** (play, +1 month, +6 months, +1 year, or click the timeline). Events pause the clock.
4. Watch four separate indicators: **Affordability, Reliability, Energy Independence, Financial Return**. They are only combined if you set your own weights in *Trade-offs*.
5. Open the **Event deck** to play shocks yourself, or switch to **Analyst Mode** for LCOE, NPV, break-even prices, Monte Carlo, hourly dispatch and every assumption.

## Build and deploy

```bash
npm run build      # single self-contained file: dist/index.html
npm run check      # runs the model sanity checks in scripts/checks
```

The build inlines all JavaScript, CSS, fonts and map data into one HTML file, so it can be opened from disk or hosted anywhere.

**GitHub Pages:** the workflow in `.github/workflows/deploy.yml` builds and publishes on every push to `main`. In the repository go to *Settings → Pages → Build and deployment → Source: GitHub Actions*. Pages on a private repository needs a paid GitHub plan; on a public repository it is free.

## How the model works

| Layer | What it does | Code |
|---|---|---|
| Hourly dispatch | 8,760-hour simulation of solar, battery and diesel against the same load. The diesel fleet (115% of peak) is kept in every option, so all three meet demand to the same reliability standard. | `src/model/dispatch.js`, `src/model/profiles.js` |
| Prices | Delivered diesel = (Brent + gasoil refining margin) ÷ 158.987 L/bbl + freight & handling + war-risk surcharge × Hormuz exposure + local margin. A crude shock is never treated as an equal diesel shock. | `src/model/finance.js` |
| Cash flows | Monthly real-terms cash flows over 25 years; capital 50% at decision and 50% at commissioning; battery replacement in year 12. NPV, payback, LCOE, linear break-even, 400-path Monte Carlo. | `src/model/finance.js` |
| Events | Each event edits a monthly path (Brent, refining margin, LNG, surcharge, physical disruption, equipment-cost multipliers). Temporary shocks expire; structural changes persist. | `src/game/events.js`, `src/game/engine.js` |
| Reliability | Monthly fuel-stock model. Shortfall = disruption × site exposure × (1 − market substitution), with substitution rising over a 6-month time constant. Cyclones suspend deliveries and cut solar output. | `src/game/engine.js` |

### Data provenance

Every number in the UI carries a tier tag:

- **OBS**: observed, dated value with a source (market snapshot retrieved 2026-11-12; EIA monthly Brent history).
- **CALC**: calculated by the model from stated assumptions.
- **HYP**: hypothetical input you control (scenario, events, option sizes).
- **ILLUS**: indicative reference values compiled for screening (country solar yields and Hormuz exposure, island parameters). Not retrieved from an API; replace with site data before any real decision.

There is **no live market feed**. The hosting sandbox used for the prototype blocks external API calls, so prices are a dated snapshot. `src/data/adapters.js` sketches the EIA, IMF PortWatch, World Bank and Global Solar Atlas integrations for a hosted build.

### Main sources

- EIA Europe Brent spot (RBRTE), monthly, via the [datahub.io mirror](https://github.com/datasets/oil-prices)
- EIA, *Strait of Hormuz chokepoint* (pre-war flows, bypass capacity)
- Kpler, Lloyd's List Intelligence, S&P Global and Windward reporting on Hormuz transits and flows (Oct–Nov 2026)
- JOGMEC / GlobalLNGHub (JKM), Quantum Commodity Intelligence and FIPI (Singapore gasoil cracks)
- IRENA, *Renewable Power Generation Costs in 2024*; BNEF *Energy Storage System Cost Survey 2025*

Full links are listed in the app's Analyst Mode.

## Project structure

```
src/
  AppGame.jsx              game state (reducer), layout, wiring
  components/game/         title screen (pixel art), map, panels, timeline, overlays, analyst desk
  components/charts.jsx    shared SVG charts (also used by Analyst Mode)
  game/                    event catalogue and game engine (events → prices → ledger)
  model/                   dispatch, finance, profiles: the shared calculation engine
  data/                    snapshot, history, sites, countries, routes, defaults
  App.jsx + components/    original "Hormuz to Home" dashboard (not mounted; kept for reference)
scripts/checks/            model sanity checks (npm run check)
```

## Limits

Synthetic weather and load profiles; no grid-stability, carbon-price or subsidy modelling; island parameters and country risk indices are illustrative; random-event probabilities are hypothetical. This is a research and teaching prototype, not investment advice.
