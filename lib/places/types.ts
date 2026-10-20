/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface Place {
  id: string;
  name: string;
  category: string;
  lat: number;
  lon: number;
  distanceM: number;
  address?: string;
  phone?: string;
  website?: string;
  photo?: string;
  wikidata?: string;
  brand?: string;
  hours?: string;
  openNow?: boolean;
  rating?: number;
  ratings?: number;
  url: string;
}

export interface PlacesResponse {
  places: Place[];
  center: { lat: number; lon: number };
  source: "osm" | "google";
  attribution: string;
  error?: string;
}
