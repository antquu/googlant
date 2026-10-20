/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { hostOf, normalizeUrl } from "../../crawler/url";
import { tx } from "./db";

export type SubmitResult =
  | { ok: true; url: string; host: string; status: "queued" | "refresh"; ahead: number }
  | { ok: false; error: string };

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|.*\.lan|.*\.home)$|^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|^\[?(::1|fc|fd|fe80)/i;

export function ensureSubmissions(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      id      INTEGER PRIMARY KEY,
      at      INTEGER NOT NULL,
      client  TEXT NOT NULL,
      url     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS submissions_client ON submissions(client, at);
  `);
}

export function submitUrl(db: DatabaseSync, raw: string, clientId: string): SubmitResult {
  const input = raw.trim().slice(0, 500);
  if (!input) return { ok: false, error: "Indiquez une adresse." };
  const url = normalizeUrl(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (!url) return { ok: false, error: "Cette adresse n'est pas valide." };
  const host = hostOf(url);
  if (!host.includes(".") || PRIVATE_HOST.test(host)) return { ok: false, error: "Seuls les sites publics peuvent être proposés." };

  ensureSubmissions(db);
  const now = Math.floor(Date.now() / 1000);
  const client = createHash("sha256").update(`googlant:${clientId}`).digest("hex").slice(0, 24);
  const recent = (db.prepare("SELECT count(*) AS n FROM submissions WHERE client = ? AND at > ?").get(client, now - 600) as { n: number }).n;
  if (recent >= 5) return { ok: false, error: "Doucement 🙂 Réessayez dans quelques minutes." };
  const global = (db.prepare("SELECT count(*) AS n FROM submissions WHERE at > ?").get(now - 3600) as { n: number }).n;
  if (global >= 500) return { ok: false, error: "Beaucoup de propositions en ce moment, réessayez plus tard." };

  return tx(db, () => {
    db.prepare("INSERT INTO submissions(at, client, url) VALUES (?, ?, ?)").run(now, client, url);
    db.prepare("DELETE FROM submissions WHERE at < ?").run(now - 7 * 86400);
    const known = db.prepare("SELECT 1 FROM pages WHERE url = ?").get(url);
    db.prepare(
      `INSERT INTO frontier(url, host, depth, next_at, interval, attempts, state) VALUES (?, ?, 0, 0, 21600, 0, 0)
       ON CONFLICT(url) DO UPDATE SET depth = 0, next_at = 0, attempts = 0, state = 0`,
    ).run(url, host);
    db.prepare("INSERT INTO hosts(host, queued, boost, sitemap_at) VALUES (?, 1, 400, NULL) ON CONFLICT(host) DO UPDATE SET queued = min(queued, 100), boost = max(boost, 400), sitemap_at = NULL").run(host);
    const ahead = (db.prepare("SELECT count(*) AS n FROM frontier WHERE next_at = 0 AND state = 0").get() as { n: number }).n - 1;
    return { ok: true as const, url, host, status: known ? ("refresh" as const) : ("queued" as const), ahead: Math.max(0, ahead) };
  });
}
