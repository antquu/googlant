/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DatabaseSync } from "node:sqlite";
import { cleanTitle } from "../db/write";
import { makeSnippet } from "./snippet";
import { fold, levenshtein, tokenize } from "./tokenizer";
import type { IndexedDoc, SearchHit, SearchResponse } from "./types";

const BM25 = "bm25(pages_fts, 3.0, 1.7, 2.2, 1.4, 1.0)";
const POOL = 600;

export interface ParsedQuery {
  raw: string;
  text: string;
  terms: string[];
  phrases: string[];
  excluded: string[];
  site?: string;
  notSites: string[];
  filetype?: string;
  intitle: string[];
  inurl: string[];
  lang?: string;
  after?: string;
  before?: string;
}

// extensions reconnues par filetype: (html = pages sans extension de document)
export const FILETYPES = ["pdf", "html", "php", "asp", "aspx", "jsp", "txt", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "csv"];

const cleanHost = (s: string) => s.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

function isoDate(v: string): string | undefined {
  const m = v.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  if (!m) return;
  return `${m[1]}-${(m[2] ?? "01").padStart(2, "0")}-${(m[3] ?? "01").padStart(2, "0")}`;
}

export function parseQuery(raw: string): ParsedQuery {
  let text = raw.trim().slice(0, 256);
  const phrases: string[] = [];
  const excluded: string[] = [];
  let site: string | undefined;
  const notSites: string[] = [];
  const intitle: string[] = [];
  const inurl: string[] = [];
  let filetype: string | undefined;
  let lang: string | undefined;
  let after: string | undefined;
  let before: string | undefined;

  // opérateurs à la Google : filetype:pdf intitle:x inurl:x lang:fr after:2024-01 before:2025 -site:x.com
  text = text.replace(/(^|\s)(-?)(filetype|ext|intitle|allintitle|inurl|allinurl|lang|after|before|site):("[^"]+"|\S+)/gi, (all, sp: string, neg: string, op: string, val: string) => {
    const v = val.replace(/^"|"$/g, "").trim();
    const key = op.toLowerCase();
    if (!v) return all;
    if (key === "site") {
      if (neg) notSites.push(cleanHost(v));
      else site = cleanHost(v);
    } else if (key === "filetype" || key === "ext") {
      const ext = v.toLowerCase().replace(/^\./, "").replace(/^htm$/, "html");
      if (FILETYPES.includes(ext)) filetype = ext;
    } else if (key === "intitle" || key === "allintitle") intitle.push(...tokenize(v));
    else if (key === "inurl" || key === "allinurl") inurl.push(...tokenize(v));
    else if (key === "lang" && /^[a-z]{2}$/i.test(v)) lang = v.toLowerCase();
    else if (key === "after") after = isoDate(v);
    else if (key === "before") before = isoDate(v);
    return sp;
  });

  text = text.replace(/"([^"]+)"/g, (_, p: string) => {
    phrases.push(fold(p.trim()));
    return ` ${p} `;
  });
  text = text.replace(/(^|\s)-(\S+)/g, (_, sp: string, w: string) => {
    excluded.push(...tokenize(w));
    return sp;
  });
  text = text.replace(/\s+/g, " ").trim();
  return { raw, text, terms: [...new Set(tokenize(text))].slice(0, 12), phrases, excluded, site, notSites, filetype, intitle, inurl, lang, after, before };
}

export interface SearchOptions {
  page?: number;
  perPage?: number;
  city?: string;
  autoCorrect?: boolean;
}

const COLS = "id, url, host, site_name, title, description, headings, lang, favicon, image, published_at, crawled_at, rank, inlinks, directory";

interface PageRow {
  id: number;
  url: string;
  host: string;
  site_name: string;
  title: string;
  description: string;
  headings: string;
  lang: string | null;
  favicon: string | null;
  image: string | null;
  published_at: string | null;
  crawled_at: string;
  rank: number;
  inlinks: number;
  directory: number;
  text?: string;
}

