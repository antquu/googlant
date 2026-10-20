/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NextResponse, type NextRequest } from "next/server";
import { index } from "@/lib/index-api";

// commerces et lieux visibles sur la carte quand on zoome (index OpenStreetMap local)
export async function GET(req: NextRequest) {
  const b = (req.nextUrl.searchParams.get("bbox") ?? "").split(",").map(Number);
  if (b.length !== 4 || b.some((x) => !Number.isFinite(x))) return NextResponse.json({ pois: [] }, { status: 400 });
  // arrondi : mêmes rectangles pour des cartes voisines, donc servis par le cache
  const r = (x: number) => Math.round(x * 500) / 500;
  const pois = (await index("poisIn", [r(b[0]), r(b[1]), r(b[2]), r(b[3])], 120)) ?? [];
  return NextResponse.json({ pois }, { headers: { "Cache-Control": "public, max-age=600, s-maxage=86400" } });
}
