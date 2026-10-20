/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Link from "next/link";
import { breadcrumb, formatDate } from "@/lib/format";
import type { SearchHit } from "@/lib/search/types";
import { Favicon } from "../Favicon";

export function ResultItem({ hit, index, query, newTab }: { hit: SearchHit; index: number; query: string; newTab: boolean }) {
  const { doc } = hit;
  const target = newTab ? { target: "_blank", rel: "noopener" } : {};
  return (
    <article className="result" data-clustered={hit.clustered ? "1" : undefined} style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}>
      {!hit.clustered && (
        <a href={doc.url} className="result-site" tabIndex={-1} {...target}>
          <Favicon src={doc.favicon} host={doc.host} />
          <span className="result-site-text">
            <span className="result-site-name">{doc.siteName}</span>
            <span className="result-url">{breadcrumb(doc.url)}</span>
          </span>
        </a>
      )}
      <h3 className="result-title">
        <a href={doc.url} {...target}>
          {/\.pdf($|\?)/i.test(doc.url) && <span className="result-filetype">PDF</span>}
          {doc.title}
        </a>
      </h3>
      <p className="result-snippet">
        {doc.publishedAt && <span className="result-date">{formatDate(doc.publishedAt)} — </span>}
        {hit.snippet.map((part, i) => (part.hit ? <b key={i}>{part.text}</b> : <span key={i}>{part.text}</span>))}
      </p>
      {!hit.clustered && (
        <div className="result-meta">
          <Link prefetch={false} href={`/search?q=${encodeURIComponent(`${query.replace(/\s*site:\S+/g, "")} site:${doc.host}`)}`}>Plus de résultats de {doc.host}</Link>
        </div>
      )}
    </article>
  );
}
