"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useState, type CSSProperties } from "react";
import { Book } from "../Book";
import { CoverArt } from "../CoverArt";
import { ArrowRightIcon } from "../icons";

export interface FeaturedDoc {
  id: number;
  url: string;
  host: string;
  siteName: string;
  title: string;
  description: string;
  inlinks: number;
}

const DURATION = 7000;

export function Featured({ docs }: { docs: FeaturedDoc[] }) {
  const [active, setActive] = useState(0);
  const [swap, setSwap] = useState(0);

  const next = () => {
    const reduced = document.documentElement.dataset.motion === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) select((active + 1) % docs.length);
  };
  const select = (i: number) => {
    setActive(i);
    setSwap((s) => s + 1);
  };

  const doc = docs[active];
  if (!doc) return null;

  return (
    <div className="featured" style={{ "--featured-ms": `${DURATION}ms` } as CSSProperties}>
      <a className="featured-stage" href={doc.url} aria-label={doc.title}>
        <Book
          size="lg"
          active={active}
          spin
          items={docs.map((d) => ({
            key: String(d.id),
            art: <CoverArt seed={d.url} title={d.title} />,
            kicker: d.siteName,
            title: d.title,
            foot: d.host,
          }))}
        />
      </a>

      <div className="featured-copy" data-swap={swap ? "1" : undefined}>
        <div className="featured-swap" key={swap}>
          <div className="featured-kicker">
            <span>{doc.siteName}</span>
            <span aria-hidden>·</span>
            <span>
              {doc.inlinks} lien{doc.inlinks > 1 ? "s" : ""} entrant{doc.inlinks > 1 ? "s" : ""}
            </span>
          </div>
          <a href={doc.url} className="featured-title" style={{ display: "block" }}>
            {doc.title}
          </a>
          <p className="featured-dek">{doc.description || "Aucune description fournie par ce site."}</p>
        </div>
        <a href={doc.url} className="featured-cta">
          Visiter {doc.host} <ArrowRightIcon />
        </a>

        <ol className="featured-list">
          {docs.map((d, i) => (
            <li key={d.id} className="featured-item" data-active={i === active ? "1" : undefined}>
              <button type="button" onClick={() => select(i)} aria-current={i === active}>
                <span className="featured-item-num">{String(i + 1).padStart(2, "0")}</span>
                <span className="featured-item-title">{d.title}</span>
                <span className="featured-item-host">{d.host}</span>
                <span className="featured-progress" key={i === active ? `p-${swap}` : "p"} onAnimationEnd={i === active ? next : undefined} />
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
