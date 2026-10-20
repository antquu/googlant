/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { gunzipSync, gzipSync } from "node:zlib";
import type { CrawledPage } from "../search/types";
import { tx } from "./db";
import { computePageRank } from "./pagerank";
import { upsertPage } from "./write";

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

export function readJsonl(path: string): CrawledPage[] {
  const buf = readFileSync(path);
  const text = (path.endsWith(".gz") ? gunzipSync(buf) : buf).toString("utf8");
  const out: CrawledPage[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as CrawledPage);
    } catch {
    }
  }
  return out;
}

export function importPages(db: DatabaseSync, pages: CrawledPage[], opts: { langs?: string[] } = {}): number {
  const langs = opts.langs ?? ["fr", "en"];
  const latest = new Map<string, CrawledPage>();
  for (const p of pages) {
    const prev = latest.get(p.url);
    if (!prev || prev.crawledAt < p.crawledAt) latest.set(p.url, p);
  }
  let n = 0;
  const now = Math.floor(Date.now() / 1000);
  const queue = db.prepare("INSERT OR IGNORE INTO frontier(url, host, depth, next_at, interval) VALUES (?, ?, ?, ?, ?)");
  const list = [...latest.values()].filter((p) => (p.title || p.text.length > 200) && (!p.lang || langs.includes(p.lang.slice(0, 2))));
  for (let i = 0; i < list.length; i += 500) {
    tx(db, () => {
      for (const p of list.slice(i, i + 500)) {
        upsertPage(db, p);
        const interval = p.depth === 0 ? 6 * 3600 : 3 * 86400;
        queue.run(p.url, hostOf(p.url), p.depth, now + Math.floor(Math.random() * 7 * 86400), interval);
        n++;
      }
    });
  }
  return n;
}

export function importDirectory(db: DatabaseSync, path: string): number {
  if (!existsSync(path)) return 0;
  const entries = JSON.parse(readFileSync(path, "utf8")) as { url: string; title: string; description: string; force?: boolean }[];
  let n = 0;
  tx(db, () => {
    for (const e of entries) {
      const host = hostOf(e.url);
      const existing = db.prepare("SELECT id FROM pages WHERE url = ?").get(e.url) as { id: number } | undefined;
      if (existing && e.force) {
        db.prepare("UPDATE pages SET title = ?, site_name = ?, description = ? WHERE id = ?").run(e.title, e.title, e.description, existing.id);
        continue;
      }
      const crawled = db.prepare("SELECT 1 FROM pages WHERE host = ? AND directory = 0 LIMIT 1").get(host);
      if (crawled || existing) continue;
      upsertPage(
        db,
        {
          url: e.url, finalUrl: e.url, status: 200, crawledAt: new Date().toISOString(), depth: 0, lang: "fr", title: e.title,
          description: e.description, headings: [], text: e.description, siteName: e.title, favicon: `${new URL(e.url).origin}/favicon.ico`,
          images: [], links: [], contentHash: `directory:${e.url}`,
        },
        { directory: true },
      );
      n++;
    }
  });
  return n;
}

export function seedIfEmpty(db: DatabaseSync, seedPath: string, directoryPath: string): boolean {
  const { n } = db.prepare("SELECT count(*) AS n FROM pages").get() as { n: number };
  if (n > 0 || !existsSync(seedPath)) return false;
  importPages(db, readJsonl(seedPath));
  importDirectory(db, directoryPath);
  computePageRank(db);
  return true;
}

export function exportSeed(db: DatabaseSync, path: string, limit = 5000): number {
  const rows = db
    .prepare("SELECT url, title, description, text, headings, lang, favicon, image, published_at, crawled_at, site_name, content_hash FROM pages WHERE directory = 0 ORDER BY quality DESC LIMIT ?")
    .all(limit) as unknown as Record<string, string>[];
  const linkStmt = db.prepare("SELECT dst FROM links WHERE src = (SELECT id FROM pages WHERE url = ?) LIMIT 80");
  const imgStmt = db.prepare("SELECT src, alt FROM images WHERE page_id = (SELECT id FROM pages WHERE url = ?) LIMIT 6");
  const lines = rows.map((r) =>
    JSON.stringify({
      url: r.url, finalUrl: r.url, status: 200, crawledAt: r.crawled_at, depth: 1, lang: r.lang ?? undefined, title: r.title ?? "",
      description: r.description ?? "", headings: JSON.parse(r.headings ?? "[]"), text: (r.text ?? "").slice(0, 2500), siteName: r.site_name ?? undefined,
      favicon: r.favicon ?? undefined, image: r.image ?? undefined, publishedAt: r.published_at ?? undefined,
      images: imgStmt.all(r.url) as unknown as { src: string; alt: string }[], links: (linkStmt.all(r.url) as { dst: string }[]).map((l) => l.dst), contentHash: r.content_hash ?? "",
    } satisfies CrawledPage),
  );
  writeFileSync(path, gzipSync(lines.join("\n"), { level: 9 }));
  return lines.length;
}
