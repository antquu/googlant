/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NextResponse, type NextRequest } from "next/server";
import { findBusiness } from "@/lib/places/lookup";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const q = (p.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 3) return NextResponse.json({ business: null }, { status: 400 });
  const lat = Number(p.get("lat"));
  const lon = Number(p.get("lon"));
  const near = p.has("lat") && Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  const business = await findBusiness(q, near);
  return NextResponse.json({ business }, { headers: { "Cache-Control": "public, max-age=900, s-maxage=3600" } });
}
