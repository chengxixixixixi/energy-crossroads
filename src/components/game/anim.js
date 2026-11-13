import { useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Smoothly tween a number toward its target (before/after animations).
export function useTween(target, dur = 700) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  const raf = useRef(0);
  useEffect(() => {
    if (!isFinite(target)) { setV(target); return; }
    if (reduced()) { setV(target); from.current = target; return; }
    const start = performance.now();
    const a = isFinite(from.current) ? from.current : target;
    cancelAnimationFrame(raf.current);
    const tick = (now) => {
      const k = Math.min(1, (now - start) / dur);
      const e = 1 - (1 - k) ** 3;
      const x = a + (target - a) * e;
      setV(x);
      from.current = x;
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, dur]);
  return v;
}

export function Tw({ value, fmt, dur }) {
  const v = useTween(value, dur);
  return fmt(v);
}
