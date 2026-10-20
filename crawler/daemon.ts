/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { parseArgs } from "node:util";
import { DB_PATH, getMeta, openDb, setMeta, tx } from "../lib/db/db.ts";
import { importDirectory } from "../lib/db/import.ts";
import { deletePage, upsertPage } from "../lib/db/write.ts";
import type { CrawledPage } from "../lib/search/types.ts";
import { extract, parseSitemap, type Extracted } from "./extract.ts";
import { NetMonitor } from "./netcheck.ts";
import { extractPdf, type PdfInfo } from "./pdf.ts";
import { ALLOW_ALL, parseRobots, type RobotsRules } from "./robots.ts";
import { hostOf, normalizeUrl, siteOf } from "./url.ts";

const { values: opts } = parseArgs({
  options: {
    seeds: { type: "string", multiple: true, default: ["crawler/seeds.txt", "crawler/seeds-popular.txt"] },
    concurrency: { type: "string", default: "32" },
    delay: { type: "string", default: "1000" },
    timeout: { type: "string", default: "10000" },
    "max-per-host": { type: "string", default: "3000" },
    "max-depth": { type: "string", default: "12" },
    "max-frontier": { type: "string", default: "5000000" },
    scope: { type: "string", default: "all" },
    langs: { type: "string", default: "fr,en" },
    "pagerank-every": { type: "string", default: "15" },
    quiet: { type: "boolean", default: false },
    // plusieurs crawlers sur la même base : chacun s'occupe d'une part des sites (ex. --shard 0/2 et --shard 1/2)
    shard: { type: "string", default: "0/1" },
    // moteur de téléchargement : "go" (Colly, bin/googlant-crawler-*), "node" (fetch + cheerio) ou "auto"
    engine: { type: "string", default: "auto" },
    "go-bin": { type: "string" },
    // garde-fous pour la box internet (moteur Go) : connexions ouvertes et nouvelles connexions/s
    "max-conns": { type: "string", default: "60" },
    "conn-rate": { type: "string", default: "15" },
    // plage « nuit » (heure de Paris) où le crawler a le droit d'aller beaucoup plus vite, ex. 00:30-05:45
    night: { type: "string" },
    "night-concurrency": { type: "string", default: "150" },
    "night-max-conns": { type: "string", default: "150" },
    "night-conn-rate": { type: "string", default: "25" },
  },
});

const USER_AGENT = "GooglantBot/1.0 (+https://github.com/googlant/googlant; moteur de recherche open source)";
// ─── plage horaire : la nuit, personne n'utilise la connexion, on accélère
function parisMinutes(d = new Date()): number {
  const [h, m] = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d).split(":").map(Number);
  return h * 60 + m;
}

