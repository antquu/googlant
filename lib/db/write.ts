/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DatabaseSync } from "node:sqlite";
import { fold, tokenize, tokenizeUrl } from "../search/tokenizer";
import type { CrawledPage } from "../search/types";

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

export function cleanTitle(title: string): string {
  return title.replace(/\s+[—–|\\·-]\s+[^—–|\\·]{2,48}$/u, "").trim() || title;
}

function siteNameOf(p: CrawledPage): string {
  if (p.siteName) return p.siteName;
  const m = p.title.match(/\s[—–\-|\\·:]\s([^—–\-|\\·:]{2,40})$/);
  if (m) return m[1].trim();
  const host = hostOf(p.url);
  const label = host.split(".").slice(-2, -1)[0] ?? host;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const QUALITY_SQL = "rank * 0.55 + min(length(text) / 4000.0, 1.0) * 0.35 + (CASE WHEN length(description) > 90 THEN 0.1 ELSE 0 END)";

const SNIPPET_CHARS = 4000;

export interface UpsertResult {
  id: number;
  created: boolean;
  changed: boolean;
}

export function upsertPage(db: DatabaseSync, p: CrawledPage, opts: { directory?: boolean } = {}): UpsertResult {
  const host = hostOf(p.url);
  const existing = db.prepare("SELECT id, content_hash FROM pages WHERE url = ?").get(p.url) as { id: number; content_hash: string | null } | undefined;
  const changed = !existing || existing.content_hash !== p.contentHash;
  const publishedAt = p.publishedAt && p.publishedAt >= "1995" ? p.publishedAt : null;
  const now = p.crawledAt;

  let id: number;
  if (existing) {
    id = existing.id;
    db.prepare(
      `UPDATE pages SET host=?, site_name=?, title=?, title_fold=?, description=?, text=?, headings=?, lang=?, favicon=?, image=?,
       published_at=?, crawled_at=?, directory=?, content_hash=? WHERE id=?`,
    ).run(
      host, siteNameOf(p), p.title || host, fold(cleanTitle(p.title || host)), p.description, p.text.slice(0, SNIPPET_CHARS),
      JSON.stringify(p.headings.slice(0, 12)), p.lang ?? null, p.favicon ?? null, p.image ?? null, publishedAt, now, opts.directory ? 1 : 0, p.contentHash, id,
    );
    if (!changed) return { id, created: false, changed: false };
    db.prepare("DELETE FROM pages_fts WHERE rowid = ?").run(id);
    db.prepare("DELETE FROM links WHERE src = ?").run(id);
  } else {
    const r = db
      .prepare(
        `INSERT INTO pages (url, host, site_name, title, title_fold, description, text, headings, lang, favicon, image,
         published_at, crawled_at, first_seen, directory, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        p.url, host, siteNameOf(p), p.title || host, fold(cleanTitle(p.title || host)), p.description, p.text.slice(0, SNIPPET_CHARS),
        JSON.stringify(p.headings.slice(0, 12)), p.lang ?? null, p.favicon ?? null, p.image ?? null, publishedAt, now, now, opts.directory ? 1 : 0, p.contentHash,
      );
    id = Number(r.lastInsertRowid);
    db.prepare("INSERT INTO hosts(host, pages) VALUES (?, 1) ON CONFLICT(host) DO UPDATE SET pages = pages + 1").run(host);
  }

  db.prepare("INSERT INTO pages_fts(rowid, title, headings, url, description, body) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    tokenize(p.title).join(" "),
    tokenize(p.headings.join(" ")).join(" "),
    tokenizeUrl(p.url).join(" "),
    tokenize(p.description).join(" "),
    tokenize(p.text).join(" "),
  );

  const link = db.prepare("INSERT OR IGNORE INTO links(src, dst) VALUES (?, ?)");
  for (const l of p.links.slice(0, 300)) if (l !== p.url) link.run(id, l);

  const img = db.prepare("INSERT OR IGNORE INTO images(page_id, src, alt) VALUES (?, ?, ?)");
  const imgFts = db.prepare("INSERT INTO images_fts(rowid, terms) VALUES (?, ?)");
  for (const im of p.images) {
    if (/favicon|apple-touch|sprite|pixel|spacer|\/icons?\/|\.ico(\?|$)|badge|avatar/i.test(im.src)) continue;
    const r = img.run(id, im.src, im.alt.slice(0, 160));
    if (r.changes) imgFts.run(Number(r.lastInsertRowid), [...new Set(tokenize(`${im.alt} ${p.title}`))].join(" "));
  }

  return { id, created: !existing, changed: true };
}

export function deletePage(db: DatabaseSync, url: string) {
  const row = db.prepare("SELECT id, host FROM pages WHERE url = ?").get(url) as { id: number; host: string } | undefined;
  if (!row) return;
  db.prepare("DELETE FROM pages_fts WHERE rowid = ?").run(row.id);
  db.prepare("DELETE FROM links WHERE src = ?").run(row.id);
  for (const im of db.prepare("SELECT id FROM images WHERE page_id = ?").all(row.id) as { id: number }[]) {
    db.prepare("DELETE FROM images_fts WHERE rowid = ?").run(im.id);
  }
  db.prepare("DELETE FROM images WHERE page_id = ?").run(row.id);
  db.prepare("DELETE FROM pages WHERE id = ?").run(row.id);
  db.prepare("UPDATE hosts SET pages = max(pages - 1, 0) WHERE host = ?").run(row.host);
}
