/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface Business {
  id: string;
  name: string;
  category: string;
  city?: string;
  lat: number;
  lon: number;
  address?: string;
  phone?: string;
  website?: string;
  hours?: string;
  weekdayText?: string[];
  openNow?: boolean;
  rating?: number;
  ratings?: number;
  photo?: string;
  photos?: string[];
  wikidata?: string;
  brand?: string;
  reviews?: { author: string; rating: number; text: string; when: string }[];
  url: string;
  editUrl?: string;
  source: "osm" | "google";
}