function inNight(spec: string | undefined, d = new Date()): boolean {
  const m = spec?.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  const now = parisMinutes(d);
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

const NIGHT = inNight(opts.night);
if (NIGHT) {
  opts.concurrency = opts["night-concurrency"];
  opts["max-conns"] = opts["night-max-conns"];
  opts["conn-rate"] = opts["night-conn-rate"];
}
const CONCURRENCY = Number(opts.concurrency);
const HOST_DELAY = Number(opts.delay);
const TIMEOUT = Number(opts.timeout);
const MAX_PER_HOST = Number(opts["max-per-host"]);
const MAX_DEPTH = Number(opts["max-depth"]);
const MAX_FRONTIER = Number(opts["max-frontier"]);
const LANGS = opts.langs === "all" ? null : opts.langs!.split(",");
const PAGERANK_EVERY = Number(opts["pagerank-every"]) * 60_000;
const MAX_BYTES = 3 * 1024 * 1024;
const [SHARD, SHARDS] = opts.shard!.split("/").map(Number) as [number, number];
const MAIN = SHARD === 0;

const HOUR = 3600;
const DAY = 24 * HOUR;
const LOW_VALUE = /\/wiki\/[^/]*(Sp%C3%A9cial|Special|Fichier|File|Aide|Help|Discussion|Talk|Utilisateur|User|Mod%C3%A8le|Template|Cat%C3%A9gorie|Category|Portail|Portal|Wikip%C3%A9dia|Wikipedia|Projet|Module|MediaWiki|R%C3%A9f%C3%A9rence)(%3A|:)|[?&](action|oldid|diff|printable|returnto|sort|order|filter|replytocom|share)=|\/(login|signin|signup|register|logout|cart|panier|connexion|inscription|wp-admin|wp-login)(\/|\.|$)|\/(tag|tags|page)\/\d+|\/feed\/?$/i;
const CHALLENGE = /^(client challenge|just a moment|attention required|access denied|403 forbidden|captcha|robot check|are you a robot)/i;

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

const db = openDb();
// même hachage dans tous les processus : un site appartient toujours au même crawler
db.function("shard_of", { deterministic: true }, (host) => {
  let h = 0;
  for (const ch of String(host)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % SHARDS;
});
const MINE = SHARDS > 1 ? ` AND shard_of(host) = ${SHARD}` : "";
const now = () => Math.floor(Date.now() / 1000);

interface Job {
  url: string;
  host: string;
  depth: number;
  interval: number;
  attempts: number;
}
const queues = new Map<string, Job[]>();
const nextSlot = new Map<string, number>();
const robotsMem = new Map<string, Promise<RobotsRules>>();
const hostLimits = new Map<string, number>();
const seedSites = new Set<string>();
const seedHosts = new Set<string>();
let stopping = false;
let lastActivity = Date.now();
let inFlight = 0;
// dernier PageRank connu : pas de recalcul à chaque redémarrage
let lastRank = getMeta<{ at: number }>(db, "pagerank")?.at ?? 0;
let lastRefill = 0;
let lastCount = 0;
let pagesSinceRank = 0;
const recent: number[] = [];
const counters = (db.prepare("SELECT (SELECT count(*) FROM pages) AS pages, (SELECT count(*) FROM hosts WHERE pages > 0) AS hosts, (SELECT count(*) FROM images) AS images, (SELECT count(*) FROM frontier WHERE state = 0) AS queued").get() as {
  pages: number;
  hosts: number;
  images: number;
  queued: number;
});

const q = {
  priorityDue: db.prepare(`SELECT url, host, depth, interval, attempts FROM frontier WHERE state = 0 AND next_at = 0${MINE} LIMIT 50`),
  boostGet: db.prepare("SELECT boost, sitemap_at FROM hosts WHERE host = ?"),
  boostUse: db.prepare("UPDATE hosts SET boost = max(boost - ?, 0) WHERE host = ?"),
  sitemapDone: db.prepare("UPDATE hosts SET sitemap_at = ? WHERE host = ?"),
  enqueuePriority: db.prepare(
    `INSERT INTO frontier(url, host, depth, next_at, interval) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(url) DO UPDATE SET next_at = 0 WHERE frontier.state = 0 AND frontier.next_at > ?`,
  ),
  lease: db.prepare("UPDATE frontier SET next_at = ? WHERE url = ?"),
  enqueue: db.prepare("INSERT OR IGNORE INTO frontier(url, host, depth, next_at, interval) VALUES (?, ?, ?, ?, ?)"),
  reschedule: db.prepare("UPDATE frontier SET next_at = ?, interval = ?, attempts = ?, state = ? WHERE url = ?"),
  hostQueued: db.prepare("SELECT queued, pages FROM hosts WHERE host = ?"),
  hostBump: db.prepare("INSERT INTO hosts(host, queued) VALUES (?, 1) ON CONFLICT(host) DO UPDATE SET queued = queued + 1"),
  robotsGet: db.prepare("SELECT robots, robots_at FROM hosts WHERE host = ?"),
  robotsSet: db.prepare("INSERT INTO hosts(host, robots, robots_at) VALUES (?, ?, ?) ON CONFLICT(host) DO UPDATE SET robots = excluded.robots, robots_at = excluded.robots_at"),
  sameHash: db.prepare("SELECT url FROM pages WHERE content_hash = ? AND url <> ? LIMIT 1"),
  event: db.prepare("INSERT INTO events(at, kind, url, title, host) VALUES (?, ?, ?, ?, ?)"),
  trimEvents: db.prepare("DELETE FROM events WHERE id < (SELECT max(id) FROM events) - 1000"),
};

function loadSeeds() {
  const lines = [...opts.seeds!, "data/queue.txt"]
    .filter((f) => existsSync(f))
    .flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/))
    .map((l) => l.replace(/#.*/, "").trim())
    .filter(Boolean);
  let added = 0;
  tx(db, () => {
    for (const line of lines) {
      const [raw, ...flags] = line.split(/\s+/);
      const url = normalizeUrl(raw);
      if (!url) continue;
      const host = hostOf(url);
      seedSites.add(siteOf(url));
      seedHosts.add(host);
      const max = flags.map((f) => f.match(/^max=(\d+)$/)?.[1]).find(Boolean);
      if (max) hostLimits.set(host, Number(max) * 50);
      if (q.enqueue.run(url, host, 0, now(), 6 * HOUR).changes) {
        q.hostBump.run(host);
        added++;
      }
    }
  });
  counters.queued += added;
  return { total: lines.length, added };
}

const priority: Job[] = [];

function refillPriority() {
  const rows = q.priorityDue.all() as unknown as Job[];
  if (!rows.length) return;
  const lease = now() + 30 * 60;
  tx(db, () => {
    for (const r of rows) {
      q.lease.run(lease, r.url);
      priority.push(r);
    }
  });
  log(c.bold("prioritaire"), `${rows.length} site(s) proposé(s) ajouté(s) en tête de file`);
}

// la sélection (quelques secondes sur une grosse file) tourne dans crawler/refill-worker.mjs
const picker = new Worker(new URL("./refill-worker.mjs", import.meta.url), { workerData: { dbPath: DB_PATH, shard: SHARD, shards: SHARDS } });
picker.unref();
let picking = false;

function refill() {
  if (picking) return;
  picking = true;
  lastRefill = Date.now();
  picker.once("message", ({ rows, error }: { rows: Job[]; error?: string }) => {
    picking = false;
    if (error) return log(c.red("file"), error);
    lease(rows);
  });
  picker.postMessage({ now: now(), limit: 6000, idle: !priority.length && queuedJobs() === 0 });
}

function lease(rows: Job[]) {
  const lease = now() + 30 * 60;
  tx(db, () => {
    for (const r of rows) {
      q.lease.run(lease, r.url);
      const list = queues.get(r.host) ?? [];
      list.push(r);
      queues.set(r.host, list);
    }
  });
}

function take(): Job | null {
  const t = Date.now();
  const p = priority.findIndex((j) => (nextSlot.get(j.host) ?? 0) <= t);
  if (p >= 0) {
    const job = priority.splice(p, 1)[0];
    nextSlot.set(job.host, Number.POSITIVE_INFINITY);
    return job;
  }
  for (const [host, list] of queues) {
    if (!list.length) {
      queues.delete(host);
      continue;
    }
    if ((nextSlot.get(host) ?? 0) > t) continue;
    const job = list.shift()!;
    nextSlot.set(host, Number.POSITIVE_INFINITY);
    queues.delete(host);
    if (list.length) queues.set(host, list);
    return job;
  }
  return null;
}

function queuedJobs() {
  let n = 0;
  for (const l of queues.values()) n += l.length;
  return n;
}

function robotsFor(url: string): Promise<RobotsRules> {
  const origin = new URL(url).origin;
  let p = robotsMem.get(origin);
  if (p) return p;
  p = (async () => {
    const host = new URL(url).hostname;
    const cached = q.robotsGet.get(host) as { robots: string | null; robots_at: number | null } | undefined;
    if (cached?.robots_at && now() - cached.robots_at < DAY) return cached.robots ? parseRobots(cached.robots, USER_AGENT) : ALLOW_ALL;
    let txt = "";
    try {
      const r = await fetchText(`${origin}/robots.txt`, "text/plain");
      if (r?.res.ok) txt = r.body.slice(0, 200_000);
    } catch {
    }
    q.robotsSet.run(host, txt, now());
    return txt ? parseRobots(txt, USER_AGENT) : ALLOW_ALL;
  })();
  robotsMem.set(origin, p);
  if (robotsMem.size > 20_000) robotsMem.delete(robotsMem.keys().next().value!);
  return p;
}

async function fetchText(url: string, accept: string): Promise<{ res: Response; body: string; raw: Buffer } | null> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7" },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.body) return { res, body: "", raw: Buffer.alloc(0) };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks);
  return { res, body: raw.toString("utf8"), raw };
}

const sitemapPending = new Set<string>();

/** Pour un site proposé, lit ses sitemaps (annoncés dans robots.txt, sinon /sitemap.xml) et met ses pages en tête de file. */
async function maybeSitemap(job: Job) {
  const info = q.boostGet.get(job.host) as { boost: number; sitemap_at: number | null } | undefined;
  if (!info || info.boost <= 0 || info.sitemap_at || sitemapPending.has(job.host)) return;
  sitemapPending.add(job.host);
  try {
    const origin = new URL(job.url).origin;
    const robots = await robotsFor(job.url);
    const todo = robots.sitemaps.length ? robots.sitemaps.slice(0, 5) : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
    const found: string[] = [];
    for (let i = 0; i < todo.length && i < 12 && found.length < info.boost; i++) {
      try {
        const r = await fetchText(todo[i], "application/xml,text/xml");
        if (!r || !r.res.ok) continue;
        const { pages, sitemaps } = parseSitemap(r.body);
        todo.push(...sitemaps.slice(0, 10));
        for (const p of pages) {
          const n = normalizeUrl(p);
          if (n && hostOf(n) === job.host && robots.isAllowed(n) && !LOW_VALUE.test(n)) found.push(n);
        }
      } catch {
        continue;
      }
    }
    // Katana fouille aussi le site et ses fichiers JavaScript pour trouver les pages qui n'y sont pas
    if (found.length < info.boost) {
      for (const u of await katana(origin, info.boost - found.length)) if (hostOf(u) === job.host && robots.isAllowed(u) && !LOW_VALUE.test(u)) found.push(u);
    }
    const list = [...new Set(found)].slice(0, info.boost);
    let added = 0;
    tx(db, () => {
      for (const u of list) if (q.enqueuePriority.run(u, job.host, 1, DAY, now() + 60).changes) added++;
      q.sitemapDone.run(now(), job.host);
      if (added) q.boostUse.run(added, job.host);
    });
    counters.queued += added;
    if (added) log(c.bold("sitemap"), `${job.host} : ${added} pages ajoutées en priorité`);
  } finally {
    sitemapPending.delete(job.host);
  }
}

/** Découverte d'URLs avec Katana (ProjectDiscovery), si le binaire est présent dans bin/ ou le PATH. */
function katanaBinary(): string | null {
  const arch = process.arch === "x64" ? "amd64" : process.arch;
  const local = `bin/katana-${process.platform}-${arch}${process.platform === "win32" ? ".exe" : ""}`;
  if (existsSync(local)) return local;
  for (const dir of (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":")) {
    const p = `${dir}/katana${process.platform === "win32" ? ".exe" : ""}`;
    if (dir && existsSync(p)) return p;
  }
  return null;
}

const KATANA = katanaBinary();

function katana(origin: string, limit: number): Promise<string[]> {
  if (!KATANA || limit <= 0) return Promise.resolve([]);
  return new Promise((resolve) => {
    const urls = new Set<string>();
    // poli : 3 requêtes/s, 2 connexions, 90 s maximum, profondeur 3, lecture des fichiers JS
    const child = spawn(KATANA, ["-u", origin, "-d", "3", "-jc", "-kf", "robotstxt,sitemapxml", "-c", "2", "-p", "1", "-rl", "3", "-ct", "90s", "-timeout", "8", "-fs", "fqdn", "-silent", "-nc", "-H", `User-Agent: ${USER_AGENT}`, "-ef", "png,jpg,jpeg,gif,svg,webp,ico,css,woff,woff2,ttf,mp4,mp3,zip"], { stdio: ["ignore", "pipe", "ignore"] });
    const timer = setTimeout(() => child.kill(), 120_000);
    createInterface({ input: child.stdout! }).on("line", (line) => {
      const n = normalizeUrl(line.trim());
      if (n) urls.add(n);
      if (urls.size >= limit) child.kill();
    });
    child.on("close", () => {
      clearTimeout(timer);
      if (urls.size) log(c.bold("katana"), `${origin} : ${urls.size} URLs découvertes`);
      resolve([...urls]);
    });
    child.on("error", () => resolve([]));
  });
}

// ─── programmation des visites
function baseInterval(depth: number) {
  return depth === 0 ? 6 * HOUR : depth === 1 ? DAY : 3 * DAY;
}

function nextInterval(job: Job, changed: boolean) {
  const min = job.depth === 0 ? HOUR : 6 * HOUR;
  const raw = changed ? job.interval * 0.6 : job.interval * 1.5;
  return Math.round(Math.min(30 * DAY, Math.max(min, raw)));
}

function reschedule(job: Job, interval: number, attempts = 0, state = 0) {
  const jitter = Math.floor(interval * 0.1 * Math.random());
  q.reschedule.run(now() + interval + jitter, interval, attempts, state, job.url);
}

function fail(job: Job) {
  const attempts = job.attempts + 1;
  if (attempts >= 5) reschedule(job, 30 * DAY, attempts, 2);
  else reschedule(job, HOUR * 2 ** attempts, attempts);
}

function canEnqueue(url: string, depth: number): boolean {
  if (depth > MAX_DEPTH || LOW_VALUE.test(url)) return false;
  const host = hostOf(url);
  if (!host) return false;
  if (opts.scope === "hosts" && !seedHosts.has(host)) return false;
  if (opts.scope === "sites" && !seedSites.has(siteOf(url))) return false;
  if (counters.queued >= MAX_FRONTIER && depth > 2) return false;
  const h = q.hostQueued.get(host) as { queued: number } | undefined;
  return (h?.queued ?? 0) < (hostLimits.get(host) ?? MAX_PER_HOST);
}

async function visit(job: Job) {
  const started = Date.now();
  lastActivity = started;
  void maybeSitemap(job);
  const robots = await robotsFor(job.url);
  const delay = Math.max(HOST_DELAY, robots.crawlDelayMs ?? 0);
  try {
    if (!robots.isAllowed(job.url)) {
      reschedule(job, 7 * DAY, 0, 2);
      return log(c.yellow("robots"), job.url);
    }
    const r = await fetchText(job.url, "text/html,application/xhtml+xml,application/pdf;q=0.8");
    if (!r) {
      reschedule(job, 30 * DAY, 0, 2);
      return log(c.yellow("trop gros"), job.url);
    }
    const { res, body } = r;
    if (res.status === 404 || res.status === 410) {
      tx(db, () => {
        deletePage(db, job.url);
        reschedule(job, 30 * DAY, 0, 2);
      });
      return log(c.red(String(res.status)), job.url);
    }
    if (!res.ok) {
      fail(job);
      return log(c.red(String(res.status)), job.url);
    }
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("application/pdf") || /\.pdf$/i.test(new URL(res.url).pathname)) {
      const finalUrl = normalizeUrl(res.url) ?? job.url;
      return indexPdf(job, res.status, finalUrl, extractPdf(r.raw, finalUrl));
    }
    if (!type.includes("html")) {
      reschedule(job, 30 * DAY, 0, 2);
      return;
    }

    const finalUrl = normalizeUrl(res.url) ?? job.url;
    processPage(job, res.status, finalUrl, extract(body, finalUrl));
  } catch (err) {
    fail(job);
    log(c.red("erreur"), `${job.url} ${c.dim(String((err as Error).message ?? err).slice(0, 80))}`);
  } finally {
    nextSlot.set(job.host, Math.max(Date.now(), started) + delay);
  }
}

