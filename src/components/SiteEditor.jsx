import React from "react";
import { USE_CASES } from "../data/locations";
import { Segmented, Tag, Info, Btn } from "./ui";

function Field({ label, value, onChange, step = 0.01, min, max, unit, info, tier = "illustrative" }) {
  return (
    <label className="flex flex-col gap-0.5 text-[11.5px] text-ink3">
      <span className="flex items-center gap-1">{label}{info && <Info text={info} />}<Tag tier={tier} /></span>
      <span className="flex items-center gap-1">
        <input type="number" value={value ?? ""} step={step} min={min} max={max} onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} className="w-24" />
        {unit && <span className="text-[11px]">{unit}</span>}
      </span>
    </label>
  );
}

export default function SiteEditor({ loc, sizing, onLoc, onSizing, onReset, isCustom }) {
  const uc = loc.useCase;
  const set = (k) => (v) => onLoc({ [k]: v });
  const setS = (k) => (v) => onSizing({ ...sizing, [k]: v });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="eyebrow">Site assumptions</span>
        {isCustom && (
          <Segmented value={uc} onChange={(v) => onLoc({ useCase: v })} options={Object.entries(USE_CASES).map(([k, u]) => ({ value: k, label: u.short }))} label="Use case" />
        )}
        <Btn onClick={onReset}>Reset to defaults</Btn>
        <span className="text-[11px] text-ink3">Changes apply immediately to this site.</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Field label={uc === "lng" ? "LNG tranche, avg" : "Average load"} value={loc.avgMW} onChange={set("avgMW")} step={0.5} min={0.1} unit="MW" />
        <Field label="PV yield" value={loc.pvout} onChange={set("pvout")} step={10} min={600} max={2400} unit="kWh/kWp" info="Specific yield of fixed-tilt PV. Replace with a Global Solar Atlas site value where available." />
        <Field label="Oil exposure" value={loc.hzOil} onChange={set("hzOil")} step={0.05} min={0} max={1} unit="0–1" />
        {uc !== "island" && <Field label="LNG exposure" value={loc.hzLng ?? 0} onChange={set("hzLng")} step={0.05} min={0} max={1} unit="0–1" />}
        {uc !== "lng" && <Field label="Fuel logistics" value={loc.logistics} onChange={set("logistics")} step={0.01} min={0} unit="$/L" info="Delivered-fuel premium over the refinery-hub price: shipping, storage, handling." />}
        {uc !== "industrial" && <Field label="Fuel storage" value={loc.storageDays} onChange={set("storageDays")} step={1} min={1} unit="days" />}
        {uc === "industrial" && (
          <>
            <Field label="Grid tariff" value={loc.tariff} onChange={set("tariff")} step={5} min={10} unit="$/MWh" />
            <Field label="Tariff fuel link" value={loc.tariffLink} onChange={set("tariffLink")} step={0.05} min={0} max={1} unit="0–1" info="Share of the tariff that moves with the fuel index (LNG or oil)." />
            <Field label="Grid outages" value={loc.outageHours} onChange={set("outageHours")} step={10} min={0} unit="h/yr" />
          </>
        )}
        {uc === "lng" && (
          <>
            <Field label="Heat rate" value={loc.heatRate} onChange={set("heatRate")} step={0.1} min={5} max={12} unit="MMBtu/MWh" />
            <Field label="Fuel switching" value={loc.switchShare ?? 0} onChange={set("switchShare")} step={0.05} min={0} max={1} unit="0–1" />
            <Field label="Wind CF" value={loc.windCF ?? 0} onChange={set("windCF")} step={0.01} min={0} max={0.6} unit="0–1" />
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Field label="Solar" value={sizing.pvRatio} onChange={setS("pvRatio")} step={0.1} min={0} max={8} unit="× avg load" tier="hypothetical" />
        <Field label="Storage" value={sizing.battHours} onChange={setS("battHours")} step={0.5} min={0} max={16} unit="h of avg load" tier="hypothetical" />
        {uc === "lng" && <Field label="Wind" value={sizing.windRatio || 0} onChange={setS("windRatio")} step={0.1} min={0} max={4} unit="× avg load" tier="hypothetical" />}
      </div>
    </div>
  );
}
