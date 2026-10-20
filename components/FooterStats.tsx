"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import { useLive, type LiveStats } from "@/lib/live";
import { LiveNumber } from "./LiveNumber";

export function FooterStats({ initial }: { initial: LiveStats }) {
  const live = useLive({ stats: initial, items: [] });
  const stats = live?.stats ?? initial;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);
  const online = stats.crawlerAt !== null && now !== null && now - stats.crawlerAt < 60_000;
  // « Index » = dernière activité du crawler (publiée toutes les 5 s), pas le dernier calcul du PageRank
  const indexed = stats.crawlerAt ? timeAgo(new Date(stats.crawlerAt).toISOString(), now ?? stats.crawlerAt) : stats.builtAt ? timeAgo(stats.builtAt) : "—";

  return (
    <dl className="footer-stats">
      <div>
        <dt>Pages</dt>
        <dd>
          <LiveNumber value={stats.docs} />
        </dd>
      </div>
      <div>
        <dt>Sites</dt>
        <dd>
          <LiveNumber value={stats.hosts} />
        </dd>
      </div>
      <div>
        <dt>Index</dt>
        <dd>
          {online && <span className="live-dot" aria-hidden />} {online ? "à l'instant" : indexed}
        </dd>
      </div>
      {online && (
        <div>
          <dt>Pages / min</dt>
          <dd>
            <LiveNumber value={stats.pagesPerMinute} />
          </dd>
        </div>
      )}
    </dl>
  );
}
