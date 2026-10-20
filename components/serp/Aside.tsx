/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { CSSProperties } from "react";
import type { AdSlot } from "@/lib/ads/select";
import { LANGS, formatDate, timeAgo } from "@/lib/format";
import { cleanTitle } from "@/lib/db/write";
import type { IndexedDoc } from "@/lib/search/types";
import { Book } from "../Book";
import { Favicon } from "../Favicon";
import { CoverArt, TransitArt } from "../CoverArt";

export function KnowledgePanel({ doc, siblings }: { doc: IndexedDoc; siblings: IndexedDoc[] }) {
  const desc = doc.description || doc.text.slice(0, 280);
  const title = cleanTitle(doc.title);

  return (
    <section className="kp" aria-label="Panneau de connaissances">
      <div className="kp-book">
        <a href={doc.url} aria-label={title}>
          <Book size="sm" items={[{ key: String(doc.id), art: <CoverArt seed={doc.url} title={doc.title} />, kicker: doc.siteName, title, foot: doc.host }]} />
        </a>
      </div>
      <h2 className="kp-title">{title}</h2>
      <div className="kp-sub">{doc.siteName}</div>
      <p className="kp-desc">
        {desc.length > 320 ? desc.slice(0, 320) + "…" : desc}{" "}
        <a href={doc.url}>{doc.host}</a>
      </p>
      <dl className="kp-facts">
        <dt>Domaine</dt>
        <dd>{doc.host}</dd>
        {doc.lang && (
          <>
            <dt>Langue</dt>
            <dd>{LANGS[doc.lang] ?? doc.lang}</dd>
          </>
        )}
        <dt>Liens entrants</dt>
        <dd className="tabular">{doc.inlinks}</dd>
        <dt>PageRank</dt>
        <dd>
          <span className="rank-meter" style={{ "--v": doc.rank } as CSSProperties}>
            <i />
            <span className="tabular">{(doc.rank * 10).toFixed(1)}/10</span>
          </span>
        </dd>
        {doc.publishedAt && (
          <>
            <dt>Publié</dt>
            <dd>{formatDate(doc.publishedAt)}</dd>
          </>
        )}
        <dt>Source</dt>
        <dd>{doc.directory ? "Annuaire Googlant" : `Crawlé ${timeAgo(doc.crawledAt)}`}</dd>
      </dl>
      {siblings.length > 0 && (
        <div className="kp-section">
          <h3>Sur le même site</h3>
          <ul className="kp-links">
            {siblings.map((s) => (
              <li key={s.id}>
                <a href={s.url}>{cleanTitle(s.title)}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function SideAd({ slot }: { slot: AdSlot }) {
  const c = slot.campaign;
  return (
    <a className="side-ad" href={c.url} target="_blank" rel="noopener sponsored">
      <Book
        interactive
        items={[
          {
            key: c.id,
            art: <TransitArt lines={c.lines} paper={c.cover.paper} ink={c.cover.ink} label="GreLines" />,
            kicker: "Sponsorisé",
            title: c.cityName,
            foot: c.displayUrl,
            spine: `GreLines ${c.cityName}`,
            jacket: c.cover,
          },
        ]}
      />
      <div>
        <span className="ad-label side-ad-label">
          <Favicon src={c.favicon} host={c.displayUrl} small /> Sponsorisé
        </span>
        <div className="side-ad-title">GreLines {c.cityName}</div>
        <p className="side-ad-text">
          Prochains passages {c.network.split(" · ")[0]} en temps réel. Gratuit et sans compte.
        </p>
      </div>
    </a>
  );
}
