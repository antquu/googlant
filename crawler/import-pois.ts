/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Construit data/pois.db (commerces et lieux nommés d'OpenStreetMap) à partir de la sortie
 * `osmium export -f geojsonseq` lue sur l'entrée standard. Voir scripts/import-pois.sh.
 */

import { existsSync, renameSync, rmSync } from "node:fs";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { nearestCity } from "../lib/geo/cities.ts";
import { categoryOf } from "../lib/places/labels.ts";
import { poiCell } from "../lib/places/poi-cell.ts";

const OUT = process.argv[2] ?? "data/pois.db";
const TMP = `${OUT}.tmp`;

// équipements nommés qui ne sont pas des lieux qu'on cherche
const SKIP = new Set([
  "parking", "parking_space", "parking_entrance", "bicycle_parking", "motorcycle_parking", "bench", "waste_basket", "waste_disposal", "recycling",
  "vending_machine", "shelter", "drinking_water", "fountain", "telephone", "post_box", "grit_bin", "hunting_stand", "clock", "toilets",
  "pitch", "playground", "picnic_table", "track", "slipway", "bbq", "firepit", "bicycle_rental", "charging_station", "letter_box", "lounger",
  "outdoor_seating", "dog_park", "garden", "swimming_pool", "fitness_station", "information", "viewpoint", "picnic_site", "camp_pitch",
]);
const KEYS = ["shop", "amenity", "tourism", "leisure", "healthcare", "craft", "office"];

type Geometry = { type: "Point"; coordinates: [number, number] } | { type: "Polygon"; coordinates: [number, number][][] } | { type: "MultiPolygon"; coordinates: [number, number][][][] };

function center(g: Geometry): [number, number] | null {
  const ring = g.type === "Point" ? [g.coordinates] : g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0]?.[0] : null;
  if (!ring?.length) return null;
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ring) {
    x += lon;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

if (existsSync(TMP)) rmSync(TMP);
const db = new DatabaseSync(TMP);
db.exec(`
  PRAGMA journal_mode = OFF;
  PRAGMA synchronous = OFF;
  CREATE TABLE pois (
    id INTEGER PRIMARY KEY, osm TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, street TEXT, city TEXT,
    lat REAL NOT NULL, lon REAL NOT NULL, phone TEXT, website TEXT, hours TEXT, wikidata TEXT, brand TEXT, image TEXT
  );
  CREATE VIRTUAL TABLE pois_fts USING fts5(name, kind, city, cell, content='', tokenize='unicode61 remove_diacritics 2', prefix='2 3 4');
`);
const insert = db.prepare("INSERT INTO pois(id, osm, name, kind, street, city, lat, lon, phone, website, hours, wikidata, brand, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
const insertFts = db.prepare("INSERT INTO pois_fts(rowid, name, kind, city, cell) VALUES (?, ?, ?, ?, ?)");

let id = 0;
let seen = 0;
const started = Date.now();
db.exec("BEGIN");
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const raw of lines) {
  const line = raw.replace(/^\x1e/, "").trim();
  if (!line) continue;
  seen++;
  let f: { geometry: Geometry; properties: Record<string, string> };
  try {
    f = JSON.parse(line);
  } catch {
    continue;
  }
  const t = f.properties;
  const name = t.name?.trim();
  const key = KEYS.find((k) => t[k]);
  if (!name || !key || SKIP.has(t[key]) || (t[key] === "yes" && key !== "shop")) continue;
  const c = center(f.geometry);
  if (!c) continue;
  const [lon, lat] = c;
  const kind = categoryOf(t);
  const near = t["addr:city"] ? null : nearestCity({ lat, lon });
  const city = t["addr:city"] ?? (near && near.km < 12 ? near.city.name : "");
  const street = [t["addr:housenumber"], t["addr:street"] ?? t["addr:place"]].filter(Boolean).join(" ");
  id++;
  insert.run(
    id, `${t["@type"] ?? "node"}/${t["@id"] ?? 0}`, name.slice(0, 200), kind, street || null, city || null, +lat.toFixed(6), +lon.toFixed(6),
    t.phone ?? t["contact:phone"] ?? null, t.website ?? t["contact:website"] ?? null, t.opening_hours ?? null,
    t.wikidata ?? null, t["brand:wikidata"] ?? null, t.image ?? t.wikimedia_commons ?? null,
  );
  insertFts.run(id, name, kind, city, poiCell(lat, lon));
  if (id % 100_000 === 0) {
    db.exec("COMMIT; BEGIN");
    console.log(`${id.toLocaleString("fr-FR")} lieux (${seen.toLocaleString("fr-FR")} objets lus, ${Math.round((Date.now() - started) / 1000)} s)`);
  }
}
db.exec("COMMIT");
console.log("optimisation de l'index…");
db.exec("CREATE INDEX pois_lat ON pois(lat, lon)");
db.exec("INSERT INTO pois_fts(pois_fts) VALUES ('optimize'); VACUUM;");
db.close();
if (existsSync(OUT)) rmSync(OUT);
renameSync(TMP, OUT);
console.log(`terminé : ${id.toLocaleString("fr-FR")} lieux dans ${OUT} en ${Math.round((Date.now() - started) / 1000)} s`);
