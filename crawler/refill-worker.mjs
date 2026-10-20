/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Choix des prochaines URLs à visiter, dans un thread à part : sur une file d'un million d'URLs la
 * requête prend quelques secondes, et le crawler continue de travailler pendant ce temps.
 * (JavaScript simple, sans TypeScript, pour tourner dans un Worker sans chargeur particulier.)
 */

import { DatabaseSync } from "node:sqlite";
import { parentPort, workerData } from "node:worker_threads";

const { dbPath, shard, shards } = workerData;
const db = new DatabaseSync(dbPath, { readOnly: true });
db.exec("PRAGMA busy_timeout = 8000");
db.function("shard_of", { deterministic: true }, (host) => {
  let h = 0;
  for (const ch of String(host)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % shards;
});
const mine = shards > 1 ? ` AND shard_of(host) = ${shard}` : "";

// quelques URLs par site sur des milliers de sites : la politesse par site ne bloque plus les requêtes
const due = db.prepare(
  `SELECT url, host, depth, interval, attempts FROM (
     -- les URLs jamais essayées d'abord : après une panne, les échecs ne bouchent pas la file
     SELECT url, host, depth, interval, attempts, next_at, row_number() OVER (PARTITION BY host ORDER BY attempts, depth, next_at) AS rn
     FROM frontier WHERE state = 0 AND next_at <= ?${mine}
   ) WHERE rn <= 3 ORDER BY attempts, rn, depth, next_at LIMIT ?`,
);
const soonest = db.prepare(`SELECT url, host, depth, interval, attempts FROM frontier WHERE state = 0 AND next_at > ?${mine} ORDER BY next_at LIMIT 300`);

parentPort.on("message", ({ now, limit, idle }) => {
  try {
    let rows = due.all(now, limit);
    // plus rien d'échu : on avance les prochaines re-visites plutôt que de rester inactif
    if (!rows.length && idle) rows = soonest.all(now);
    parentPort.postMessage({ rows: rows.map((r) => ({ ...r })) });
  } catch (err) {
    parentPort.postMessage({ rows: [], error: String(err?.message ?? err) });
  }
});
