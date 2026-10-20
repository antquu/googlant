/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NextResponse } from "next/server";
import { index } from "@/lib/index-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const live = await index("live");
  if (!live) return NextResponse.json({ stats: null, items: [] }, { status: 503, headers: { "Access-Control-Allow-Origin": "*" } });
  // accessible depuis le site Vercel (autre origine) ; cache CDN court pour limiter les appels
  return NextResponse.json(live, { headers: { "Cache-Control": "public, max-age=5, s-maxage=10, stale-while-revalidate=30", "Access-Control-Allow-Origin": "*" } });
}
