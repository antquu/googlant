"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useState } from "react";
import { Book, type BookItem } from "../Book";
import { TransitArt } from "../CoverArt";

export interface HeroCampaign {
  id: string;
  url: string;
  cityName: string;
  network: string;
  displayUrl: string;
  km: number | null;
  lines: [string, string][];
  cover: { paper: string; ink: string };
}

export function HeroBook({ campaigns }: { campaigns: HeroCampaign[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  // 6 s par ville ; un clic sur un point remet le compte à zéro (pas de changement juste après)
  useEffect(() => {
    if (paused || campaigns.length < 2) return;
    const id = setTimeout(() => setActive((a) => (a + 1) % campaigns.length), 6000);
    return () => clearTimeout(id);
  }, [paused, campaigns.length, active]);

  const items: BookItem[] = campaigns.map((c) => ({
    key: c.id,
    art: <TransitArt lines={c.lines} paper={c.cover.paper} ink={c.cover.ink} label="GreLines" />,
    kicker: `Sponsorisé · ${c.network}`,
    title: `Horaires en temps réel — ${c.cityName}`,
    foot: c.displayUrl,
    spine: `GreLines ${c.cityName}`,
    jacket: c.cover,
  }));
  const current = campaigns[active];

  return (
    <div className="hero-book" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <a href={current.url} target="_blank" rel="noopener sponsored" aria-label={`GreLines ${current.cityName} (lien sponsorisé)`}>
        <Book items={items} active={active} size="lg" spin />
      </a>
      <div className="hero-book-caption">
        <span>
          Sponsorisé · <b>GreLines {current.cityName}</b>
          {current.km !== null && ` · à ${current.km} km`}
        </span>
      </div>
      <div className="dots" role="tablist" aria-label="Villes GreLines">
        {campaigns.map((c, i) => (
          <button key={c.id} className="dot" role="tab" aria-selected={i === active} aria-label={c.cityName} data-on={i === active ? "1" : undefined} onClick={() => setActive(i)} />
        ))}
      </div>
    </div>
  );
}
