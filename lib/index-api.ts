/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "server-only";
import type { IndexedDoc, SearchResponse } from "./search/types";
import type { ImageHit, SearchOptions } from "./search/engine";
import type { LiveEvent } from "./home";
import type { IndexStats } from "./search/store";
import type { SubmitResult } from "./db/submit";
import type { PoiHit } from "./places/poi-index";

export interface HomeData {
  featured: IndexedDoc[];
  shelf: IndexedDoc[];
  latest: IndexedDoc[];
  live: LiveEvent[];
  stats: IndexStats;
}

export type IndexOps = {
  search: (q: string, opts: SearchOptions) => SearchResponse;
  news: (q: string, opts: SearchOptions) => SearchResponse;
  images: (q: string) => ImageHit[];
  suggest: (q: string, extra: string[]) => string[];
  home: () => HomeData;
  live: () => { stats: IndexStats; items: LiveEvent[] };
  stats: () => IndexStats;
  siblings: (doc: IndexedDoc) => IndexedDoc[];
  submit: (url: string, clientId: string) => SubmitResult;
  pois: (q: string, lat: number | null, lon: number | null, limit: number) => PoiHit[] | null;
  poisIn: (bbox: [number, number, number, number], limit: number) => PoiHit[] | null;
};

const REMOTE = process.env.GOOGLANT_INDEX_URL?.replace(/\/$/, "");

export async function runLocal<K extends keyof IndexOps>(op: K, args: Parameters<IndexOps[K]>): Promise<ReturnType<IndexOps[K]> | null> {
  const [{ getDb, getStats }, engine, home, submit, poi] = await Promise.all([import("./search/store"), import("./search/engine"), import("./home"), import("./db/submit"), import("./places/poi-index")]);
  if (op === "pois") {
    const [q, lat, lon, limit] = args as Parameters<IndexOps["pois"]>;
    return poi.searchPois(String(q), lat === null ? null : Number(lat), lon === null ? null : Number(lon), Math.min(Number(limit) || 6, 10)) as ReturnType<IndexOps[K]>;
  }
  const db = getDb();
  if (!db) return null;
  const ops: Omit<IndexOps, "pois" | "poisIn"> = {
    search: (q, o) => engine.search(db, q, o),
    news: (q, o) => engine.searchNews(db, q, o),
    images: (q) => engine.searchImages(db, q),
    suggest: (q, extra) => engine.suggest(db, q, extra, 8),
    home: () => {
      const sel = home.homeSelections(db);
      const events = home.liveEvents(db);
      return {
        ...sel,
        live: events.length ? events : sel.latest.map((d) => ({ id: d.id, title: d.title, host: d.host, url: d.url, crawledAt: d.crawledAt })),
        stats: getStats(db),
      };
    },
    live: () => ({ stats: getStats(db), items: home.liveEvents(db) }),
    stats: () => getStats(db),
    siblings: (doc) => home.siblingsOf(db, doc),
    submit: (url, clientId) => submit.submitUrl(db, String(url), String(clientId)),
  };
  if (op === "poisIn") {
    const [bbox, limit] = args as Parameters<IndexOps["poisIn"]>;
    const b = (Array.isArray(bbox) ? bbox : []).map(Number);
    if (b.length !== 4 || b.some((x) => !Number.isFinite(x))) return [] as ReturnType<IndexOps[K]>;
    return poi.poisInBox(b[0], b[1], b[2], b[3], Math.min(Number(limit) || 120, 200)) as ReturnType<IndexOps[K]>;
  }
  const fn = ops[op as Exclude<K, "pois" | "poisIn">] as (...a: unknown[]) => ReturnType<IndexOps[K]>;
  return fn(...(args as unknown[]));
}

async function runRemote<K extends keyof IndexOps>(op: K, args: Parameters<IndexOps[K]>): Promise<ReturnType<IndexOps[K]> | null> {
  try {
    const res = await fetch(`${REMOTE}/api/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GOOGLANT_INDEX_TOKEN ?? ""}` },
      body: JSON.stringify({ op, args }),
      cache: "no-store",
      signal: AbortSignal.timeout(op === "home" ? 12_000 : 8_000),
    });
    if (!res.ok) {
      console.error(`[googlant] API d'index : ${res.status}`);
      return null;
    }
    return (await res.json()) as ReturnType<IndexOps[K]>;
  } catch (err) {
    // signaux internes de Next.js (page dynamique, redirection…), reconnaissables à leur « digest » :
    // à laisser passer. Pas d'import de next/navigation ici, ce fichier tourne aussi hors de Next.js
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error("[googlant] API d'index injoignable :", err);
    return null;
  }
}

export function index<K extends keyof IndexOps>(op: K, ...args: Parameters<IndexOps[K]>): Promise<ReturnType<IndexOps[K]> | null> {
  return REMOTE ? runRemote(op, args) : runLocal(op, args);
}