export function rowToDoc(r: PageRow): IndexedDoc {
  let headings: string[] = [];
  try {
    headings = JSON.parse(r.headings) as string[];
  } catch {
  }
  return {
    id: r.id,
    url: r.url,
    host: r.host,
    siteName: r.site_name,
    title: r.title,
    description: r.description,
    text: r.text ?? "",
    headings,
    lang: r.lang ?? undefined,
    favicon: r.favicon ?? undefined,
    image: r.image ?? undefined,
    publishedAt: r.published_at ?? undefined,
    crawledAt: r.crawled_at,
    rank: r.rank,
    inlinks: r.inlinks,
    directory: r.directory ? true : undefined,
  };
}

// index "pages_meta" : toutes les colonnes d'affichage sans le texte des pages. Bien plus petit que la
// table, il reste en mémoire : un résultat se charge sans aller lire le disque (lent sur la VM)
const metaIndex = new WeakMap<DatabaseSync, boolean>();
function hasMetaIndex(db: DatabaseSync): boolean {
  let ok = metaIndex.get(db);
  if (ok === undefined) {
    ok = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'pages_meta'").get();
    metaIndex.set(db, ok);
  }
  return ok;
}

export function loadDocs(db: DatabaseSync, ids: number[], withText = false): Map<number, IndexedDoc> {
  const out = new Map<number, IndexedDoc>();
  const from = !withText && hasMetaIndex(db) ? "pages INDEXED BY pages_meta" : "pages";
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = db.prepare(`SELECT ${COLS}${withText ? ", text" : ""} FROM ${from} WHERE id IN (${chunk.map(() => "?").join(",")})`).all(...chunk) as unknown as PageRow[];
    for (const r of rows) out.set(r.id, rowToDoc(r));
  }
  return out;
}

const quote = (t: string) => `"${t.replace(/"/g, "")}"`;

interface Candidate {
  id: number;
  bm: number;
  matched: number;
}

const DOC_EXT = FILETYPES.filter((e) => !["html", "php", "asp", "aspx", "jsp"].includes(e));
const extLike = (ext: string) => `(lower(p.url) LIKE '%.${ext}' OR lower(p.url) LIKE '%.${ext}?%')`;

/** Conditions SQL sur la table pages pour site:, -site:, filetype:, lang:, after:, before: */
function filterSql(q: ParsedQuery): { sql: string; args: string[] } {
  const parts: string[] = [];
  const args: string[] = [];
  if (q.site) {
    parts.push("(p.host = ? OR p.host LIKE ?)");
    args.push(q.site, `%.${q.site}`);
  }
  for (const s of q.notSites) {
    parts.push("NOT (p.host = ? OR p.host LIKE ?)");
    args.push(s, `%.${s}`);
  }
  if (q.filetype === "html") parts.push(`NOT (${DOC_EXT.map(extLike).join(" OR ")})`);
  else if (q.filetype) parts.push(extLike(q.filetype));
  if (q.lang) {
    parts.push("p.lang LIKE ?");
    args.push(`${q.lang}%`);
  }
  if (q.after) {
    parts.push("coalesce(p.published_at, p.crawled_at) >= ?");
    args.push(q.after);
  }
  if (q.before) {
    parts.push("coalesce(p.published_at, p.crawled_at) < ?");
    args.push(q.before);
  }
  return { sql: parts.join(" AND "), args };
}

/** Partie FTS de intitle: / inurl: (colonnes title et url de pages_fts) */
function columnMatch(q: ParsedQuery): string {
  const parts: string[] = [];
  if (q.intitle.length) parts.push(`title : (${q.intitle.map(quote).join(" ")})`);
  if (q.inurl.length) parts.push(`url : (${q.inurl.map(quote).join(" ")})`);
  return parts.join(" AND ");
}

export const hasFilters = (q: ParsedQuery) => !!(q.site || q.notSites.length || q.filetype || q.intitle.length || q.inurl.length || q.lang || q.after || q.before);

