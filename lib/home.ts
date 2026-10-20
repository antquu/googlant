/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { cleanTitle } from "./db/write";
import { loadDocs } from "./search/engine";
import type { IndexedDoc } from "./search/types";

const isHome = (d: IndexedDoc) => /^https?:\/\/[^/]+\/?$/.test(d.url);

const BOILERPLATE = /^about\b|^contribute|\bblog$|— blog|documentation contents|copyright|download|licen[cs]e|privacy|confidentialit|terms|cookies?|contact|sitemap|index of|module index|search|recherche|login|sign in|404|careers|changelog|release notes|getting started|table of contents|glossary|about this|mentions l[ée]gales|accueil$|conditions g[ée]n[ée]rales|accessibilit/i;

export function dekOf(d: IndexedDoc): string {
  return (d.description || d.text.slice(0, 320)).trim();
}

export function homeSelections(db: DatabaseSync) {
  const ids = (db.prepare("SELECT id FROM pages WHERE directory = 0 ORDER BY quality DESC LIMIT 400").all() as { id: number }[]).map((r) => r.id);
  const docs = loadDocs(db, ids, true);
  const byQuality = ids.map((id) => docs.get(id)!).filter((d) => d && !BOILERPLATE.test(d.title));

  const featured: IndexedDoc[] = [];
  const featuredHosts = new Set<string>();
  for (const d of byQuality) {
    if (featured.length >= 5) break;
    if (featuredHosts.has(d.host) || dekOf(d).length < 80 || isHome(d)) continue;
    featuredHosts.add(d.host);
    featured.push(d);
  }

  const shelf: IndexedDoc[] = [];
  const seenTitles = new Set<string>();
  const perHost = new Map<string, number>();
  const featuredIds = new Set(featured.map((d) => d.id));
  for (const d of byQuality) {
    if (shelf.length >= 32) break;
    const t = cleanTitle(d.title).toLowerCase();
    const n = perHost.get(d.host) ?? 0;
    if (featuredIds.has(d.id) || seenTitles.has(t) || t.length < 3 || t.length > 70 || n >= 4) continue;
    seenTitles.add(t);
    perHost.set(d.host, n + 1);
    shelf.push(d);
  }
  shelf.sort((a, b) => ((a.id * 2654435761) % 97) - ((b.id * 2654435761) % 97));

  const recentIds = (db.prepare("SELECT id FROM pages WHERE directory = 0 ORDER BY crawled_at DESC LIMIT 150").all() as { id: number }[]).map((r) => r.id);
  const recent = loadDocs(db, recentIds, true);
  const latest: IndexedDoc[] = [];
  const latestHosts = new Set<string>();
  for (const id of recentIds) {
    const d = recent.get(id);
    if (!d || latest.length >= 6) break;
    if (latestHosts.has(d.host) || (!d.description && d.text.length < 120)) continue;
    latestHosts.add(d.host);
    latest.push(d);
  }

  return { featured, shelf, latest };
}

export function siblingsOf(db: DatabaseSync, doc: IndexedDoc, limit = 4): IndexedDoc[] {
  const ids = (db.prepare("SELECT id FROM pages WHERE host = ? AND id <> ? ORDER BY rank DESC LIMIT ?").all(doc.host, doc.id, limit) as { id: number }[]).map((r) => r.id);
  const docs = loadDocs(db, ids);
  return ids.map((id) => docs.get(id)!).filter(Boolean);
}

export interface LiveEvent {
  id: number;
  title: string;
  host: string;
  url: string;
  crawledAt: string;
}

export function liveEvents(db: DatabaseSync, limit = 12): LiveEvent[] {
  return (
    db.prepare("SELECT id, url, title, host, at FROM events WHERE kind = 'indexed' ORDER BY id DESC LIMIT ?").all(limit) as { id: number; url: string; title: string; host: string; at: number }[]
  ).map((e) => ({ id: e.id, url: e.url, title: e.title, host: e.host, crawledAt: new Date(e.at).toISOString() }));
}