/** Indexe une page HTML analysée (par cheerio côté Node ou par Colly côté Go). */
function processPage(job: Job, httpStatus: number, finalUrl: string, page: Extracted) {
    const wrongLang = !!LANGS && !!page.lang && !LANGS.includes(page.lang.slice(0, 2));
    const url = page.canonical && hostOf(page.canonical) === hostOf(finalUrl) ? page.canonical : finalUrl;

    const discovered: string[] = [];
    if (!page.nofollow && !wrongLang && job.depth < MAX_DEPTH) for (const l of page.links) if (canEnqueue(l, job.depth + 1)) discovered.push(l);

    const indexable = !page.noindex && !wrongLang && !CHALLENGE.test(page.title) && (page.title || page.text.length >= 80);
    const duplicate = indexable && (q.sameHash.get(page.contentHash, url) as { url: string } | undefined);

    let created = false;
    let changed = false;
    tx(db, () => {
      let added = 0;
      // site proposé : ses liens internes passent en tête de file tant qu'il lui reste du crédit
      const boost = (q.boostGet.get(job.host) as { boost: number } | undefined)?.boost ?? 0;
      let boosted = 0;
      for (const l of discovered) {
        if (boosted < boost && hostOf(l) === job.host) {
          if (q.enqueuePriority.run(l, job.host, job.depth + 1, baseInterval(job.depth + 1), now() + 60).changes) {
            boosted++;
            added++;
          }
          continue;
        }
        if (q.enqueue.run(l, hostOf(l), job.depth + 1, now(), baseInterval(job.depth + 1)).changes) {
          q.hostBump.run(hostOf(l));
          added++;
        }
      }
      counters.queued += added;
      if (boosted) q.boostUse.run(boosted, job.host);

      if (url !== job.url) {
        if (boost > 0 && hostOf(url) === job.host) q.enqueuePriority.run(url, job.host, job.depth, job.interval, now() + 60);
        else q.enqueue.run(url, hostOf(url), job.depth, now() + job.interval, job.interval);
        reschedule(job, 30 * DAY, 0, 2);
      }

      if (!indexable || duplicate) {
        if (url === job.url) reschedule(job, nextInterval(job, false) * 2);
        return;
      }

      const record: CrawledPage = {
        url,
        finalUrl,
        canonical: page.canonical,
        status: httpStatus,
        crawledAt: new Date().toISOString(),
        depth: job.depth,
        lang: page.lang,
        title: page.title,
        description: page.description,
        headings: page.headings,
        text: page.text,
        siteName: page.siteName,
        favicon: page.favicon,
        image: page.image,
        publishedAt: page.publishedAt,
        images: page.images,
        links: page.links,
        contentHash: page.contentHash,
      };
      const out = upsertPage(db, record);
      created = out.created;
      changed = out.changed;
      if (url === job.url) reschedule(job, nextInterval(job, changed));
      if (changed) q.event.run(Date.now(), "indexed", url, page.title.slice(0, 200), hostOf(url));
    });

    if (created) {
      counters.pages++;
      pagesSinceRank++;
    }
    recent.push(Date.now());
    const status = !indexable ? c.dim("ignorée") : duplicate ? c.dim("doublon") : created ? c.green("nouvelle") : changed ? c.cyan("modifiée") : c.dim("inchangée");
    log(status, `${url} ${c.dim("— " + page.title.slice(0, 60))}${discovered.length ? c.dim(` (+${discovered.length} liens)`) : ""}`);
}

