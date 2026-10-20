/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { timeAgo } from "@/lib/format";
import type { IndexedDoc } from "@/lib/search/types";
import { Favicon } from "../Favicon";

export function LatestCards({ docs }: { docs: IndexedDoc[] }) {
  return (
    <div className="cards">
      {docs.map((d, i) => (
        <a key={d.id} href={d.url} className="card" style={{ animationDelay: `${i * 50}ms` }}>
          <div className="card-top">
            <Favicon src={d.favicon} host={d.host} small />
            <b>{d.siteName}</b>
            <span className="card-time">{timeAgo(d.crawledAt)}</span>
          </div>
          <div className="card-title">{d.title}</div>
          <p className="card-quote">“{(d.description || d.text).slice(0, 220)}”</p>
        </a>
      ))}
    </div>
  );
}
