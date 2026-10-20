/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "server-only";
import { distanceKm } from "../geo/cities";
import type { PlaceCategory } from "./intent";
import { categoryOf } from "./labels";
import { renamed } from "./overrides";
import type { Place, PlacesResponse } from "./types";

const UA = "GooglantBot/1.0 (moteur de recherche open source)";
const cache = globalThis as unknown as { __places?: Map<string, { at: number; value: PlacesResponse }> };
const store = (cache.__places ??= new Map());
const TTL = 30 * 60 * 1000;

async function cached(key: string, fn: () => Promise<PlacesResponse>): Promise<PlacesResponse> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = await fn();
  if (!value.error) {
    store.set(key, { at: Date.now(), value });
    if (store.size > 500) store.delete(store.keys().next().value!);
  }
  return value;
}

function addressOf(t: Record<string, string>): string | undefined {
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const city = [t["addr:postcode"], t["addr:city"]].filter(Boolean).join(" ");
  return [street, city].filter(Boolean).join(", ") || undefined;
}

interface OsmElement {
  type: string;
  id: number | string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const TERM: Record<string, string> = {
  boulangerie: "boulangerie", pizzeria: "pizzeria", fastfood: "fast food", sushi: "sushi", restaurant: "restaurant", cafe: "café", bar: "bar",
  supermarche: "supermarché", pharmacie: "pharmacie", medecin: "médecin", dentiste: "dentiste", hopital: "hôpital", coiffeur: "coiffeur",
  banque: "banque", dab: "distributeur de billets", hotel: "hôtel", boucherie: "boucherie", fleuriste: "fleuriste", librairie: "librairie",
  garage: "garage", essence: "station-service", recharge: "borne de recharge", cinema: "cinéma", poste: "bureau de poste", tabac: "tabac",
  opticien: "opticien", vetements: "vêtements", sport: "salle de sport", musee: "musée", bibliotheque: "bibliothèque", laverie: "laverie",
  veterinaire: "vétérinaire", commerces: "magasin",
};

let nominatimQueue: Promise<unknown> = Promise.resolve();
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = nominatimQueue.then(fn, fn);
  nominatimQueue = run.then(
    () => new Promise((r) => setTimeout(r, 1100)),
    () => new Promise((r) => setTimeout(r, 1100)),
  );
  return run;
}

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
}

async function nominatim(term: string, center: { lat: number; lon: number }, radius: number): Promise<OsmElement[]> {
  const dLat = radius / 111_320;
  const dLon = radius / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  const params = new URLSearchParams({
    q: term,
    format: "jsonv2",
    viewbox: `${center.lon - dLon},${center.lat + dLat},${center.lon + dLon},${center.lat - dLat}`,
    bounded: "1",
    limit: "40",
    addressdetails: "1",
    extratags: "1",
    "accept-language": "fr",
  });
  const res = await throttled(() =>
    fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) }),
  );
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = (await res.json()) as NominatimResult[];
  return data.map((r) => {
    const a = r.address ?? {};
    return {
      type: { N: "node", W: "way", R: "relation" }[r.osm_type.charAt(0).toUpperCase()] ?? r.osm_type,
      id: r.osm_id,
      lat: Number(r.lat),
      lon: Number(r.lon),
      tags: {
        ...(r.extratags ?? {}),
        name: r.name ?? "",
        [r.category]: r.type,
        "addr:housenumber": a.house_number ?? "",
        "addr:street": a.road ?? a.pedestrian ?? "",
        "addr:postcode": a.postcode ?? "",
        "addr:city": a.city ?? a.town ?? a.village ?? a.municipality ?? "",
      },
    };
  });
}

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

