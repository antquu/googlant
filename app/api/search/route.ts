/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NextResponse, type NextRequest } from "next/server";
import { selectAds } from "@/lib/ads/select";
import { getUserLocation } from "@/lib/context";
import { index } from "@/lib/index-api";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ error: "Paramètre q manquant" }, { status: 400 });

  const loc = await getUserLocation();
  const res = await index("search", q, {
    page: Number(params.get("page")) || 1,
    perPage: Number(params.get("per")) || 10,
    city: loc?.city,
  });
  if (!res) return NextResponse.json({ error: "Index injoignable" }, { status: 503 });

  // "Charger plus" sur la page de résultats : les résultats tels quels, pour les ajouter à la suite
  if (params.get("raw") === "1") return NextResponse.json({ hits: res.hits, total: res.total, page: res.page, perPage: res.perPage });

  return NextResponse.json({
    query: res.query,
    correctedQuery: res.correctedQuery,
    autoCorrected: res.autoCorrected,
    total: res.total,
    page: res.page,
    perPage: res.perPage,
    tookMs: res.tookMs,
    sponsored: selectAds(q, loc).map((a) => ({
      advertiser: a.campaign.advertiser,
      title: a.campaign.headline,
      url: a.campaign.url,
      description: a.campaign.description,
      distanceKm: a.distanceKm,
      reason: a.reason,
    })),
    results: res.hits.map((h) => ({
      title: h.doc.title,
      url: h.doc.url,
      site: h.doc.siteName,
      snippet: h.snippet.map((p) => p.text).join(""),
      score: h.score,
      pagerank: h.doc.rank,
      crawledAt: h.doc.crawledAt,
    })),
    related: res.related,
  });
}
