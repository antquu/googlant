/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CONSENT_COOKIE, readConsent, type Consent } from "./consent";
import { LOCATION_COOKIE, PREFS_COOKIE, type UserLocation } from "./geo/types";

export interface Prefs {
  perPage: number;
  newTab: boolean;
  suggestions: boolean;
  motion: "full" | "reduced";
}

export const DEFAULT_PREFS: Prefs = { perPage: 10, newTab: false, suggestions: true, motion: "full" };

const YEAR = 60 * 60 * 24 * 365;

function setCookie(name: string, value: string | null) {
  document.cookie =
    value === null
      ? `${name}=; Path=/; Max-Age=0; SameSite=Lax`
      : `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${YEAR}; SameSite=Lax`;
}

export function savePrefs(p: Prefs) {
  setCookie(PREFS_COOKIE, JSON.stringify(p));
}

export function saveLocation(loc: UserLocation | null) {
  // cookies refusés : la position n'est pas gardée d'une visite à l'autre
  if (loc && readConsent(document.cookie) !== "all") return;
  setCookie(LOCATION_COOKIE, loc ? JSON.stringify(loc) : null);
}

export function saveConsent(c: Consent) {
  setCookie(CONSENT_COOKIE, c);
  if (c === "essential") setCookie(LOCATION_COOKIE, null);
}
