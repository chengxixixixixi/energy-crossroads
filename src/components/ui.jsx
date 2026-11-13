import React, { useId, useState } from "react";

// ---- provenance tiers ------------------------------------------------------------
export const TIERS = {
  live: { code: "LIVE", color: "#57c785", desc: "Fetched from a live API in this session." },
  observed: { code: "OBS", color: "#7aa2ff", desc: "Observed, dated value from a cited source. Not live." },
  estimated: { code: "CALC", color: "#b59cff", desc: "Calculated by the model from the stated assumptions." },
  hypothetical: { code: "HYP", color: "#f08aa0", desc: "Hypothetical scenario input you control." },
  illustrative: { code: "ILLUS", color: "#9aa6b8", desc: "Indicative reference value compiled for screening; not retrieved from an API." },
};

export function Tag({ tier, title }) {
  const t = TIERS[tier] || TIERS.illustrative;
  return (
    <span
      title={title || t.desc}
      className="num inline-flex items-center gap-1 rounded-[3px] px-1 py-[1px] text-[9.5px] font-medium leading-none"
      style={{ color: t.color, background: `${t.color}14`, border: `1px solid ${t.color}40` }}
    >
      {t.code}
    </span>
  );
}

export function Info({ text, children }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-describedby={id}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="ml-1 inline-flex h-[13px] w-[13px] items-center justify-center rounded-full border border-line2 text-[9px] leading-none text-ink3 hover:border-ink3 hover:text-ink2"
        aria-label="Explain"
      >
        i
      </button>
      {open && (
        <span id={id} role="tooltip" className="tip left-4 top-0 w-64 text-[11.5px] font-normal normal-case leading-snug tracking-normal text-ink2">
          {text || children}
        </span>
      )}
    </span>
  );
}

export function Slider({ id, label, value, min, max, step, onChange, fmt, tier = "hypothetical", info, accent, sub, disabled, logScale }) {
  const toPos = (v) => (logScale ? Math.log(v / min) / Math.log(max / min) : v);
  const fromPos = (p) => (logScale ? min * Math.exp(p * Math.log(max / min)) : p);
  return (
    <div className={`py-[5px] ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="flex items-center text-[12px] text-ink2">
          {label}
          {info && <Info text={info} />}
        </label>
        <span className="flex items-center gap-1.5">
          <span className="num fade-num text-[12px] text-ink">{fmt ? fmt(value) : value}</span>
          <Tag tier={tier} />
        </span>
      </div>
      <input
        id={id}
        type="range"
        className={accent || ""}
        min={logScale ? 0 : min}
        max={logScale ? 1 : max}
        step={logScale ? 0.001 : step}
        value={toPos(value)}
        disabled={disabled}
        onChange={(e) => {
          let v = fromPos(Number(e.target.value));
          if (logScale && step) v = Math.round(v / step) * step;
          onChange(v);
        }}
      />
      {sub && <div className="-mt-0.5 text-[10.5px] text-ink3">{sub}</div>}
    </div>
  );
}

export function Segmented({ options, value, onChange, size = "sm", label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[4px] border border-line2 bg-bg p-[2px]">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-[3px] px-2 ${size === "sm" ? "py-[3px] text-[11.5px]" : "py-1 text-[12.5px]"} font-medium transition-colors ${
            value === o.value ? "bg-raised text-ink shadow-[inset_0_0_0_1px_var(--line-2)]" : "text-ink3 hover:text-ink2"
          }`}
          title={o.title}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Btn({ children, onClick, variant = "ghost", title, disabled, className = "" }) {
  const v =
    variant === "primary"
      ? "border-[#2bb9ac80] bg-[#2bb9ac1a] text-[#5fd3c7] hover:bg-[#2bb9ac30]"
      : "border-line2 text-ink2 hover:border-ink3 hover:text-ink";
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={`inline-flex items-center gap-1 rounded-[3px] border px-2 py-[3px] text-[11.5px] font-medium ${v} ${className}`}>
      {children}
    </button>
  );
}

export function SectionTitle({ children, right, id }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 id={id} className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-ink2">
        {children}
      </h2>
      {right}
    </div>
  );
}

// ---- formatting ---------------------------------------------------------------------
export const fmtMoney = (v, digits) => {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(digits ?? (a >= 1e10 ? 0 : 1))}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(digits ?? (a >= 1e8 ? 0 : 1))}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(digits ?? 0)}K`;
  return `${s}$${a.toFixed(0)}`;
};
export const fmtNum = (v, d = 0) => (v === null || v === undefined || !isFinite(v) ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }));
export const fmtPct = (v, d = 0) => (isFinite(v) ? `${(v * 100).toFixed(d)}%` : "—");
export const fmtEnergy = (mwh) => {
  if (!isFinite(mwh)) return "—";
  const a = Math.abs(mwh);
  if (a >= 1e6) return `${(mwh / 1e6).toFixed(1)} TWh`;
  if (a >= 1e3) return `${(mwh / 1e3).toFixed(1)} GWh`;
  return `${mwh.toFixed(0)} MWh`;
};
export const fmtLitres = (l) => {
  const a = Math.abs(l);
  if (a >= 1e9) return `${(l / 1e9).toFixed(2)} billion L`;
  if (a >= 1e6) return `${(l / 1e6).toFixed(1)} million L`;
  if (a >= 1e3) return `${(l / 1e3).toFixed(0)},000 L`;
  return `${l.toFixed(0)} L`;
};
export const roundTo = (v, step) => Math.round(v / step) * step;
export const monthLabel = (m, start = new Date(Date.UTC(2026, 10, 1))) => {
  const d = new Date(start);
  d.setUTCMonth(d.getUTCMonth() + m);
  return d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
};
