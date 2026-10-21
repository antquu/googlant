/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "server-only";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getMeta, openDb } from "../db/db";
import { seedIfEmpty } from "../db/import";

const g = globalThis as unknown as { __googlantDb?: DatabaseSync | null; __googlantDbFail?: number };

export function getDb(): DatabaseSync | null {
  if (g.__googlantDb) return g.__googlantDb;
  // échec récent (base verrouillée au démarrage...) : nouvel essai au bout de 5 s au lieu de rester en panne
  if (Date.now() - (g.__googlantDbFail ?? 0) < 5_000) return null;
  try {
    const db = openDb();
    if (seedIfEmpty(db, join(process.cwd(), "data", "seed.jsonl.gz"), join(process.cwd(), "crawler", "directory.json"))) {
      console.log("[googlant] index initialisé depuis data/seed.jsonl.gz");
    }
    g.__googlantDb = db;
  } catch (err) {
    console.error("[googlant] base inaccessible :", err);
    g.__googlantDb = null;
    g.__googlantDbFail = Date.now();
  }
  return g.__googlantDb;
}

export interface IndexStats {
  docs: number;
  hosts: number;
  images: number;
  queued: number;
  crawlerAt: number | null;
  pagesPerMinute: number;
  builtAt: string;
}

export function getStats(db: DatabaseSync): IndexStats {
  const live = getMeta<{ at: number; pages: number; hosts: number; images: number; queued: number; perMinute: number }>(db, "stats");
  const rank = getMeta<{ at: number }>(db, "pagerank");
  if (live && Date.now() - live.at < 5 * 60 * 1000) {
    return { docs: live.pages, hosts: live.hosts, images: live.images, queued: live.queued, crawlerAt: live.at, pagesPerMinute: live.perMinute, builtAt: new Date(rank?.at ?? live.at).toISOString() };
  }
  const c = db
    .prepare("SELECT (SELECT count(*) FROM pages) AS docs, (SELECT count(*) FROM hosts WHERE pages > 0) AS hosts, (SELECT count(*) FROM images) AS images, (SELECT count(*) FROM frontier WHERE state = 0) AS queued")
    .get() as { docs: number; hosts: number; images: number; queued: number };
  return { ...c, crawlerAt: null, pagesPerMinute: 0, builtAt: new Date(rank?.at ?? Date.now()).toISOString() };
}
