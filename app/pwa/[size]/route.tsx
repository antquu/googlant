/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { brandIcon } from "@/lib/brand/icon";

// icônes du manifeste : /pwa/192, /pwa/512, /pwa/512-maskable
export const dynamic = "force-static";
export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }, { size: "512-maskable" }];
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const px = size.startsWith("192") ? 192 : 512;
  return brandIcon(px, size.endsWith("maskable"), { "Cache-Control": "public, max-age=604800, immutable" });
}