/** Documents PDF : titre et texte, sans liens à suivre. */
function indexPdf(job: Job, status: number, finalUrl: string, pdf: PdfInfo | null) {
  if (!pdf || !pdf.title) {
    reschedule(job, 30 * DAY, 0, 2);
    return log(c.dim("pdf illisible"), job.url);
  }
  if (LANGS && pdf.lang && !LANGS.includes(pdf.lang)) {
    reschedule(job, 30 * DAY, 0, 2);
    return;
  }
  let created = false;
  let changed = false;
  tx(db, () => {
    if (q.sameHash.get(pdf.contentHash, finalUrl)) {
      reschedule(job, nextInterval(job, false) * 2);
      return;
    }
    const out = upsertPage(db, {
      url: finalUrl,
      finalUrl,
      status,
      crawledAt: new Date().toISOString(),
      depth: job.depth,
      lang: pdf.lang,
      title: pdf.title,
      description: pdf.text.slice(0, 280),
      headings: [],
      text: pdf.text,
      siteName: hostOf(finalUrl),
      images: [],
      links: [],
      contentHash: pdf.contentHash,
    });
    created = out.created;
    changed = out.changed;
    // un PDF change rarement : revisite espacée
    reschedule(job, Math.max(nextInterval(job, changed), 7 * DAY));
    if (changed) q.event.run(Date.now(), "indexed", finalUrl, pdf.title.slice(0, 200), hostOf(finalUrl));
  });
  if (created) {
    counters.pages++;
    pagesSinceRank++;
  }
  recent.push(Date.now());
  log(created ? c.green("pdf") : c.dim("pdf"), `${finalUrl} ${c.dim("— " + pdf.title.slice(0, 60))}`);
}

