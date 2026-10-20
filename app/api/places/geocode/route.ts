/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NextResponse, type NextRequest } from "next/server";

const UA = "GooglantBot/1.0 (moteur de recherche open source)";
const cache = new Map<string, unknown>();

export interface GeocodeResult {
  name: string;
  label: string;
  type: string;
  lat: number;
  lon: number;
  bbox: [number, number, number, number];
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 160);
  if (q.length < 2) return NextResponse.json({ place: null }, { status: 400 });
  if (cache.has(q.toLowerCase())) return NextResponse.json({ place: cache.get(q.toLowerCase()) });

  try {
    const params = new URLSearchParams({ q, format: "jsonv2", limit: "1", addressdetails: "0", "accept-language": "fr" });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(String(res.status));
    const [r] = (await res.json()) as { name: string; display_name: string; type: string; addresstype?: string; lat: string; lon: string; boundingbox: string[] }[];
    const place: GeocodeResult | null = r
      ? {
          name: r.name || r.display_name.split(",")[0],
          label: r.display_name,
          type: r.addresstype ?? r.type,
          lat: Number(r.lat),
          lon: Number(r.lon),
          bbox: r.boundingbox.map(Number) as GeocodeResult["bbox"],
        }
      : null;
    cache.set(q.toLowerCase(), place);
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    return NextResponse.json({ place }, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
  } catch {
    return NextResponse.json({ place: null, error: "Service de géocodage indisponible." }, { status: 502 });
  }
}
