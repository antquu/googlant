/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { index } from "@/lib/index-api";

export const dynamic = "force-dynamic";

// flux en direct (Server-Sent Events) des chiffres du crawler et des dernières pages indexées.
// Servi par le serveur qui héberge l'index (exposé par Tailscale Funnel) : sur Vercel il est
// désactivé pour ne pas garder de fonctions ouvertes, les navigateurs s'y connectent directement.

const MAX_CLIENTS = 400;
const TICK_MS = 2_000;

type Client = ReadableStreamDefaultController<Uint8Array>;
const state = globalThis as unknown as { __live?: { clients: Set<Client>; timer: ReturnType<typeof setInterval> | null; last: string } };
const live = (state.__live ??= { clients: new Set(), timer: null, last: "" });
const enc = new TextEncoder();

const CORS = { "Access-Control-Allow-Origin": "*" };

async function tick() {
  if (!live.clients.size) {
    if (live.timer) clearInterval(live.timer);
    live.timer = null;
    return;
  }
  const data = await index("live").catch(() => null);
  if (!data) return;
  const json = JSON.stringify(data);
  // rien de neuf : simple battement pour garder la connexion ouverte
  const chunk = enc.encode(json === live.last ? ": ping\n\n" : `data: ${json}\n\n`);
  live.last = json;
  for (const c of live.clients) {
    try {
      c.enqueue(chunk);
    } catch {
      live.clients.delete(c);
    }
  }
}

export async function GET(req: Request) {
  if (process.env.GOOGLANT_INDEX_URL) return new Response("flux servi par le serveur d'index", { status: 404, headers: CORS });
  if (live.clients.size >= MAX_CLIENTS) return new Response("trop de connexions", { status: 503, headers: { ...CORS, "Retry-After": "30" } });

  let me: Client | null = null;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      me = controller;
      live.clients.add(controller);
      controller.enqueue(enc.encode("retry: 5000\n\n"));
      const first = await index("live").catch(() => null);
      if (first) controller.enqueue(enc.encode(`data: ${JSON.stringify(first)}\n\n`));
      live.timer ??= setInterval(tick, TICK_MS);
    },
    cancel() {
      if (me) live.clients.delete(me);
    },
  });
  req.signal.addEventListener("abort", () => {
    if (me) live.clients.delete(me);
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
