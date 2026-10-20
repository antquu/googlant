/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "server-only";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { distanceKm } from "../geo/cities";
import { fold } from "../search/tokenizer";
import { frenchKind } from "./labels";
import { originalNamesFor, renamed } from "./overrides";
import { cellsAround } from "./poi-cell";

export interface PoiHit {
  osm: string;
  name: string;
  kind: string;
  street: string | null;
  city: string | null;
  lat: number;
  lon: number;
  phone: string | null;
  website: string | null;
  hours: string | null;
  wikidata: string | null;
  brand: string | null;
  image: string | null;
}

const holder = globalThis as unknown as { __pois?: { db: DatabaseSync | null; at: number; mtime: number } };

// rouvre la base quand scripts/import-pois.sh en a écrit une nouvelle (vérifié au plus une fois par minute)
function poiDb(): DatabaseSync | null {
  const cur = holder.__pois;
  if (cur && Date.now() - cur.at < 60_000) return cur.db;
  const file = process.env.GOOGLANT_POI_DB ?? join(process.cwd(), "data", "pois.db");
  // base optionnelle, seulement sur la machine de l'index : Next.js ne doit pas l'embarquer dans le déploiement
  const mtime = existsSync(/*turbopackIgnore: true*/ file) ? statSync(/*turbopackIgnore: true*/ file).mtimeMs : 0;
  if (cur && cur.mtime === mtime) {
    cur.at = Date.now();
    return cur.db;
  }
  cur?.db?.close();
  const db = mtime ? new DatabaseSync(/*turbopackIgnore: true*/ file, { readOnly: true }) : null;
  db?.exec("PRAGMA cache_size = -8000");
  holder.__pois = { db, at: Date.now(), mtime };
  return db;
}

/** Commerces et lieux dont le nom commence par les mots tapés, les plus proches d'abord. null si l'index n'existe pas. */
export function searchPois(q: string, lat: number | null, lon: number | null, limit = 6): PoiHit[] | null {
  const db = poiDb();
  if (!db) return null;
  const words = fold(q).split(/[^a-z0-9]+/).filter(Boolean).slice(0, 6);
  if (!words.length || words.join("").length < 2) return [];
  const text = words.map((w) => `"${w}"*`).join(" AND ");
  const sql = `SELECT p.osm, p.name, p.kind, p.street, p.city, p.lat, p.lon, p.phone, p.website, p.hours, p.wikidata, p.brand, p.image
    FROM pois_fts JOIN pois p ON p.id = pois_fts.rowid WHERE pois_fts MATCH ? LIMIT 400`;
  let rows: PoiHit[] = [];
  if (lat !== null && lon !== null) {
    rows = db.prepare(sql).all(`{name kind city} : (${text}) AND cell : (${cellsAround(lat, lon).join(" OR ")})`) as unknown as PoiHit[];
  }
  if (rows.length < limit) rows = [...rows, ...(db.prepare(sql).all(`{name kind city} : (${text})`) as unknown as PoiHit[])];
  // lieux renommés à la main : "pharmacie de mon" trouve aussi "Pharmacie Reymermier"
  for (const original of originalNamesFor(q)) {
    const w = fold(original).split(/[^a-z0-9]+/).filter(Boolean);
    if (w.length) rows = [...(db.prepare(sql).all(`{name} : (${w.map((x) => `"${x}"`).join(" AND ")})`) as unknown as PoiHit[]), ...rows];
  }

  const first = words[0];
  const scored = rows.map((r) => {
    const name = fold(renamed(r, r.osm).name);
    const km = lat !== null && lon !== null ? distanceKm({ lat, lon }, r) : 0;
    // le nom qui commence par ce qu'on tape passe devant, puis la distance
    // tous les mots dans le nom (pas seulement dans la ville) : nettement devant
    const allInName = words.every((w) => name.includes(w));
    return { r, score: (name.startsWith(first) ? 0 : name.includes(first) ? 8 : 15) + (allInName ? 0 : 10) + Math.log1p(km) * 3 };
  });
  scored.sort((a, b) => a.score - b.score);
  const out: PoiHit[] = [];
  for (const { r } of scored) {
    if (out.some((o) => o.osm === r.osm || (o.name === renamed(r, r.osm).name && Math.abs(o.lat - r.lat) + Math.abs(o.lon - r.lon) < 0.002))) continue;
    out.push({ ...renamed(r, r.osm), kind: frenchKind(r.kind) });
    if (out.length >= limit) break;
  }
  return out;
}

/** Lieux dans un rectangle (carte zoomée), répartis sur la zone pour ne pas tout empiler au même endroit. */
export function poisInBox(south: number, west: number, north: number, east: number, limit = 120): PoiHit[] | null {
  const db = poiDb();
  if (!db) return null;
  if (north - south > 0.08 || east - west > 0.12) return [];
  const rows = db
    .prepare(
      `SELECT osm, name, kind, street, city, lat, lon, phone, website, hours, wikidata, brand, image
       FROM pois WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? LIMIT 3000`,
    )
    .all(south, north, west, east) as unknown as PoiHit[];
  // grille 10 x 10 : au plus quelques lieux par case, en gardant d'abord ceux qui ont des infos
  const per = Math.max(1, Math.ceil(limit / 100));
  const cells = new Map<string, number>();
  const score = (p: PoiHit) => (p.hours ? 2 : 0) + (p.website ? 1 : 0) + (p.phone ? 1 : 0) + (p.wikidata ? 3 : 0);
  const out: PoiHit[] = [];
  for (const p of rows.sort((a, b) => score(b) - score(a))) {
    const key = `${Math.floor(((p.lat - south) / (north - south)) * 10)}:${Math.floor(((p.lon - west) / (east - west)) * 10)}`;
    const n = cells.get(key) ?? 0;
    if (n >= per) continue;
    cells.set(key, n + 1);
    out.push({ ...renamed(p, p.osm), kind: frenchKind(p.kind) });
    if (out.length >= limit) break;
  }
  return out;
}