// ─── moteur Go (Colly) : il télécharge et analyse, Node garde la file et l'index
interface GoResult {
  id: number;
  kind: "html" | "pdf" | "skip" | "http" | "robots" | "error";
  status?: number;
  finalUrl?: string;
  page?: Extracted;
  pdf?: PdfInfo;
  error?: string;
}

function goBinary(): string | null {
  const arch = process.arch === "x64" ? "amd64" : process.arch;
  const bin = opts["go-bin"] ?? `bin/googlant-crawler-${process.platform}-${arch}${process.platform === "win32" ? ".exe" : ""}`;
  return existsSync(bin) ? bin : null;
}

function handleGo(job: Job, r: GoResult) {
  const finalUrl = (r.finalUrl && normalizeUrl(r.finalUrl)) || job.url;
  switch (r.kind) {
    case "robots":
      reschedule(job, 7 * DAY, 0, 2);
      return log(c.yellow("robots"), job.url);
    case "http":
      if (r.status === 404 || r.status === 410) {
        tx(db, () => {
          deletePage(db, job.url);
          reschedule(job, 30 * DAY, 0, 2);
        });
      } else fail(job);
      return log(c.red(String(r.status)), job.url);
    case "skip":
      reschedule(job, 30 * DAY, 0, 2);
      return;
    case "pdf":
      return indexPdf(job, r.status ?? 200, finalUrl, r.pdf ?? null);
    case "html": {
      const page = r.page!;
      // Colly renvoie des liens absolus bruts : même normalisation que le reste du crawler
      const links = new Set<string>();
      for (const l of page.links) {
        const n = normalizeUrl(l);
        if (n) links.add(n);
        if (links.size >= 300) break;
      }
      page.links = [...links];
      page.canonical = page.canonical ? (normalizeUrl(page.canonical) ?? undefined) : undefined;
      return processPage(job, r.status ?? 200, finalUrl, page);
    }
    default:
      fail(job);
      return log(c.red("erreur"), `${job.url} ${c.dim((r.error ?? "").slice(0, 80))}`);
  }
}