function candidates(db: DatabaseSync, q: ParsedQuery): { list: Candidate[]; total: number } {
  const not = q.excluded.length ? ` NOT (${q.excluded.map(quote).join(" OR ")})` : "";
  const filter = filterSql(q);
  const cols = columnMatch(q);
  const siteJoin = filter.sql ? ` JOIN pages p ON p.id = pages_fts.rowid AND ${filter.sql}` : "";
  const siteArgs = filter.args;
  const withCols = (m: string) => (cols ? `(${m}) AND ${cols}` : m);
  const run = (match: string) =>
    db
      .prepare(`SELECT pages_fts.rowid AS id, -${BM25} AS bm FROM pages_fts${siteJoin} WHERE pages_fts MATCH ? ORDER BY ${BM25} LIMIT ${POOL}`)
      .all(...siteArgs, withCols(match)) as { id: number; bm: number }[];

  // uniquement des filtres ("intitle:grenoble", "site:x.fr filetype:pdf") : on liste les pages par popularité
  if (!q.terms.length) {
    const rows = cols
      ? (db.prepare(`SELECT pages_fts.rowid AS id, -${BM25} AS bm FROM pages_fts${siteJoin} WHERE pages_fts MATCH ? ORDER BY ${BM25} LIMIT ${POOL}`).all(...siteArgs, cols) as { id: number; bm: number }[])
      : (db.prepare(`SELECT p.id AS id, 1 + p.rank * 4 AS bm FROM pages p WHERE ${filter.sql || "1"} ORDER BY p.rank DESC LIMIT ${POOL}`).all(...siteArgs) as { id: number; bm: number }[]);
    return { list: rows.map((r) => ({ id: r.id, bm: r.bm, matched: 1 })), total: rows.length };
  }

  const all = run(`(${q.terms.map(quote).join(" ")})${not}`);
  const byId = new Map<number, Candidate>(all.map((r) => [r.id, { id: r.id, bm: r.bm, matched: q.terms.length }]));

  let total = all.length;
  if (q.terms.length > 1) {
    const orMatch = `(${q.terms.map(quote).join(" OR ")})${not}`;
    // compter au-delà de 5000 coûte cher pour rien : "environ 5 000 résultats" suffit
    total = (db.prepare(`SELECT count(*) AS n FROM (SELECT 1 FROM pages_fts${siteJoin} WHERE pages_fts MATCH ? LIMIT 5000)`).get(...siteArgs, withCols(orMatch)) as { n: number }).n;
    if (all.length < 60) {
      const partial = run(orMatch).filter((r) => !byId.has(r.id));
      if (partial.length) {
        const ids = partial.map((r) => r.id);
        const matched = new Map<number, number>();
        const inList = ids.map(() => "?").join(",");
        for (const t of q.terms) {
          for (const r of db.prepare(`SELECT rowid AS id FROM pages_fts WHERE pages_fts MATCH ? AND rowid IN (${inList})`).all(quote(t), ...ids) as { id: number }[]) {
            matched.set(r.id, (matched.get(r.id) ?? 0) + 1);
          }
        }
        for (const r of partial) byId.set(r.id, { id: r.id, bm: r.bm, matched: matched.get(r.id) ?? 1 });
      }
    }
  }
  return { list: [...byId.values()], total: Math.max(total, byId.size) };
}

interface Scored {
  doc: IndexedDoc;
  score: number;
}

function score(db: DatabaseSync, q: ParsedQuery, city?: string): { scored: Scored[]; total: number } {
  if (!q.terms.length && !hasFilters(q)) return { scored: [], total: 0 };
  const { list, total } = candidates(db, q);
  const docs = loadDocs(db, list.map((c) => c.id), q.phrases.length > 0);
  const queryFolded = fold(q.text);
  const cityFolded = city ? fold(city) : null;
  const out: Scored[] = [];

  for (const c of list) {
    const d = docs.get(c.id);
    if (!d) continue;
    if (q.phrases.length) {
      const hay = fold(`${d.title} ${d.description} ${d.text}`);
      if (!q.phrases.every((p) => hay.includes(p))) continue;
    }

    const coverage = q.terms.length ? c.matched / q.terms.length : 1;
    let s = c.bm * coverage * coverage * (1 + 0.6 * d.rank);

    const title = fold(cleanTitle(d.title));
    if (queryFolded.length > 2 && title === queryFolded) s *= 1.8;
    else if (queryFolded.length > 2 && title.includes(queryFolded)) s *= 1.35;
    if (q.terms.length > 1) {
      const titleTerms = new Set(tokenize(d.title));
      s *= 1 + 0.6 * (q.terms.filter((t) => titleTerms.has(t)).length / q.terms.length);
    }

    const path = d.url.replace(/^https?:\/\/[^/]+/, "");
    const isHome = /^\/?([a-z]{2}(-[a-z]{2})?\/?)?$/i.test(path);
    const label = d.host.replace(/^(www|m|fr)\./, "").split(".")[0].replace(/-/g, "");
    const wanted = queryFolded.replace(/[^a-z0-9]/g, "");
    const named = q.terms.join("") === label || wanted === label;
    // "ants" -> ants.gouv.fr : le domaine du site, pas seulement le premier mot de l'adresse
    const parts = d.host.replace(/^www\./, "").split(".");
    const siteLabel = parts[parts.length - (/^(gouv|co|com|org|ac|net|asso)$/.test(parts[parts.length - 2] ?? "") && parts.length > 2 ? 3 : 2)]?.replace(/-/g, "");
    const subOfNamed = !named && parts.length > 2 && (q.terms.join("") === siteLabel || wanted === siteLabel);
    if (named) s *= isHome ? 6 : 2;
    else if (subOfNamed) s *= 1.5;
    else if (isHome && q.terms.some((t) => d.host.split(/[.-]/).includes(t))) s *= 1.6;

    if (cityFolded && fold(`${d.title} ${d.description}`).includes(cityFolded)) s *= 1.15;
    out.push({ doc: d, score: s });
  }
  return { scored: out.sort((a, b) => b.score - a.score), total };
}

