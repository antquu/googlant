/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NextResponse, type NextRequest } from "next/server";
import { planTrip } from "@/lib/route/plan";

const coord = (v: string | null) => {
  const m = v?.match(/^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/);
  return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
};

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const from = coord(p.get("from"));
  const to = coord(p.get("to"));
  if (!from || !to) return NextResponse.json({ error: "Paramètres from et to requis (lat,lon)." }, { status: 400 });
  const when = p.get("time") ? new Date(p.get("time")!) : new Date();
  try {
    const res = await planTrip(
      { ...from, name: (p.get("fromName") ?? "Départ").slice(0, 120) },
      { ...to, name: (p.get("toName") ?? "Arrivée").slice(0, 120) },
      {
        when: Number.isNaN(when.getTime()) ? new Date() : when,
        arriveBy: p.get("arriveBy") === "1",
        modes: (p.get("modes") ?? "").split(",").filter((m) => ["TRAM", "SUBWAY", "BUS", "RAIL"].includes(m)),
        wheelchair: p.get("wheelchair") === "1",
        lessWalk: p.get("lessWalk") === "1",
      },
    );
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Le calcul d'itinéraire est indisponible pour le moment.", itineraries: [] }, { status: 502 });
  }
}