async function runGo(bin: string) {
  const child = spawn(
    bin,
    ["-delay", `${HOST_DELAY}ms`, "-timeout", `${TIMEOUT}ms`, "-ua", USER_AGENT, "-max-conns", opts["max-conns"]!, "-conn-rate", opts["conn-rate"]!],
    { stdio: ["pipe", "pipe", "inherit"] },
  );
  const inflight = new Map<number, { job: Job; at: number }>();
  const hostFails = new Map<string, number>();
  let nextId = 1;

  // frein automatique, d'après des mini speedtests de la connexion (crawler/netcheck.ts) :
  // si la latence explose ou si le débit s'effondre, la box sature → on divise par deux ;
  // sinon on remonte de +10 toutes les 20 s. La nuit, pas de frein : seuls les plafonds du moteur Go.
  let target = NIGHT ? CONCURRENCY : Math.min(CONCURRENCY, 40);
  let windowTotal = 0;
  let windowTimeouts = 0;
  const net = new NetMonitor();
  let checking = false;
  const throttle = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      const h = await net.check();
      const ratio = windowTotal >= 20 ? windowTimeouts / windowTotal : 0;
      windowTotal = 0;
      windowTimeouts = 0;
      const before = target;
      if (NIGHT) target = CONCURRENCY;
      // seuls les speedtests comptent : des sites lents (délais dépassés) ne disent rien de la box
      else if (!h.ok) target = Math.max(5, Math.floor(target / 2));
      else target = Math.min(CONCURRENCY, target + 10);
      if (target !== before || !h.ok) {
        const why = h.ok ? `connexion en forme, ${Math.round(ratio * 100)} % de sites lents` : h.reason;
        // toujours affiché, même avec --quiet : c'est ce qui protège la box
        console.log(`${new Date().toLocaleTimeString("fr-FR")} ${c.bold("vitesse")} ${before} → ${target} pages en parallèle (${why} · ping ${h.latencyMs?.toFixed(0) ?? "?"} ms${h.mbps ? ` · ${h.mbps.toFixed(1)} Mbit/s` : ""})`);
      }
      setMeta(db, "netcheck", { at: Date.now(), target, night: NIGHT, ...h });
    } finally {
      checking = false;
    }
  }, 20_000);
  child.on("exit", (code) => {
    if (stopping) return;
    console.error(`moteur Go arrêté (code ${code}) : redémarrage du crawler`);
    process.exit(1);
  });
  // binaire absent ou non exécutable : on s'arrête pour être relancé, plutôt que d'attendre sans rien faire
  child.on("error", (err) => {
    console.error(`moteur Go impossible à lancer : ${err.message}`);
    process.exit(1);
  });
  createInterface({ input: child.stdout! }).on("line", (line) => {
    let r: GoResult;
    try {
      r = JSON.parse(line) as GoResult;
    } catch {
      return;
    }
    const entry = inflight.get(r.id);
    if (!entry) return;
    inflight.delete(r.id);
    lastActivity = Date.now();
    try {
      windowTotal++;
      const timedOut = r.kind === "error" && /timeout|deadline|i\/o/i.test(r.error ?? "");
      if (timedOut) windowTimeouts++;
      // site qui ne répond pas deux fois de suite : mis de côté 15 min pour ne pas bloquer les places
      if (timedOut) hostFails.set(entry.job.host, (hostFails.get(entry.job.host) ?? 0) + 1);
      else hostFails.delete(entry.job.host);
      handleGo(entry.job, r);
    } catch (err) {
      fail(entry.job);
      log(c.red("erreur"), `${entry.job.url} ${c.dim(String((err as Error).message ?? err).slice(0, 80))}`);
    } finally {
      const fails = hostFails.get(entry.job.host) ?? 0;
      nextSlot.set(entry.job.host, Date.now() + (fails >= 2 ? 15 * 60_000 : HOST_DELAY));
      if (hostFails.size > 50_000) hostFails.clear();
    }
  });

  while (!stopping) {
    let sent = 0;
    while (inflight.size < target) {
      const job = take();
      if (!job) break;
      void maybeSitemap(job);
      const id = nextId++;
      inflight.set(id, { job, at: Date.now() });
      child.stdin!.write(JSON.stringify({ id, url: job.url }) + "\n");
      sent++;
    }
    // requête restée sans réponse (ne devrait pas arriver) : on libère la place
    for (const [id, e] of inflight) {
      if (Date.now() - e.at > TIMEOUT * 3 + 10_000) {
        inflight.delete(id);
        fail(e.job);
        nextSlot.set(e.job.host, Date.now() + HOST_DELAY);
      }
    }
    inFlight = inflight.size;
    await sleep(sent ? 25 : 200);
  }
  clearInterval(throttle);
  child.stdin!.end();
  await Promise.race([new Promise((ok) => child.once("exit", ok)), sleep(TIMEOUT + 2000)]);
  child.kill();
}

