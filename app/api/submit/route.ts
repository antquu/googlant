/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NextResponse, type NextRequest } from "next/server";
import { index } from "@/lib/index-api";

export async function POST(req: NextRequest) {
  let url = "";
  try {
    url = String(((await req.json()) as { url?: unknown }).url ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 });
  }
  const client = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "local").split(",")[0].trim();
  const res = await index("submit", url, client);
  if (!res) return NextResponse.json({ ok: false, error: "Le crawler est injoignable pour le moment." }, { status: 503 });
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
