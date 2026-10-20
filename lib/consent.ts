/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// choix de l'utilisateur pour les cookies :
// - « essential » : seulement ce qui est indispensable (préférences choisies, ce choix lui-même)
// - « all » : en plus, on retient la position (ville / GPS) pour les résultats locaux
export const CONSENT_COOKIE = "googlant_consent";
export type Consent = "all" | "essential";

export function readConsent(cookieHeader: string): Consent | null {
  const m = cookieHeader.match(new RegExp(`(?:^|;\s*)${CONSENT_COOKIE}=(all|essential)`));
  return m ? (m[1] as Consent) : null;
}
