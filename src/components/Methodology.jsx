import React from "react";
import { SOURCES, SNAPSHOT_RETRIEVED } from "../data/snapshot";
import { TIERS, Tag, SectionTitle } from "./ui";

const S = ({ title, children }) => (
  <div className="min-w-0">
    <h3 className="mb-1 font-cond text-[13px] font-semibold text-ink">{title}</h3>
    <div className="space-y-1.5 text-[12px] leading-relaxed text-ink2">{children}</div>
  </div>
);

export default function Methodology() {
  return (
    <section className="panel p-3" aria-labelledby="meth-title" id="methodology">
      <SectionTitle id="meth-title">Methodology, provenance and limits</SectionTitle>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11.5px] text-ink3">
        {Object.entries(TIERS).map(([k, t]) => (
          <span key={k} className="flex items-center gap-1.5"><Tag tier={k} />{t.desc}</span>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <S title="1 · Reliability parity">
          <p>Each site is simulated hour by hour for a full year (8,760 h). The fossil-only case and the hybrid serve the same load profile. The hybrid keeps the full fossil fleet (sized at 115% of peak) as firm backup, so both deliver the same reliability. Solar and storage change the energy mix and the fuel burn, not the firm capacity. This avoids comparing an intermittent kWh with a dispatchable one.</p>
          <p>Battery: load-following dispatch, {`C/2`} power rating, 88% round-trip efficiency, 10% minimum state of charge. Diesel: four units, 30% minimum load, linear fuel curve (30 L per MW running + 235 L per MWh), about 0.27 L/kWh at typical loading. A grid-forming battery allows diesel-off hours unless switched off.</p>
        </S>
        <S title="2 · Prices and the delivered fuel chain">
          <p>Disruption share and prices are separate inputs. A 30% shipping disruption does not imply a 30% price rise. An optional helper converts a disruption into a price with a transparent elasticity formula, which you must apply by hand.</p>
          <p>Delivered diesel ($/L) = (Brent + gasoil crack) ÷ 158.987 + freight & handling × multiplier + war-risk surcharge × site exposure + distribution margin + tax. Grid tariffs move with a fuel index on their fuel-linked share. Gas cost = heat rate × (LNG + regasification) + variable O&M.</p>
          <p>Price path: the shock level holds for the remaining duration, glides back over the normalisation period, then stays flat in real terms. Historical replay applies EIA monthly Brent instead.</p>
        </S>
        <S title="3 · Investment metrics">
          <p>Monthly cash flows in real 2026 USD. Reactive timing: 50% of capital at decision, 50% at commissioning; savings start at commissioning. Battery replacement at year 12–13 at 50% of today's cost. Life 25 years. Incremental NPV = discounted savings − capital.</p>
          <p>LCOE = discounted lifetime cost ÷ discounted energy, both systems commissioned today. Break-even solves the flat long-run price at which NPV = 0; NPV is linear in that price, so two evaluations solve it exactly.</p>
          <p>Monte Carlo: 400 paths of a mean-reverting log-price process (2-year half-life, mean-preserving) plus repeat disruptions with the chosen annual probability, using the same shock archetype.</p>
        </S>
        <S title="4 · Resilience and deployment">
          <p>Physical shortfall = disruption × site exposure × (1 − market substitution), and for gas × (1 − fuel-switching share). A tank holding N days of fossil-only burn covers the gap until it runs dry; after that the shortfall share of fuel-dependent energy is unserved and valued at the value of lost load. The hybrid burns less, so the same tank lasts longer. Resilience value is shown beside NPV, not inside it.</p>
          <p>Deployment months = base (6 island, 4 industrial, 12 utility) + 3 + 4·log10(1 + MW/5), stretched by 25% × disruption. Indicative only.</p>
        </S>
        <S title="5 · Map layers">
          <p>Country layers use rounded indicative values (PV yield, Hormuz exposure, remote logistics premium) compiled for screening, labelled ILLUS. The substitution layer is a screening proxy for remote, diesel-supplied systems: levelised diesel cost minus a solar-plus-storage blend, recomputed live from the price path. Site markers use the full hourly model.</p>
          <p>Shipping routes are stylised waypoints, not AIS tracks. Widths reflect EIA's finding that about 84% of Hormuz crude went to Asia in 2024.</p>
        </S>
        <S title="6 · Known limits">
          <p>Synthetic weather and load profiles, not measured site data. No intra-hour stability, spinning-reserve or network constraints. No carbon price, subsidies or taxes unless entered. Exposure indices and site parameters are illustrative and should be replaced with site data before any investment decision. Market data is a dated snapshot, not live.</p>
        </S>
      </div>
      <div className="mt-4 border-t border-line pt-3">
        <h3 className="mb-1 font-cond text-[13px] font-semibold text-ink">Sources (snapshot retrieved {SNAPSHOT_RETRIEVED})</h3>
        <ul className="grid gap-x-6 gap-y-0.5 text-[11.5px] md:grid-cols-2">
          {Object.values(SOURCES).map((s) => (
            <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="text-ink2 underline decoration-line2 underline-offset-2 hover:text-ink">{s.label}</a></li>
          ))}
          <li className="text-ink3">Country and site reference values: indicative, compiled for this prototype (see tier labels)</li>
        </ul>
      </div>
    </section>
  );
}
