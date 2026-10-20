/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runLocal, type IndexOps } from "@/lib/index-api";

export const dynamic = "force-dynamic";

const OPS = new Set<keyof IndexOps>(["search", "news", "images", "suggest", "home", "live", "stats", "siblings", "submit", "pois", "poisIn"]);

function authorized(req: NextRequest): boolean {
  const expected = process.env.GOOGLANT_INDEX_TOKEN;
  if (!expected) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  let body: { op?: string; args?: unknown[] };
  try {
    body = (await req.json()) as { op?: string; args?: unknown[] };
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const op = body.op as keyof IndexOps;
  if (!OPS.has(op) || !Array.isArray(body.args) || body.args.length > 4) return NextResponse.json({ error: "Opération inconnue" }, { status: 400 });
  if (typeof body.args[0] === "string" && body.args[0].length > 300) return NextResponse.json({ error: "Requête trop longue" }, { status: 400 });

  const out = await runLocal(op, body.args as never);
  if (out === null) return NextResponse.json({ error: "Index indisponible" }, { status: 503 });
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
