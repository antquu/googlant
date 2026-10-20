/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fold } from "../search/tokenizer";
import { CITIES, distanceKm } from "../geo/cities";
import type { UserLocation } from "../geo/types";
import { CAMPAIGNS, NATIONAL, type Campaign } from "./campaigns";

export interface AdSlot {
  campaign: Campaign;
  distanceKm: number | null;
  reason: string;
}

export function selectAds(query: string, loc: UserLocation | null, max = 3): AdSlot[] {
  const q = ` ${fold(query).replace(/[^a-z0-9' -]+/g, " ").replace(/\s+/g, " ")} `;
  const words = new Set(q.trim().split(" "));

  const mentionedCity = CITIES.find((c) => c.aliases?.some((a) => q.includes(` ${a} `)));

  const scored = CAMPAIGNS.map((campaign) => {
    let score = 0;
    const reasons: string[] = [];
    const city = CITIES.find((c) => c.slug === campaign.citySlug);

    if (city?.aliases?.some((a) => q.includes(` ${a} `))) {
      score += 12;
      reasons.push(`votre recherche mentionne ${campaign.cityName}`);
    }
    const kw = campaign.keywords.filter((k) => (k.includes(" ") ? q.includes(` ${k} `) : words.has(k)));
    if (kw.length) {
      score += 3 + kw.length * 1.5;
      reasons.push("votre recherche concerne les transports");
    }
    if (words.has("grelines")) score += campaign === NATIONAL ? 9 : 7;

    const km = loc ? distanceKm(loc, campaign) : null;
    if (km !== null) {
      if (km < 35) score += 6;
      else if (km < 90) score += 3;
      else if (km < 220) score += 1;
      if (km < 90) reasons.push(`vous êtes à ${Math.max(1, Math.round(km))} km de ${campaign.cityName}`);
    }
    if (mentionedCity && mentionedCity.slug !== campaign.citySlug) score -= 6;

    return { campaign, score, km, reasons, intent: kw.length > 0 || !!mentionedCity || words.has("grelines") };
  }).sort((a, b) => b.score - a.score || (a.km ?? 1e9) - (b.km ?? 1e9));

  const hasIntent = scored.some((s) => s.intent && s.score > 0);
  const limit = hasIntent ? max : 1;
  const chosen = scored.filter((s) => s.score > 0).slice(0, limit);

  if (!chosen.length) {
    const fallback = loc ? scored[0] : scored.find((s) => s.campaign === NATIONAL)!;
    chosen.push({ ...fallback, reasons: [loc ? `annonce la plus proche de ${loc.city}` : "annonce générale"] });
  }

  return chosen.map((s) => ({
    campaign: s.campaign,
    distanceKm: s.km !== null ? Math.round(s.km) : null,
    reason: s.reasons[0] ?? (loc ? `proche de ${loc.city}` : "annonce générale"),
  }));
}

export function campaignsByProximity(loc: UserLocation | null): { campaign: Campaign; km: number | null }[] {
  return CAMPAIGNS.map((campaign) => ({ campaign, km: loc ? Math.round(distanceKm(loc, campaign)) : null })).sort(
    (a, b) => (a.km ?? (a.campaign === NATIONAL ? -1 : 1e9)) - (b.km ?? (b.campaign === NATIONAL ? -1 : 1e9)),
  );
}
