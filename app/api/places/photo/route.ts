/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { type NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const ref = req.nextUrl.searchParams.get("ref") ?? "";
  if (!key || !/^places\/[\w-]+\/photos\/[\w-]+$/.test(ref)) return new Response("Introuvable", { status: 404 });

  const res = await fetch(`https://places.googleapis.com/v1/${ref}/media?maxWidthPx=640&key=${key}`, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok || !res.body) return new Response("Introuvable", { status: 404 });
  return new Response(res.body, {
    headers: { "Content-Type": res.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "public, max-age=86400, s-maxage=604800" },
  });
}
