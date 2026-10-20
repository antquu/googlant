/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NextResponse, type NextRequest } from "next/server";
import { index } from "@/lib/index-api";

const EXTRA = ["horaires tram grenoble", "horaires bus lyon", "métro de lyon", "tramway de saint-étienne", "transports clermont-ferrand", "bus nancy", "grelines"];

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  const suggestions = (await index("suggest", q, EXTRA)) ?? [];
  return NextResponse.json({ q, suggestions }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=600, stale-while-revalidate=3600" } });
}
