/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DatabaseSync } from "node:sqlite";
import { setMeta, tx } from "./db";
import { QUALITY_SQL } from "./write";

export function computePageRank(db: DatabaseSync, iterations = 40): { pages: number; links: number; ms: number } {
  const t0 = performance.now();
  const ids = (db.prepare("SELECT id FROM pages ORDER BY id").all() as { id: number }[]).map((r) => r.id);
  const N = ids.length;
  if (!N) return { pages: 0, links: 0, ms: 0 };
  const index = new Map<number, number>();
  ids.forEach((id, i) => index.set(id, i));

  const out: number[][] = Array.from({ length: N }, () => []);
  const inlinks = new Int32Array(N);
  let edgeCount = 0;
  for (const e of db.prepare("SELECT l.src AS s, p.id AS d FROM links l JOIN pages p ON p.url = l.dst WHERE l.src <> p.id").iterate() as Iterable<{ s: number; d: number }>) {
    const a = index.get(e.s);
    const b = index.get(e.d);
    if (a === undefined || b === undefined) continue;
    out[a].push(b);
    inlinks[b]++;
    edgeCount++;
  }

  let pr = new Float64Array(N).fill(1 / N);
  for (let it = 0; it < iterations; it++) {
    const next = new Float64Array(N).fill(0.15 / N);
    let dangling = 0;
    for (let i = 0; i < N; i++) {
      const o = out[i];
      if (!o.length) dangling += pr[i];
      else {
        const share = (0.85 * pr[i]) / o.length;
        for (const j of o) next[j] += share;
      }
    }
    const d = (0.85 * dangling) / N;
    let delta = 0;
    for (let i = 0; i < N; i++) {
      next[i] += d;
      delta += Math.abs(next[i] - pr[i]);
    }
    pr = next;
    if (delta < 1e-9) break;
  }

  let lo = Infinity;
  let hi = -Infinity;
  const logs = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    logs[i] = Math.log(pr[i] * N);
    lo = Math.min(lo, logs[i]);
    hi = Math.max(hi, logs[i]);
  }

  // écriture par petits lots : le crawler, qui écrit en même temps, n'attend jamais longtemps
  const upd = db.prepare("UPDATE pages SET rank = ?, inlinks = ? WHERE id = ?");
  const quality = db.prepare(`UPDATE pages SET quality = ${QUALITY_SQL} WHERE id >= ? AND id <= ?`);
  const BATCH = 2000;
  for (let start = 0; start < N; start += BATCH) {
    const end = Math.min(N, start + BATCH);
    tx(db, () => {
      for (let i = start; i < end; i++) upd.run(hi > lo ? +((logs[i] - lo) / (hi - lo)).toFixed(4) : 0, inlinks[i], ids[i]);
      quality.run(ids[start], ids[end - 1]);
    });
  }
  setMeta(db, "pagerank", { at: Date.now(), pages: N, links: edgeCount });
  return { pages: N, links: edgeCount, ms: Math.round(performance.now() - t0) };
}