function diversify(scored: Scored[]): Scored[] {
  if (!scored.length) return scored;
  const floor = scored[0].score * 0.02;
  const count = new Map<string, number>();
  return scored
    .filter((s) => s.score >= floor)
    .map((s) => {
      const n = count.get(s.doc.host) ?? 0;
      count.set(s.doc.host, n + 1);
      return n < 2 ? s : { ...s, score: s.score * 0.55 ** (n - 1) };
    })
    .sort((a, b) => b.score - a.score);
}

function clusterPage(page: Scored[]): { s: Scored; clustered: boolean }[] {
  const out: { s: Scored; clustered: boolean }[] = [];
  for (const s of page) {
    const at = out.findIndex((o) => o.s.doc.host === s.doc.host && !o.clustered);
    if (at >= 0 && !out[at + 1]?.clustered) out.splice(at + 1, 0, { s, clustered: true });
    else out.push({ s, clustered: false });
  }
  return out;
}

export function correct(db: DatabaseSync, q: ParsedQuery): string | undefined {
  // pages_vocab parcourt les listes de pages de chaque mot lu : vérifier un mot avec MATCH ... LIMIT 1, et ne lire
  // le vocabulaire que sur les deux premières lettres (une seule lettre = des centaines de milliers de mots)
  const has = db.prepare("SELECT 1 FROM pages_fts WHERE pages_fts MATCH ? LIMIT 1");
  const near = db.prepare("SELECT term, doc FROM pages_vocab WHERE term >= ? AND term < ? AND doc >= 2");
  let changed = false;
  const fixed = q.text.split(/\s+/).map((w) => {
    const [t] = tokenize(w);
    if (!t || t.length < 3 || /\d/.test(t) || has.get(quote(t))) return w;
    const max = t.length <= 4 ? 1 : 2;
    let best: { term: string; doc: number; dist: number } | null = null;
    const head = t.slice(0, 2);
    for (const v of near.all(head, head.slice(0, -1) + String.fromCharCode(head.charCodeAt(1) + 1)) as { term: string; doc: number }[]) {
      if (Math.abs(v.term.length - t.length) > max) continue;
      const dist = levenshtein(t, v.term, max);
      if (dist <= max && (!best || dist < best.dist || (dist === best.dist && v.doc > best.doc))) best = { ...v, dist };
    }
    if (!best) return w;
    changed = true;
    return displayForm(db, best.term) ?? best.term;
  });
  return changed ? fixed.join(" ") : undefined;
}

