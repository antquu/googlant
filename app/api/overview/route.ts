/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Flux de l'aperçu IA : une première ligne JSON avec les sources, puis le texte au fil de l'eau.
 */

import type { NextRequest } from "next/server";
import { aiEnabled, cached, overview, toSources, wantsOverview } from "@/lib/ai/overview";
import { index } from "@/lib/index-api";

export const maxDuration = 30;

const none = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  if (!q || !aiEnabled()) return none();
  const res = await index("search", q, { page: 1, perPage: 8, autoCorrect: true });
  const hits = res?.hits ?? [];
  if (!wantsOverview(q, hits)) return none();

  const done = cached(q);
  const parts = done ? null : overview(q, hits);
  // on attend le premier morceau : si Gemini ne répond pas (quota...), rien n'est envoyé ni gardé en cache
  const first = done ?? (await parts!.next().catch(() => ({ done: true, value: undefined }))).value;
  if (!first) return none();

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      ctrl.enqueue(enc.encode(JSON.stringify({ sources: toSources(hits) }) + "\n" + first));
      try {
        if (parts) for await (const part of parts) ctrl.enqueue(enc.encode(part));
      } catch (err) {
        console.error("[googlant] aperçu IA :", err);
      }
      ctrl.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // le CDN de Vercel garde aussi la réponse : une même recherche n'appelle Gemini qu'une fois
      "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400",
      "X-Accel-Buffering": "no",
    },
  });
}