function log(status: string, msg: string) {
  if (opts.quiet) return;
  console.log(`${c.dim(new Date().toLocaleTimeString("fr-FR"))} ${status.padEnd(18)} ${msg}`);
}

function publishStats() {
  const minuteAgo = Date.now() - 60_000;
  while (recent.length && recent[0] < minuteAgo) recent.shift();
  if (SHARDS > 1) setMeta(db, `rate:${SHARD}`, { at: Date.now(), perMinute: recent.length });
  // seul le crawler principal publie les chiffres du site, en additionnant les vitesses de tous
  if (!MAIN) return;
  let perMinute = recent.length;
  if (SHARDS > 1) {
    perMinute = 0;
    for (const row of db.prepare("SELECT value FROM meta WHERE key LIKE 'rate:%'").all() as { value: string }[]) {
      const r = JSON.parse(row.value) as { at: number; perMinute: number };
      if (Date.now() - r.at < 30_000) perMinute += r.perMinute;
    }
    if (Date.now() - lastCount > 30_000) {
      counters.pages = (db.prepare("SELECT count(*) AS n FROM pages").get() as { n: number }).n;
      counters.queued = (db.prepare("SELECT count(*) AS n FROM frontier WHERE state = 0").get() as { n: number }).n;
      lastCount = Date.now();
    }
  }
  const fresh = db.prepare("SELECT (SELECT count(*) FROM hosts WHERE pages > 0) AS hosts, (SELECT max(id) FROM images) AS images").get() as { hosts: number; images: number | null };
  counters.hosts = fresh.hosts;
  counters.images = fresh.images ?? 0;
  setMeta(db, "stats", { at: Date.now(), pages: counters.pages, hosts: counters.hosts, images: counters.images, queued: counters.queued, perMinute });
}

