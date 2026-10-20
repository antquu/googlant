/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type LocationSource = "gps" | "manual" | "ip";

export interface UserLocation {
  city: string;
  region?: string;
  lat: number;
  lon: number;
  source: LocationSource;
}

export const LOCATION_COOKIE = "googlant_loc";
export const PREFS_COOKIE = "googlant_prefs";
