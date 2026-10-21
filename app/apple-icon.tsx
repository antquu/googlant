/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { brandIcon } from "@/lib/brand/icon";

// icône de l'écran d'accueil sur iPhone ("Sur l'écran d'accueil")
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return brandIcon(180);
}