// le PageRank (des millions de liens) tourne dans un processus à part : le crawler ne s'arrête jamais
let rankRunning = false;
function maybePageRank() {
  if (rankRunning || Date.now() - lastRank < PAGERANK_EVERY || pagesSinceRank === 0) return;
  rankRunning = true;
  pagesSinceRank = 0;
  const tsx = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
  const job = fileURLToPath(new URL("./pagerank-job.ts", import.meta.url));
  const child = spawn(process.execPath, [tsx, job], { stdio: ["ignore", "inherit", "inherit"] });
  child.on("exit", () => {
    rankRunning = false;
    lastRank = Date.now();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

process.on("uncaughtException", (err) => log(c.red("erreur réseau"), c.dim(err.message.split("\n")[0])));
process.on("unhandledRejection", (err) => log(c.red("erreur"), c.dim(String(err).slice(0, 120))));

async function main() {
  const seeds = MAIN ? loadSeeds() : { total: 0, added: 0 };
  const dir = MAIN ? importDirectory(db, "crawler/directory.json") : 0;
  console.log(c.bold(`\nGooglantBot — crawler permanent${SHARDS > 1 ? ` (part ${SHARD + 1}/${SHARDS})` : ""}`));
  console.log(c.dim(`  index : ${counters.pages.toLocaleString("fr-FR")} pages · file : ${counters.queued.toLocaleString("fr-FR")} URLs · ${seeds.added} nouvelles graines${dir ? ` · ${dir} fiches d'annuaire` : ""}`));
  console.log(c.dim(`  ${CONCURRENCY} requêtes simultanées · ${HOST_DELAY} ms minimum entre deux pages d'un même site · langues : ${opts.langs}\n`));

  const stop = () => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log(c.yellow("\narrêt demandé — fin des requêtes en cours…"));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const timers = [
    setInterval(() => {
      refillPriority();
      if (queuedJobs() < 2500 && Date.now() - lastRefill > 5_000) refill();
    }, 2000),
    setInterval(publishStats, 5000),
    setInterval(() => MAIN && q.trimEvents.run(), 60_000),
    // chien de garde : plus aucune page traitée depuis 10 min alors que la file n'est pas vide → redémarrage (systemd/pm2 relancent)
    setInterval(() => {
      if (Date.now() - lastActivity > 10 * 60_000 && counters.queued > 0) {
        console.error("crawler bloqué depuis 10 minutes : redémarrage");
        process.exit(1);
      }
    }, 60_000),
    setInterval(() => MAIN && maybePageRank(), 60_000),
  ];
  refill();
  publishStats();

  if (opts.night) {
    console.log(c.dim(`  plage rapide ${opts.night} (heure de Paris) : ${NIGHT ? "EN COURS, plein régime" : "pas maintenant, mode prudent"}\n`));
    const watch = setInterval(() => {
      if (inNight(opts.night) === NIGHT || stopping) return;
      clearInterval(watch);
      console.log(c.bold(`\n${NIGHT ? "fin de la plage rapide : retour au mode prudent" : "début de la plage rapide : plein régime"}`));
      stopping = true;
    }, 30_000);
  }
  const bin = opts.engine === "node" ? null : goBinary();
  if (opts.engine === "go" && !bin) throw new Error("moteur Go introuvable : compilez crawler-go (voir README)");
  console.log(c.dim(`  moteur : ${bin ? `Go / Colly (${bin})` : "Node (fetch + cheerio)"}\n`));
  const workers = bin ? [runGo(bin)] : Array.from({ length: CONCURRENCY }, async () => {
    while (!stopping) {
      const job = take();
      if (!job) {
        await sleep(250);
        continue;
      }
      inFlight++;
      await Promise.race([visit(job), sleep(TIMEOUT * 2 + 5000)]);
      inFlight--;
    }
  });
  await Promise.all(workers);

  timers.forEach(clearInterval);
  publishStats();
  tx(db, () => {
    for (const list of queues.values()) for (const j of list) q.lease.run(now(), j.url);
    for (const j of priority) q.lease.run(0, j.url);
  });
  db.close();
  console.log(c.bold("crawler arrêté proprement."));
  process.exit(0);
}

main();
