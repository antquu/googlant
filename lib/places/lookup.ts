/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "server-only";
import { distanceKm } from "../geo/cities";
import { fold } from "../search/tokenizer";
import type { Business } from "./business";
import { detectLocal } from "./intent";
import { categoryOf } from "./labels";

const UA = "GooglantBot/1.0 (moteur de recherche open source)";
const POI = new Set(["amenity", "shop", "tourism", "leisure", "healthcare", "craft", "office", "club"]);

const cache = globalThis as unknown as { __business?: Map<string, { at: number; value: Business | null }> };
const store = (cache.__business ??= new Map());

interface NominatimResult {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  name?: string;
  category: string;
  type: string;
  address?: Record<string, string>;
  extratags?: Record<string, string> | null;
  display_name?: string;
}

function nameMatches(query: string, name: string, city: string): boolean {
  const words = fold(query).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !["les", "des", "pour", "rue"].includes(w));
  const hay = fold(`${name} ${city}`);
  const hits = words.filter((w) => hay.includes(w)).length;
  return words.length > 0 && hits / words.length >= 0.6;
}

function commonsUrl(tag: string | undefined): string | undefined {
  if (!tag) return;
  const file = tag.replace(/^File:/i, "");
  return /^https?:/.test(tag) ? tag : `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=640`;
}

async function nominatimPlaces(name: string, near: { lat: number; lon: number } | null): Promise<number[][]> {
  const params = new URLSearchParams({ q: name, format: "jsonv2", countrycodes: "fr", limit: "5", featureType: "settlement", "accept-language": "fr" });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return [];
  const places = (await res.json()) as { lat: string; lon: string; boundingbox: string[] }[];
  const sorted = near ? [...places].sort((a, b) => distanceKm(near, { lat: +a.lat, lon: +a.lon }) - distanceKm(near, { lat: +b.lat, lon: +b.lon })) : places;
  return sorted.slice(0, 3).map((p) => p.boundingbox.map(Number));
}

async function nominatimLookup(query: string, near: { lat: number; lon: number } | null): Promise<Business | null> {
  const attempt = async (bounded: boolean) => {
    const params = new URLSearchParams({ q: query, format: "jsonv2", countrycodes: "fr", limit: "8", addressdetails: "1", extratags: "1", "accept-language": "fr" });
    if (near && bounded) {
      const d = 0.6;
      params.set("viewbox", `${near.lon - d},${near.lat + d},${near.lon + d},${near.lat - d}`);
      params.set("bounded", "1");
    }
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error("[googlant] Nominatim", res.status);
      return [];
    }
    return (await res.json()) as NominatimResult[];
  };

  let results = near ? await attempt(true) : [];
  if (!results.some((r) => POI.has(r.category))) results = await attempt(false);

  const intent = detectLocal(query);
  if (intent.category && intent.rest) {
    for (const bbox of await nominatimPlaces(intent.rest, near)) {
      if (results.some((r) => POI.has(r.category) && r.name && nameMatches(query, r.name, r.display_name ?? ""))) break;
      const params = new URLSearchParams({
        q: intent.category.words[0], format: "jsonv2", limit: "8", addressdetails: "1", extratags: "1", "accept-language": "fr",
        viewbox: `${bbox[2]},${bbox[1]},${bbox[3]},${bbox[0]}`, bounded: "1",
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8_000) });
      if (res.ok) results = [...results, ...((await res.json()) as NominatimResult[])];
    }
  }

  for (const r of results) {
    if (!POI.has(r.category) || !r.name) continue;
    if (nameMatches(query, r.name, r.display_name ?? "")) return toBusiness(r);
  }
  return null;
}

