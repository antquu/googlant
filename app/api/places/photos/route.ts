/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NextResponse, type NextRequest } from "next/server";
import { freePhotos } from "@/lib/places/photos";

const QID = /^Q\d{1,12}$/;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const lat = Number(p.get("lat"));
  const lon = Number(p.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return NextResponse.json({ photos: [] }, { status: 400 });
  const site = p.get("website") ?? "";
  const photos = await freePhotos({
    name: (p.get("name") ?? "").slice(0, 120),
    city: (p.get("city") ?? "").slice(0, 80) || undefined,
    lat,
    lon,
    photo: p.get("photo")?.startsWith("https://") ? p.get("photo")! : undefined,
    website: /^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(site) ? site : undefined,
    wikidata: QID.test(p.get("wikidata") ?? "") ? p.get("wikidata")! : undefined,
    brand: QID.test(p.get("brand") ?? "") ? p.get("brand")! : undefined,
  });
  return NextResponse.json({ photos }, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
}
