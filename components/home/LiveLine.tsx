"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useRef, useState } from "react";
import { timeAgo } from "@/lib/format";
import { useLive, type LiveItem, type LivePayload } from "@/lib/live";
import { LiveNumber } from "../LiveNumber";

export type { LiveItem };

export function LiveLine({ initial }: { initial: LivePayload }) {
  const data = useLive(initial) ?? initial;
  const [i, setI] = useState(0);
  const [now, setNow] = useState<number | null>(null);
  const lastTop = useRef(initial.items[0]?.id);

  // nouvelle page indexée : on la montre tout de suite
  useEffect(() => {
    setNow(Date.now());
    if (data.items[0] && data.items[0].id !== lastTop.current) {
      lastTop.current = data.items[0].id;
      setI(0);
    }
  }, [data]);

  useEffect(() => {
    if (data.items.length < 2) return;
    const id = setInterval(() => {
      setI((v) => (v + 1) % Math.min(data.items.length, 8));
      setNow(Date.now());
    }, 4200);
    return () => clearInterval(id);
  }, [data.items.length]);

  const item = data.items[i] ?? data.items[0];
  const online = data.stats.crawlerAt !== null && now !== null && now - data.stats.crawlerAt < 60_000;

  return (
    <div className="live-line">
      <div className="live-line-ticker">
        {item && (
          <div key={`${item.id}-${i}`} className="hint-word active" style={{ position: "absolute" }}>
            <span className="live-dot" data-off={online ? undefined : "1"} aria-hidden />
            <span>GooglantBot ·</span>
            <a href={item.url}>
              <b>{item.title}</b>
            </a>
            <span>· {item.host}</span>
            {now && <span>· indexé {timeAgo(item.crawledAt, now)}</span>}
          </div>
        )}
      </div>
      <div className="live-line-stats">
        {online && (
          <>
            <span className="hide-sm">
              <b>
                <LiveNumber value={data.stats.pagesPerMinute} />
              </b>{" "}
              pages/min
            </span>
            <span className="hide-sm">·</span>
          </>
        )}
        <span>
          <b>
            <LiveNumber value={data.stats.docs} />
          </b>{" "}
          pages
        </span>
        <span className="hide-sm">·</span>
        <span className="hide-sm">
          <b>
            <LiveNumber value={data.stats.hosts} />
          </b>{" "}
          sites
        </span>
      </div>
    </div>
  );
}
