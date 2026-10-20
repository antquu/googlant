/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NextResponse, type NextRequest } from "next/server";
import { detectLocal } from "@/lib/places/intent";
import { searchGoogle, searchOsm } from "@/lib/places/providers";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const q = (p.get("q") ?? "").slice(0, 120);
  const lat = Number(p.get("lat"));
  const lon = Number(p.get("lon"));
  const radius = Math.min(Math.max(Number(p.get("r")) || 1500, 300), 10_000);
  if (!q || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "Paramètres q, lat et lon requis." }, { status: 400 });
  }

  const center = { lat, lon };
  const intent = detectLocal(q);
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const res = key ? await searchGoogle(key, center, q, radius) : await searchOsm(center, intent.category, intent.category ? "" : intent.rest, radius);

  return NextResponse.json(res, { headers: { "Cache-Control": res.error ? "no-store" : "public, max-age=900, s-maxage=3600" } });
}
