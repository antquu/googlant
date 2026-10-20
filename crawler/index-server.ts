/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Serveur d'index autonome (sans Next.js) pour la machine du crawler : le site tourne ailleurs
 * (localhost, Vercel…) et l'interroge avec GOOGLANT_INDEX_URL.
 *
 *   POST /api/index         opérations de recherche (jeton GOOGLANT_INDEX_TOKEN)
 *   GET  /api/live          chiffres en direct + dernières pages indexées
 *   GET  /api/live/stream   les mêmes, en flux continu (Server-Sent Events)
 *
 * Lancement : tsx --conditions=react-server crawler/index-server.ts   (port : PORT, 3000 par défaut)
 */

import { timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

// mêmes variables que le site (.env.local), sans dépendre de Next.js pour les lire
for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
delete process.env.GOOGLANT_INDEX_URL; // ce serveur EST l'index : toujours la base locale

const { runLocal } = await import("../lib/index-api.ts");
type Op = Parameters<typeof runLocal>[0];

const PORT = Number(process.env.PORT ?? 3000);
const OPS = new Set<Op>(["search", "news", "images", "suggest", "home", "live", "stats", "siblings", "submit", "pois", "poisIn"]);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type" };
const MAX_STREAMS = 400;

function authorized(req: IncomingMessage): boolean {
  const expected = process.env.GOOGLANT_INDEX_TOKEN;
  if (!expected) return false;
  const a = Buffer.from(String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(res: ServerResponse, status: number, body: unknown, cache = "no-store") {
  res.writeHead(status, { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 64 * 1024) throw new Error("trop gros");
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// ─── flux en direct : un seul calcul toutes les 2 s, diffusé à tous les navigateurs connectés
const streams = new Set<ServerResponse>();
let last = "";
let ticker: ReturnType<typeof setInterval> | null = null;

async function tick() {
  if (!streams.size) {
    if (ticker) clearInterval(ticker);
    ticker = null;
    return;
  }
  const data = await runLocal("live", [] as never).catch(() => null);
  if (!data) return;
  const body = JSON.stringify(data);
  const chunk = body === last ? ": ping\n\n" : `data: ${body}\n\n`;
  last = body;
  for (const s of streams) s.write(chunk);
}

async function stream(req: IncomingMessage, res: ServerResponse) {
  if (streams.size >= MAX_STREAMS) return json(res, 503, { error: "trop de connexions" });
  res.writeHead(200, { ...CORS, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.write("retry: 5000\n\n");
  const first = await runLocal("live", [] as never).catch(() => null);
  if (first) res.write(`data: ${JSON.stringify(first)}\n\n`);
  streams.add(res);
  req.on("close", () => streams.delete(res));
  ticker ??= setInterval(tick, 2_000);
}

const server = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...CORS, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" });
      return res.end();
    }
    if (req.method === "GET" && path === "/api/live/stream") return await stream(req, res);
    if (req.method === "GET" && path === "/api/live") {
      const live = await runLocal("live", [] as never);
      return live ? json(res, 200, live, "public, max-age=5") : json(res, 503, { stats: null, items: [] });
    }
    if (req.method === "GET" && path === "/health") return json(res, 200, { ok: true, streams: streams.size });
    if (req.method === "POST" && path === "/api/index") {
      if (!authorized(req)) return json(res, 401, { error: "Non autorisé" });
      const body = JSON.parse(await readBody(req)) as { op?: Op; args?: unknown[] };
      if (!body.op || !OPS.has(body.op) || !Array.isArray(body.args) || body.args.length > 4) return json(res, 400, { error: "Opération inconnue" });
      if (typeof body.args[0] === "string" && body.args[0].length > 300) return json(res, 400, { error: "Requête trop longue" });
      const out = await runLocal(body.op, body.args as never);
      return out === null ? json(res, 503, { error: "Index indisponible" }) : json(res, 200, out);
    }
    json(res, 404, { error: "introuvable" });
  } catch (err) {
    json(res, 500, { error: String((err as Error).message ?? err).slice(0, 120) });
  }
});

server.listen(PORT, "0.0.0.0", () => console.log(`serveur d'index Googlant sur le port ${PORT}`));
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => server.close(() => process.exit(0)));
