"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";

export interface BookItem {
  key: string;
  art: ReactNode;
  kicker?: string;
  title: string;
  foot?: string;
  spine?: string;
  jacket?: { paper: string; ink: string };
}

interface BookProps {
  items: BookItem[];
  active?: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  still?: boolean;
  className?: string;
  style?: CSSProperties;
  /** au changement de livre : un tour complet sur lui-même, la couverture change quand il montre son dos */
  spin?: boolean;
}

export function Book({ items, active = 0, size = "md", interactive = true, still = false, className = "", style, spin = false }: BookProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [hopping, setHopping] = useState(false);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  // alterne a / b : changer de nom d'animation la relance depuis le début, même au milieu d'un tour
  const [spinTurn, setSpinTurn] = useState(0);
  // livre affiché : en mode « spin », il ne change qu'à mi-tour (dos tourné vers nous)
  const [shown, setShown] = useState(active);
  const prev = useRef(active);

  useEffect(() => {
    if (prev.current === active) return;
    if (spin) {
      prev.current = active;
      setSpinTurn((n) => n + 1);
      setSpinning(true);
      // demi-tour pile (dos du livre face à nous) sur un tour de 0,9 s
      const swap = setTimeout(() => setShown(active), 450);
      const done = setTimeout(() => setSpinning(false), 950);
      return () => {
        clearTimeout(swap);
        clearTimeout(done);
        setShown(active);
      };
    }
    setShown(active);
    setLeaving(prev.current);
    prev.current = active;
    setHopping(true);
    const t1 = setTimeout(() => setHopping(false), 800);
    const t2 = setTimeout(() => setLeaving(null), 420);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [active]);

  const item = items[shown] ?? items[0];
  if (!item) return null;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!interactive || e.pointerType !== "mouse") return;
    const el = sceneRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--px", `${(x * 12).toFixed(2)}deg`);
    el.style.setProperty("--py", `${(-y * 8).toFixed(2)}deg`);
  };
  const onLeave = () => {
    sceneRef.current?.style.setProperty("--px", "0deg");
    sceneRef.current?.style.setProperty("--py", "0deg");
  };

  const sizeClass = size === "lg" ? "book-lg" : size === "sm" ? "book-sm" : "";
  const jacketStyle = item.jacket ? ({ "--jacket-paper": item.jacket.paper, "--jacket-ink": item.jacket.ink } as CSSProperties) : undefined;

  return (
    <div
      ref={sceneRef}
      className={`book-scene ${sizeClass} ${className}`}
      data-interactive={interactive ? "1" : undefined}
      data-jacket={item.jacket ? "1" : undefined}
      data-static={still ? "1" : undefined}
      data-spinning={spinning ? (spinTurn % 2 ? "a" : "b") : undefined}
      style={{ ...jacketStyle, ...style }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <div className="book-float">
        <div className="book-hop" data-hopping={hopping ? "1" : undefined} data-spin={spinning ? (spinTurn % 2 ? "a" : "b") : undefined}>
          <div className="book">
            <div className="book-face book-back" />
            <div className="book-face book-pages" />
            <div className="book-face book-top" />
            <div className="book-face book-spine">
              <span className="book-spine-text">{item.spine ?? item.title}</span>
              <div className="book-spine-band">G</div>
            </div>
            <div className="book-face book-front">
              {items.map((it, i) => (
                <div key={it.key} className="book-art" data-active={i === shown ? "1" : undefined} data-leaving={i === leaving ? "1" : undefined}>
                  {it.art}
                </div>
              ))}
              <div className="book-vignette" />
              <div className="book-light" />
              <div className="book-hinge" />
              <div className="book-sheen" />
              <div className="book-band" data-swap={items.length > 1 ? "1" : undefined}>
                <span className="book-band-kicker" key={`k-${item.key}`}>
                  {item.kicker}
                </span>
                <span className="book-band-title" key={`t-${item.key}`}>
                  {item.title}
                </span>
                <span className="book-band-foot" key={`f-${item.key}`}>
                  {item.foot}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="book-shadow book-shadow-ambient" />
      <div className="book-shadow book-shadow-contact" />
    </div>
  );
}
