/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const DB_PATH = process.env.GOOGLANT_DB ?? join(process.cwd(), "data", "googlant.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pages (
  id            INTEGER PRIMARY KEY,
  url           TEXT NOT NULL UNIQUE,
  host          TEXT NOT NULL,
  site_name     TEXT NOT NULL DEFAULT '',
  title         TEXT NOT NULL DEFAULT '',
  title_fold    TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  text          TEXT NOT NULL DEFAULT '',
  headings      TEXT NOT NULL DEFAULT '[]',
  lang          TEXT,
  favicon       TEXT,
  image         TEXT,
  published_at  TEXT,
  crawled_at    TEXT NOT NULL,
  first_seen    TEXT NOT NULL,
  rank          REAL NOT NULL DEFAULT 0,
  inlinks       INTEGER NOT NULL DEFAULT 0,
  directory     INTEGER NOT NULL DEFAULT 0,
  content_hash  TEXT,
  quality       REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS pages_host    ON pages(host, rank);
CREATE INDEX IF NOT EXISTS pages_crawled ON pages(crawled_at);
CREATE INDEX IF NOT EXISTS pages_quality ON pages(quality);
CREATE INDEX IF NOT EXISTS pages_title   ON pages(title_fold);
CREATE INDEX IF NOT EXISTS pages_hash    ON pages(content_hash);
-- colonnes d'affichage sans le texte : les résultats se chargent depuis cet index compact, gardé en mémoire
CREATE INDEX IF NOT EXISTS pages_meta    ON pages(id, url, host, site_name, title, description, headings, lang, favicon, image, published_at, crawled_at, rank, inlinks, directory);
CREATE INDEX IF NOT EXISTS pages_pub     ON pages(published_at) WHERE published_at IS NOT NULL;

CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
  title, headings, url, description, body,
  content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 0'
);
CREATE VIRTUAL TABLE IF NOT EXISTS pages_vocab USING fts5vocab(pages_fts, 'row');

CREATE TABLE IF NOT EXISTS links (
  src INTEGER NOT NULL,
  dst TEXT NOT NULL,
  PRIMARY KEY (src, dst)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS links_dst ON links(dst);

CREATE TABLE IF NOT EXISTS images (
  id      INTEGER PRIMARY KEY,
  page_id INTEGER NOT NULL,
  src     TEXT NOT NULL UNIQUE,
  alt     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS images_page ON images(page_id);
CREATE VIRTUAL TABLE IF NOT EXISTS images_fts USING fts5(terms, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 0');

CREATE TABLE IF NOT EXISTS frontier (
  url       TEXT PRIMARY KEY,
  host      TEXT NOT NULL,
  depth     INTEGER NOT NULL DEFAULT 0,
  next_at   INTEGER NOT NULL,
  interval  INTEGER NOT NULL DEFAULT 86400,
  attempts  INTEGER NOT NULL DEFAULT 0,
  state     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS frontier_due  ON frontier(state, depth, next_at);
CREATE INDEX IF NOT EXISTS frontier_host ON frontier(host);
CREATE INDEX IF NOT EXISTS frontier_priority ON frontier(next_at) WHERE next_at = 0;

CREATE TABLE IF NOT EXISTS hosts (
  host      TEXT PRIMARY KEY,
  robots    TEXT,
  robots_at INTEGER,
  pages     INTEGER NOT NULL DEFAULT 0,
  queued    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id    INTEGER PRIMARY KEY,
  at    INTEGER NOT NULL,
  kind  TEXT NOT NULL,
  url   TEXT NOT NULL,
  title TEXT,
  host  TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function openDb(path = DB_PATH): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 8000;
    PRAGMA temp_store = MEMORY;
    PRAGMA cache_size = -${Math.max(4, Number(process.env.GOOGLANT_DB_CACHE_MB) || 64) * 1000};
  `);
  db.exec(SCHEMA);
  const hostCols = (db.prepare("PRAGMA table_info(hosts)").all() as { name: string }[]).map((c) => c.name);
  if (!hostCols.includes("boost")) db.exec("ALTER TABLE hosts ADD COLUMN boost INTEGER NOT NULL DEFAULT 0");
  if (!hostCols.includes("sitemap_at")) db.exec("ALTER TABLE hosts ADD COLUMN sitemap_at INTEGER");
  return db;
}

export function getMeta<T>(db: DatabaseSync, key: string): T | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export function setMeta(db: DatabaseSync, key: string, value: unknown) {
  db.prepare("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
}

export function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