function toBusiness(r: NominatimResult): Business {
  const a = r.address ?? {};
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? "";
  const t = { ...(r.extratags ?? {}), [r.category]: r.type };
  const type = { N: "node", W: "way", R: "relation" }[r.osm_type.charAt(0).toUpperCase()] ?? r.osm_type.toLowerCase();
  const street = [a.house_number, a.road ?? a.pedestrian].filter(Boolean).join(" ");
  return {
    id: `${type}/${r.osm_id}`,
    name: r.name ?? "",
    category: categoryOf(t),
    city: city || undefined,
    lat: Number(r.lat),
    lon: Number(r.lon),
    address: [street, [a.postcode, city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || undefined,
    phone: t.phone ?? t["contact:phone"],
    website: t.website ?? t["contact:website"],
    hours: t.opening_hours,
    photo: commonsUrl(t.image ?? t.wikimedia_commons),
    wikidata: t.wikidata,
    brand: t["brand:wikidata"],
    url: `https://www.openstreetmap.org/${type}/${r.osm_id}`,
    editUrl: `https://www.openstreetmap.org/edit?${type}=${r.osm_id}`,
    source: "osm",
  };
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { osm_type: string; osm_id: number; osm_key: string; osm_value: string; name?: string; street?: string; housenumber?: string; city?: string; district?: string; postcode?: string; county?: string };
}

async function photonLookup(query: string, near: { lat: number; lon: number } | null): Promise<Business | null> {
  const intent = detectLocal(query);
  const params = new URLSearchParams({ q: query, limit: "15", lang: "fr" });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lon));
  }
  for (const f of intent.category?.osm ?? []) {
    const m = f.match(/^\["([^"]+)"="([^"]+)"\]$/);
    if (m) params.append("osm_tag", `${m[1]}:${m[2]}`);
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6_000) });
  if (!res.ok) return null;
  const { features } = (await res.json()) as { features: PhotonFeature[] };

  const words = fold(query).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const candidates = features
    .filter((f) => POI.has(f.properties.osm_key) && f.properties.name)
    .map((f) => {
      const p = f.properties;
      const place = `${p.city ?? ""} ${p.district ?? ""} ${p.street ?? ""}`;
      const [lon, lat] = f.geometry.coordinates;
      const nameHits = words.filter((w) => fold(p.name!).includes(w)).length;
      const placeHits = words.filter((w) => fold(place).includes(w)).length;
      const km = near ? distanceKm(near, { lat, lon }) : 0;
      return { f, ok: nameMatches(query, p.name!, place), score: nameHits * 2 + placeHits - (near ? Math.min(km, 300) / 60 : 0) };
    })
    .filter((c) => c.ok)
    .sort((a, b) => b.score - a.score);
  const best = candidates[0]?.f;
  if (!best) return null;

  const id = `${best.properties.osm_type.charAt(0).toUpperCase()}${best.properties.osm_id}`;
  const look = await fetch(`https://nominatim.openstreetmap.org/lookup?osm_ids=${id}&format=jsonv2&extratags=1&addressdetails=1&accept-language=fr`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(6_000),
  }).catch(() => null);
  const [detail] = look?.ok ? ((await look.json()) as NominatimResult[]) : [];
  if (detail) return toBusiness(detail);

  const p = best.properties;
  const [lon, lat] = best.geometry.coordinates;
  return toBusiness({
    osm_type: p.osm_type, osm_id: p.osm_id, lat: String(lat), lon: String(lon), name: p.name, category: p.osm_key, type: p.osm_value,
    address: { house_number: p.housenumber ?? "", road: p.street ?? "", postcode: p.postcode ?? "", city: p.city ?? "" },
  });
}

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  primaryTypeDisplayName?: { text: string };
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  photos?: { name: string }[];
  addressComponents?: { longText: string; types: string[] }[];
  reviews?: { rating: number; text?: { text: string }; authorAttribution?: { displayName: string }; relativePublishTimeDescription?: string }[];
}

async function googleLookup(key: string, query: string, near: { lat: number; lon: number } | null): Promise<Business | null> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.primaryTypeDisplayName,places.currentOpeningHours,places.regularOpeningHours,places.photos,places.addressComponents,places.reviews",
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "fr",
      regionCode: "FR",
      maxResultCount: 1,
      ...(near ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lon }, radius: 50_000 } } } : {}),
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;
  const p = ((await res.json()) as { places?: GooglePlace[] }).places?.[0];
  if (!p?.location || !p.displayName) return null;
  const city = p.addressComponents?.find((c) => c.types.includes("locality"))?.longText;
  if (!nameMatches(query, p.displayName.text, city ?? "")) return null;
  return {
    id: p.id,
    name: p.displayName.text,
    category: p.primaryTypeDisplayName?.text ?? "Établissement",
    city,
    lat: p.location.latitude,
    lon: p.location.longitude,
    address: p.formattedAddress?.replace(/, France$/, ""),
    phone: p.nationalPhoneNumber,
    website: p.websiteUri,
    openNow: p.currentOpeningHours?.openNow,
    weekdayText: p.regularOpeningHours?.weekdayDescriptions ?? p.currentOpeningHours?.weekdayDescriptions,
    rating: p.rating,
    ratings: p.userRatingCount,
    photo: p.photos?.[0] ? `/api/places/photo?ref=${encodeURIComponent(p.photos[0].name)}` : undefined,
    reviews: (p.reviews ?? []).slice(0, 3).map((r) => ({
      author: r.authorAttribution?.displayName ?? "Anonyme",
      rating: r.rating,
      text: r.text?.text ?? "",
      when: r.relativePublishTimeDescription ?? "",
    })),
    url: p.googleMapsUri ?? `https://www.google.com/maps/search/?api=1&query=${p.location.latitude},${p.location.longitude}`,
    editUrl: p.googleMapsUri,
    source: "google",
  };
}

export async function findBusiness(query: string, near: { lat: number; lon: number } | null): Promise<Business | null> {
  const key = `${fold(query)}|${near ? `${near.lat.toFixed(1)},${near.lon.toFixed(1)}` : "-"}`;
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < (hit.value ? 30 : 5) * 60 * 1000) return hit.value;
  let value: Business | null = null;
  try {
    const gkey = process.env.GOOGLE_PLACES_API_KEY;
    value = gkey ? await googleLookup(gkey, query, near) : ((await photonLookup(query, near).catch(() => null)) ?? (await nominatimLookup(query, near)));
  } catch (err) {
    console.error("[googlant] fiche établissement :", err);
    return null;
  }
  store.set(key, { at: Date.now(), value });
  return value;
}
