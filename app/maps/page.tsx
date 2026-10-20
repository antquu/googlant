/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Metadata } from "next";
import { getUserLocation } from "@/lib/context";
import { cityBySlug } from "@/lib/geo/cities";
import { detectLocal } from "@/lib/places/intent";
import { businessById } from "@/lib/places/lookup";
import { MapsApp } from "@/components/maps/MapsApp";

export const metadata: Metadata = {
  title: "Googlant Maps",
  description: "Cartes, commerces et itinéraires en transports en commun, sans compte et sans pistage.",
  alternates: { canonical: "/maps" },
};

type SP = Promise<{ q?: string; dir?: string; dname?: string; place?: string }>;

export default async function MapsPage({ searchParams }: { searchParams: SP }) {
  const { q = "", dir, dname, place: placeId } = await searchParams;
  const place = placeId ? await businessById(placeId) : null;
  const m = dir?.match(/^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/);
  const initialDir = m ? { lat: Number(m[1]), lon: Number(m[2]), label: (dname ?? "Destination").slice(0, 120) } : null;
  const query = q.trim().slice(0, 160);
  const loc = await getUserLocation();
  const intent = detectLocal(query);

  const fallback = cityBySlug("grenoble")!;
  const start = place
    ? { lat: place.lat, lon: place.lon, label: place.city ?? place.name, zoom: 17 }
    : initialDir
    ? { lat: initialDir.lat, lon: initialDir.lon, label: initialDir.label, zoom: 14 }
    : intent.city
    ? { lat: intent.city.lat, lon: intent.city.lon, label: intent.city.name, zoom: 14 }
    : loc
      ? { lat: loc.lat, lon: loc.lon, label: loc.city, zoom: loc.source === "gps" ? 15 : 13 }
      : { lat: fallback.lat, lon: fallback.lon, label: fallback.name, zoom: 13 };

  return <MapsApp initialQuery={query} initialDir={initialDir} initialPlace={place} start={start} user={loc?.source === "gps" ? { lat: loc.lat, lon: loc.lon } : null} approx={loc ? { lat: loc.lat, lon: loc.lon } : null} />;
}
