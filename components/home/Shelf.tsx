"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Book } from "../Book";
import { CoverArt, hashString, paletteFor } from "../CoverArt";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons";

export interface ShelfDoc {
  id: number;
  url: string;
  host: string;
  siteName: string;
  title: string;
  inlinks: number;
}

const SELECTED_WIDTH = 176;

export function Shelf({ docs }: { docs: ShelfDoc[] }) {
  const viewport = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  // livre survolé : son numéro et son titre s'affichent sous l'étagère, comme sur Grokipedia
  const [hovered, setHovered] = useState<number | null>(null);
  const [outgoing, setOutgoing] = useState<{ i: number; key: number } | null>(null);
  const shownRef = useRef<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = () => {
    const el = viewport.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };

  useEffect(() => {
    updateEdges();
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, []);

  useEffect(() => {
    if (selected === null) return;
    const t = setTimeout(() => itemRefs.current[selected]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }), 120);
    return () => clearTimeout(t);
  }, [selected]);

  const select = (i: number) => {
    setLeaving(false);
    setSelected(i);
  };

  const putBack = () => {
    if (selected === null) return;
    setLeaving(true);
    setTimeout(() => {
      setSelected(null);
      setLeaving(false);
    }, 380);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") return putBack();
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const from = selected ?? (dir === 1 ? -1 : docs.length);
      select(Math.min(docs.length - 1, Math.max(0, from + dir)));
    }
    if (e.key === "Enter" && selected !== null) window.location.href = docs[selected].url;
  };

  const scrollBy = (dir: number) => viewport.current?.scrollBy({ left: dir * viewport.current.clientWidth * 0.8, behavior: "smooth" });

  const current = selected !== null ? docs[selected] : null;
  const labelIndex = selected ?? hovered;

  // fondu enchaîné : l'ancien titre s'efface pendant que le nouveau arrive
  useEffect(() => {
    const prev = shownRef.current;
    shownRef.current = labelIndex;
    if (prev === null || prev === labelIndex) return;
    setOutgoing({ i: prev, key: Date.now() });
    const t = setTimeout(() => setOutgoing(null), 260);
    return () => clearTimeout(t);
  }, [labelIndex]);

  const rank = (i: number) => String(i + 1).padStart(2, "0");

  return (
    <div onKeyDown={onKeyDown}>
      <div className="section-heading">
        <div>
          <h2>Les plus cités</h2>
          <p>Les pages qui reçoivent le plus de liens dans l&apos;index (PageRank).</p>
        </div>
        <div className="shelf-navigation">
          <button className="shelf-nav" aria-label="Livres précédents" disabled={!edges.left} onClick={() => scrollBy(-1)}>
            <ChevronLeftIcon />
          </button>
          <button className="shelf-nav" aria-label="Livres suivants" disabled={!edges.right} onClick={() => scrollBy(1)}>
            <ChevronRightIcon />
          </button>
        </div>
      </div>

      <div ref={viewport} className="shelf-viewport" data-left={edges.left ? "1" : undefined} data-right={edges.right ? "1" : undefined} onScroll={updateEdges}>
        <div className="shelf-row" data-has-selection={selected !== null ? "1" : undefined} role="listbox" aria-label="Étagère des pages les plus citées">
          {docs.map((d, i) => {
            const h = hashString(d.url);
            const { paper, ink } = paletteFor(d.url);
            const width = 32 + (h % 4) * 3;
            const height = 262 + ((h >> 4) % 4) * 10;
            const isSel = selected === i;
            return (
              <div
                key={d.id}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                className="shelf-item"
                data-selected={isSel ? "1" : undefined}
                style={{ "--d": `${Math.round(width)}px`, "--h": `${height}px`, "--paper": paper, "--ink": ink, "--sel-w": `${SELECTED_WIDTH}px` } as CSSProperties}
              >
                <button
                  className="shelf-spine"
                  role="option"
                  aria-selected={isSel}
                  aria-label={d.title}
                  tabIndex={isSel || (selected === null && i === 0) ? 0 : -1}
                  onClick={() => select(i)}
                  onPointerEnter={() => setHovered(i)}
                  onPointerLeave={() => setHovered((v) => (v === i ? null : v))}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered((v) => (v === i ? null : v))}
                  data-hovered={hovered === i && !isSel ? "1" : undefined}
                >
                  <span className="shelf-spine-title">{d.title}</span>
                  <span className="shelf-spine-g">G</span>
                </button>
                {isSel && (
                  <a className="shelf-book" href={d.url} data-leaving={leaving ? "1" : undefined} aria-label={`Ouvrir ${d.title}`}>
                    <Book
                      items={[{ key: String(d.id), art: <CoverArt seed={d.url} title={d.title} />, kicker: d.siteName, title: d.title, foot: d.host }]}
                      style={{ "--paper": "hsl(0 0% 92%)" } as CSSProperties}
                    />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="shelf-label" data-on={labelIndex !== null ? "1" : undefined} aria-live="polite">
        <p className="sr-only">Survolez un livre pour voir son titre, sélectionnez-le pour voir sa couverture, puis à nouveau pour l&apos;ouvrir. Flèches ← → pour parcourir, Échap pour le ranger.</p>
        <div className="shelf-label-stage">
          {labelIndex !== null && (
            <div className="shelf-label-copy shelf-label-in" key={labelIndex}>
              <span className="shelf-label-rank tabular">{rank(labelIndex)}</span>
              <span className="shelf-label-title">{docs[labelIndex].title}</span>
              {current && <span className="shelf-label-meta">{current.host}</span>}
            </div>
          )}
          {outgoing && outgoing.i !== labelIndex && docs[outgoing.i] && (
            <div className="shelf-label-copy shelf-label-out" key={`out-${outgoing.key}`} aria-hidden>
              <span className="shelf-label-rank tabular">{rank(outgoing.i)}</span>
              <span className="shelf-label-title">{docs[outgoing.i].title}</span>
            </div>
          )}
        </div>
        {current && (
          <div className="shelf-label-actions">
            <a className="shelf-label-cta" href={current.url}>
              Ouvrir la page →
            </a>
            <button className="shelf-return" onClick={putBack}>
              Ranger
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
