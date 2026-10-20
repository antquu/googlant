"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useCallback, useEffect, useState } from "react";
import { Favicon } from "../Favicon";
import { FastImg } from "../FastImg";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, ExternalIcon } from "../icons";

export interface GridImage {
  src: string;
  thumb?: string;
  alt: string;
  pageUrl: string;
  pageTitle: string;
  host: string;
  favicon?: string;
}

const PAGE = 40;

export function ImageGrid({ images }: { images: GridImage[] }) {
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  // 40 images d'abord (chargement rapide), 40 de plus à chaque « Charger plus »
  const [count, setCount] = useState(PAGE);
  const usable = images.filter((i) => !broken.has(i.src));
  const visible = usable.slice(0, count);
  const current = open !== null ? visible[open] : null;

  const move = useCallback((dir: number) => setOpen((o) => (o === null ? o : (o + dir + visible.length) % visible.length)), [visible.length]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") move(1);
      if (e.key === "ArrowLeft") move(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, move]);

  const markBroken = (src: string) => setBroken((b) => new Set(b).add(src));
  const related = current ? visible.filter((i) => i !== current && (i.pageUrl === current.pageUrl || i.host === current.host)).slice(0, 6) : [];

  return (
    <div className="images-layout" data-open={current ? "1" : undefined}>
      <div className="image-grid">
        {visible.map((img, i) => (
          <button
            key={img.src}
            type="button"
            className="image-tile"
            data-selected={i === open ? "1" : undefined}
            style={{ animationDelay: `${Math.min(i, 16) * 30}ms` }}
            onClick={() => setOpen(i === open ? null : i)}
            title={img.alt}
          >
            <FastImg src={img.thumb ?? img.src} width={240} alt={img.alt} onFail={() => markBroken(img.src)} />
            <span className="image-caption">
              <span className="image-caption-site">
                <Favicon src={img.favicon} host={img.host} small /> {img.host}
              </span>
              <span className="image-caption-alt">{img.alt}</span>
            </span>
          </button>
        ))}
      </div>
      {usable.length > count && (
        <div className="load-more">
          <button type="button" className="load-more-btn" onClick={() => setCount((c) => c + PAGE)}>
            Charger plus d'images
          </button>
        </div>
      )}

      {current && (
        <aside className="image-panel" key={current.src} aria-label="Aperçu de l'image">
          <div className="image-panel-top">
            <span className="image-caption-site">
              <Favicon src={current.favicon} host={current.host} small /> {current.host}
            </span>
            <div className="image-panel-nav">
              <button type="button" className="icon-btn" aria-label="Image précédente" onClick={() => move(-1)}>
                <ChevronLeftIcon />
              </button>
              <button type="button" className="icon-btn" aria-label="Image suivante" onClick={() => move(1)}>
                <ChevronRightIcon />
              </button>
              <button type="button" className="icon-btn" aria-label="Fermer" onClick={() => setOpen(null)}>
                <CloseIcon />
              </button>
            </div>
          </div>

          <a href={current.pageUrl} className="image-panel-media" target="_blank" rel="noopener">
            <img
              src={current.src}
              alt={current.alt}
              referrerPolicy="no-referrer"
              onError={(e) => {
                if (current.thumb && e.currentTarget.src !== current.thumb) e.currentTarget.src = current.thumb;
              }}
            />
          </a>

          <h2 className="image-panel-title">{current.pageTitle}</h2>
          <p className="image-panel-alt">{current.alt}</p>

          <div className="image-panel-actions">
            <a href={current.pageUrl} className="pill pill-primary pill-sm" target="_blank" rel="noopener">
              Visiter la page <ArrowRightIcon />
            </a>
            <a href={current.src} className="pill pill-outlined pill-sm" target="_blank" rel="noopener noreferrer">
              Ouvrir l&apos;image <ExternalIcon />
            </a>
          </div>

          {related.length > 0 && (
            <div className="image-panel-related">
              <h3>Images associées</h3>
              <div>
                {related.map((r) => (
                  <button key={r.src} type="button" onClick={() => setOpen(visible.indexOf(r))} aria-label={r.alt}>
                    <FastImg src={r.thumb ?? r.src} width={110} alt="" onFail={() => markBroken(r.src)} />
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="image-panel-note">Les images peuvent être protégées par le droit d&apos;auteur.</p>
        </aside>
      )}
    </div>
  );
}