async function overpass(query: string): Promise<OsmElement[]> {
  let lastError: unknown;
  for (const endpoint of OVERPASS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(7_000),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      return ((await res.json()) as { elements: OsmElement[] }).elements;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function parseFilter(f: string): [string, string, string][] {
  return [...f.matchAll(/\["([^"]+)"(?:(=|~)"([^"]*)")?\]/g)].map((m) => [m[1], m[2] ?? "", m[3] ?? ""]);
}

function matches(tags: Record<string, string>, filters: string[]): boolean {
  return filters.some((f) =>
    parseFilter(f).every(([k, op, v]) => {
      const t = tags[k];
      if (!t) return false;
      if (!op) return true;
      return op === "=" ? t === v : new RegExp(v, "i").test(t);
    }),
  );
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\"]/g, "\\$&");

function toPlaces(elements: OsmElement[], center: { lat: number; lon: number }): Place[] {
  const places = elements
    .map((e): Place | null => {
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      const t = Object.fromEntries(Object.entries(e.tags ?? {}).filter(([, v]) => v)) as Record<string, string>;
      if (lat === undefined || lon === undefined || !t.name) return null;
      return {
        id: `${e.type}/${e.id}`,
        name: renamed({ name: t.name }, `${e.type}/${e.id}`).name,
        category: categoryOf(t),
        lat,
        lon,
        distanceM: Math.round(distanceKm(center, { lat, lon }) * 1000),
        address: addressOf(t),
        phone: t.phone ?? t["contact:phone"],
        website: t.website ?? t["contact:website"],
        hours: t.opening_hours,
        photo: t.image?.startsWith("https://") ? t.image : t.wikimedia_commons?.startsWith("File:") ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(t.wikimedia_commons.slice(5))}?width=800` : undefined,
        wikidata: t.wikidata,
        brand: t["brand:wikidata"],
        url: `https://www.openstreetmap.org/${e.type}/${e.id}`,
      };
    })
    .filter((p): p is Place => p !== null)
    .sort((a, b) => a.distanceM - b.distanceM);
  const seen = new Set<string>();
  return places.filter((p) => {
    const k = `${p.name.toLowerCase()}|${Math.round(p.lat * 2000)}|${Math.round(p.lon * 2000)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function searchOsm(center: { lat: number; lon: number }, category: PlaceCategory | null, name: string, radius: number): Promise<PlacesResponse> {
  const term = category ? TERM[category.id] ?? category.label : name || "magasin";
  const key = `osm|${term}|${center.lat.toFixed(3)}|${center.lon.toFixed(3)}|${radius}`;
  const attribution = "© contributeurs OpenStreetMap";

  return cached(key, async () => {
    try {
      let elements = await nominatim(term, center, radius);
      if (elements.length < 4) elements = elements.concat(await nominatim(term, center, radius * 3));
      if (category) {
        const strict = elements.filter((e) => matches(e.tags ?? {}, category.osm));
        if (strict.length) elements = strict;
      }
      return { places: toPlaces(elements, center).slice(0, 20), center, source: "osm", attribution };
    } catch {
      try {
        const filters = category ? category.osm : [`["name"~"${escapeRegex(name)}",i]`];
        const body = filters.map((f) => `nwr${f}["name"](around:${radius},${center.lat},${center.lon});`).join("");
        const elements = await overpass(`[out:json][timeout:8];(${body});out center tags 80;`);
        return { places: toPlaces(elements, center).slice(0, 20), center, source: "osm", attribution };
      } catch {
        return { places: [], center, source: "osm", attribution, error: "Le service cartographique ne répond pas pour le moment." };
      }
    }
  });
}

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  primaryTypeDisplayName?: { text: string };
  currentOpeningHours?: { openNow?: boolean };
}

export async function searchGoogle(apiKey: string, center: { lat: number; lon: number }, text: string, radius: number): Promise<PlacesResponse> {
  const key = `google|${text}|${center.lat.toFixed(3)}|${center.lon.toFixed(3)}`;
  return cached(key, async () => {
    try {
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.primaryTypeDisplayName,places.currentOpeningHours.openNow",
        },
        body: JSON.stringify({
          textQuery: text,
          languageCode: "fr",
          regionCode: "FR",
          maxResultCount: 20,
          locationBias: { circle: { center: { latitude: center.lat, longitude: center.lon }, radius: Math.min(radius * 2, 50_000) } },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Google Places ${res.status}`);
      const data = (await res.json()) as { places?: GooglePlace[] };
      const places: Place[] = (data.places ?? [])
        .filter((p) => p.location && p.displayName)
        .map((p) => ({
          id: p.id,
          name: p.displayName!.text,
          category: p.primaryTypeDisplayName?.text ?? "Établissement",
          lat: p.location!.latitude,
          lon: p.location!.longitude,
          distanceM: Math.round(distanceKm(center, { lat: p.location!.latitude, lon: p.location!.longitude }) * 1000),
          address: p.formattedAddress,
          phone: p.nationalPhoneNumber,
          website: p.websiteUri,
          openNow: p.currentOpeningHours?.openNow,
          rating: p.rating,
          ratings: p.userRatingCount,
          url: p.googleMapsUri ?? `https://www.google.com/maps/search/?api=1&query=${p.location!.latitude},${p.location!.longitude}`,
        }));
      return { places, center, source: "google", attribution: "Données Google" };
    } catch {
      return { places: [], center, source: "google", attribution: "Données Google", error: "Google Places ne répond pas (clé API invalide ?)." };
    }
  });
}
