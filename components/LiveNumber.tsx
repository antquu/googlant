"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useRef, useState } from "react";

// nombre qui défile jusqu'à sa nouvelle valeur quand les chiffres en direct changent
export function LiveNumber({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const [bump, setBump] = useState(false);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const t0 = performance.now();
    const duration = Math.min(1400, 400 + Math.abs(value - start) * 8);
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const eased = 1 - (1 - k) ** 3;
      setShown(Math.round(start + (value - start) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    // onglet en arrière-plan : requestAnimationFrame est suspendu, on pose quand même la bonne valeur
    const settle = setTimeout(() => {
      setShown(value);
      from.current = value;
    }, duration + 50);
    setBump(true);
    const off = setTimeout(() => setBump(false), 700);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      clearTimeout(off);
      from.current = value;
    };
  }, [value]);

  return <span className={`tabular live-number ${bump ? "is-bump" : ""} ${className ?? ""}`}>{shown.toLocaleString("fr-FR")}</span>;
}
