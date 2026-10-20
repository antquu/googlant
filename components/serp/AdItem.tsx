/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { AdSlot } from "@/lib/ads/select";
import { breadcrumb } from "@/lib/format";
import { Favicon } from "../Favicon";

// présenté comme un résultat ordinaire, seule la mention « Sponsorisé » le distingue
export function AdItem({ slot, index }: { slot: AdSlot; index: number }) {
  const c = slot.campaign;
  return (
    <article className="result ad" style={{ animationDelay: `${index * 40}ms` }} aria-label={`Résultat sponsorisé : ${c.advertiser}`}>
      <span className="ad-label">Sponsorisé</span>
      <a href={c.url} className="result-site" tabIndex={-1} target="_blank" rel="noopener sponsored">
        <Favicon src={c.favicon} host={c.displayUrl} />
        <span className="result-site-text">
          <span className="result-site-name">{c.advertiser}</span>
          <span className="result-url">{breadcrumb(`https://${c.displayUrl}`)}</span>
        </span>
      </a>
      <h3 className="result-title">
        <a href={c.url} target="_blank" rel="noopener sponsored">
          {c.headline}
        </a>
      </h3>
      <p className="result-snippet">{c.description}</p>
    </article>
  );
}