function displayForm(db: DatabaseSync, term: string): string | undefined {
  const rows = db.prepare("SELECT p.title, p.description FROM pages_fts JOIN pages p ON p.id = pages_fts.rowid WHERE pages_fts MATCH ? LIMIT 20").all(quote(term)) as { title: string; description: string }[];
  for (const r of rows) {
    for (const word of `${r.title} ${r.description}`.split(/[^\p{L}\p{N}'’-]+/u)) {
      const [t] = tokenize(word);
      if (t === term) return word.toLowerCase();
    }
  }
}

export function search(db: DatabaseSync, raw: string, opts: SearchOptions = {}): SearchResponse {
  const t0 = performance.now();
  const perPage = Math.min(Math.max(opts.perPage ?? 10, 5), 50);
  const page = Math.max(opts.page ?? 1, 1);

  const original = parseQuery(raw);
  let q = original;
  let autoCorrected = false;
  let { scored, total } = score(db, q, opts.city);

  const suggestion = q.terms.length && !hasFilters(q) ? correct(db, q) : undefined;
  if (suggestion && scored.length < 3 && opts.autoCorrect !== false) {
    const alt = parseQuery(suggestion);
    const altRes = score(db, alt, opts.city);
    if (altRes.scored.length > scored.length) {
      q = alt;
      ({ scored, total } = altRes);
      autoCorrected = true;
    }
  }

  const ordered = diversify(scored);
  const start = (page - 1) * perPage;
  const pageSlice = ordered.slice(start, start + perPage);
  const texts = loadDocs(db, pageSlice.map((s) => s.doc.id), true);
  const termSet = new Set(q.terms);

  const hits: SearchHit[] = clusterPage(pageSlice).map(({ s, clustered }) => {
    const doc = texts.get(s.doc.id) ?? s.doc;
    return {
      doc,
      score: +s.score.toFixed(3),
      clustered,
      snippet: makeSnippet(doc.text, doc.description, termSet),
      titleTerms: q.terms.filter((t) => tokenize(doc.title).includes(t)),
    };
  });

  return {
    query: raw,
    correctedQuery: suggestion && fold(suggestion) !== fold(original.text) ? suggestion : undefined,
    autoCorrected,
    total: Math.max(total, ordered.length),
    page,
    perPage,
    tookMs: +(performance.now() - t0).toFixed(2),
    hits,
    related: related(ordered.slice(0, 14).map((s) => s.doc), q),
  };
}

function related(docs: IndexedDoc[], q: ParsedQuery): string[] {
  const qf = fold(q.text);
  const out = new Map<string, string>();
  for (const d of docs) {
    for (const cand of [cleanTitle(d.title), ...d.headings.slice(0, 3)]) {
      const c = cand.replace(/\s+/g, " ").trim();
      const f = fold(c);
      if (c.length < 4 || c.length > 48 || f === qf || out.has(f)) continue;
      if (/^(sommaire|contents|navigation|menu|notes|références|voir aussi|liens externes)/i.test(c)) continue;
      out.set(f, c);
      if (out.size >= 8) return [...out.values()];
    }
  }
  return [...out.values()];
}

export interface ImageHit {
  src: string;
  alt: string;
  page: IndexedDoc;
}

// logos, favicons, icônes, boutons, avatars, pixels de suivi... : pas de vraies images à montrer
export const JUNK_IMAGE = /(logo|favicon|icon|sprite|avatar|gravatar|badge|button|btn[-_]|pixel|spacer|blank\.|placeholder|emoji|smiley|banner-ad|\/ads?\/|rating|stars?[-_.]|arrow|loader|loading|spinner|social|share|facebook|twitter|linkedin|instagram|youtube-|whatsapp|pinterest|flag[-_/]|cookie|captcha|qr[-_]?code|header|footer|bandeau|picto|numero[-_]?vert|type[-_]article|default[-_.]|no[-_]?image|thumbnail[-_]default)/i;
export const JUNK_ALT = /^(logo|icône|icon|image|photo|picture|img|avatar|banner|bannière|button|bouton)\b|\blogo\b/i;

export function searchImages(db: DatabaseSync, raw: string, limit = 240): ImageHit[] {
  const q = parseQuery(raw);
  if (!q.terms.length) return [];
  const rows = db
    .prepare(
      `SELECT i.src, i.alt, i.page_id FROM images_fts JOIN images i ON i.id = images_fts.rowid
       WHERE images_fts MATCH ? ORDER BY bm25(images_fts) LIMIT ${limit > 40 ? 900 : 150}`,
    )
    .all(q.terms.map(quote).join(" OR ")) as { src: string; alt: string; page_id: number }[];
  // image présente sur 3 pages ou plus : logo, bandeau ou décor du site, pas une vraie photo
  const pagesPerSrc = new Map<string, Set<number>>();
  for (const r of rows) {
    const s = pagesPerSrc.get(r.src) ?? new Set<number>();
    s.add(r.page_id);
    pagesPerSrc.set(r.src, s);
  }
  const seen = new Set<string>();
  const useful = rows.filter((r) => {
    if (JUNK_IMAGE.test(r.src) || JUNK_ALT.test(r.alt.trim())) return false;
    if ((pagesPerSrc.get(r.src)?.size ?? 0) >= 3) return false;
    // même image servie à plusieurs tailles ou sur plusieurs pages : une seule fois
    const key = r.src.split("?")[0].replace(/[-_]\d{2,4}x\d{2,4}(?=\.\w+$)/, "").replace(/\/\d{2,4}px-/, "/");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const pages = loadDocs(db, [...new Set(useful.map((r) => r.page_id))]);
  return useful
    .map((r) => {
      const page = pages.get(r.page_id);
      if (!page) return null;
      // texte alternatif = nom du site ("Beendiz") ou simple étiquette ("Article") : un logo ou un pictogramme
      const alt = fold(r.alt.trim());
      if (alt === fold(page.siteName) || alt === fold(page.host.split(".")[0]) || /^(article|actualite|actu|news|image|photo|video|vignette|illustration)s?$/.test(alt)) return null;
      const terms = new Set(tokenize(`${r.alt} ${page.title}`));
      const matched = q.terms.filter((t) => terms.has(t)).length;
      return { hit: { src: r.src, alt: r.alt, page }, score: (matched / q.terms.length) ** 2 * (1 + page.rank) };
    })
    .filter((x): x is { hit: ImageHit; score: number } => !!x && x.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.hit);
}

export function searchNews(db: DatabaseSync, raw: string, opts: SearchOptions = {}): SearchResponse {
  const t0 = performance.now();
  const q = parseQuery(raw);
  const perPage = opts.perPage ?? 10;
  if (!q.terms.length) return { query: raw, total: 0, page: 1, perPage, tookMs: 0, hits: [], related: [] };
  const rows = db
    .prepare(
      `SELECT ${COLS.split(", ").map((c) => `p.${c}`).join(", ")}, p.text FROM pages_fts JOIN pages p ON p.id = pages_fts.rowid
       WHERE pages_fts MATCH ? AND p.published_at IS NOT NULL ORDER BY p.published_at DESC LIMIT ?`,
    )
    .all(q.terms.map(quote).join(" "), perPage) as unknown as PageRow[];
  const termSet = new Set(q.terms);
  const hits = rows.map((r) => {
    const doc = rowToDoc(r);
    return { doc, score: 0, snippet: makeSnippet(doc.text, doc.description, termSet), titleTerms: [] };
  });
  return { query: raw, total: hits.length, page: 1, perPage, tookMs: +(performance.now() - t0).toFixed(2), hits, related: [] };
}

export function suggest(db: DatabaseSync | null, raw: string, extra: string[] = [], limit = 8): string[] {
  const q = fold(raw).replace(/\s+/g, " ").trimStart();
  if (!q) return [];
  const results: { text: string; score: number }[] = [];
  const seen = new Set<string>();
  const consider = (text: string, weight: number) => {
    const folded = fold(text);
    if (seen.has(folded) || folded === q.trim() || text.length > 70) return;
    let s = 0;
    if (folded.startsWith(q)) s = 3;
    else if (folded.includes(" " + q)) s = 1.5;
    else return;
    seen.add(folded);
    results.push({ text, score: s + weight - folded.length / 200 });
  };
  for (const e of extra) consider(e, 1.2);
  // 1 ou 2 lettres : des milliers de titres à trier pour rien, les suggestions fixes suffisent
  if (db && q.length >= 3) {
    const upper = q.slice(0, -1) + String.fromCharCode(q.charCodeAt(q.length - 1) + 1);
    const rows = db
      .prepare("SELECT title, rank FROM (SELECT title, rank FROM pages WHERE title_fold >= ? AND title_fold < ? LIMIT 3000) ORDER BY rank DESC LIMIT 40")
      .all(q, upper) as { title: string; rank: number }[];
    for (const r of rows) consider(cleanTitle(r.title), 1 + r.rank);
  }
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.text);
}
