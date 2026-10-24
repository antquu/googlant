/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Accueil et chiffres du pied de page, gardés par Next.js : identiques pour tout le monde, ils ne demandent
 * l'index qu'une fois par minute. Pendant le recalcul, et si l'index ne répond pas, l'ancienne version reste
 * servie. À part de index-api.ts, que le serveur d'index importe hors de Next.js.
 */

import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { index } from "./index-api";

// une erreur n'est pas mise en cache : on lève plutôt que de garder un "null"
const homeCached = unstable_cache(
  async () => {
    const r = await index("home");
    if (!r) throw new Error("index injoignable");
    return r;
  },
  ["home-v1"],
  { revalidate: 60 },
);

const statsCached = unstable_cache(
  async () => {
    const r = await index("stats");
    if (!r) throw new Error("index injoignable");
    return r;
  },
  ["stats-v1"],
  { revalidate: 30 },
);

export const getHome = cache(() => homeCached().catch(() => null));
export const getStats = cache(() => statsCached().catch(() => null));
