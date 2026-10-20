/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NextResponse, type NextRequest } from "next/server";
import { distanceKm, nearestCity } from "@/lib/geo/cities";
import { index } from "@/lib/index-api";

export interface Suggestion {
  label: string;
  detail: string;
  kind: string;
  lat: number;
  lon: number;
  poi?: { osm: string; street?: string; city?: string; phone?: string; website?: string; hours?: string; wikidata?: string; brand?: string; image?: string };
}

interface GeopfResult {
  x: number;
  y: number;
  country: "StreetAddress" | "PositionOfInterest";
  city?: string;
  zipcode?: string;
  street?: string;
  names?: string[];
  kind?: string;
  fulltext: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; street?: string; housenumber?: string; postcode?: string; city?: string; country?: string; type?: string; osm_key?: string; osm_value?: string };
}

const UA = "Googlant/1.0 (github.com/antquu)";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

async function geoplateforme(q: string, lat: number | null, lon: number | null): Promise<Suggestion[]> {
  const params = new URLSearchParams({ text: q, maximumResponses: "7", type: "PositionOfInterest,StreetAddress" });
  if (lat !== null && lon !== null) params.set("lonlat", `${lon},${lat}`);
  const res = await fetch(`https://data.geopf.fr/geocodage/completion?${params}`, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(3_000) });
  if (!res.ok) return [];
  const { results = [] } = (await res.json()) as { results?: GeopfResult[] };
  return results.map((r) => {
    const poi = r.country === "PositionOfInterest";
    const label = poi ? r.names?.[0] ?? r.fulltext.split(",")[0] : r.fulltext.split(",")[0];
    const where = [r.zipcode, r.city].filter(Boolean).join(" ");
    return { label, detail: where, kind: poi ? cap(r.kind ?? "lieu") : r.kind === "municipality" ? "Ville" : "Adresse", lat: r.y, lon: r.x };
  });
}

const POI_KIND: Record<string, string> = { bakery: "Boulangerie", supermarket: "Supermarché", convenience: "Épicerie", restaurant: "Restaurant", fast_food: "Restauration rapide", cafe: "Café", bar: "Bar", pharmacy: "Pharmacie", clothes: "Vêtements", hairdresser: "Coiffeur", bank: "Banque", butcher: "Boucherie", books: "Librairie", florist: "Fleuriste", hotel: "Hôtel", cinema: "Cinéma", doctors: "Médecin", dentist: "Dentiste", optician: "Opticien", mall: "Centre commercial", department_store: "Grand magasin", hardware: "Bricolage", doityourself: "Bricolage", sports: "Sport", electronics: "Électronique" };

async function photon(q: string, lat: number | null, lon: number | null, poiOnly = false): Promise<Suggestion[]> {
  const params = new URLSearchParams({ q, limit: "6", lang: "fr" });
  if (poiOnly) {
    params.append("osm_tag", "shop");
    params.append("osm_tag", "amenity");
    params.append("osm_tag", "tourism");
    params.append("osm_tag", "leisure");
  }
  if (lat !== null && lon !== null) {
    params.set("lat", String(lat));
    params.set("lon", String(lon));
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(9_000) });
  const { features = [] } = (await res.json()) as { features?: PhotonFeature[] };
  return features.flatMap((f) => {
    const p = f.properties;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const label = p.name ?? (street || p.city);
    if (!label) return [];
    const [lo, la] = f.geometry.coordinates;
    const kind = POI_KIND[p.osm_value ?? ""] ?? (p.osm_key === "shop" ? "Commerce" : "Lieu");
    return [{ label, detail: [street, p.city].filter(Boolean).join(", "), kind, lat: la, lon: lo }];
  });
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const q = (p.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 2) return NextResponse.json({ suggestions: [] });
  const lat = p.has("lat") && Number.isFinite(Number(p.get("lat"))) ? Number(p.get("lat")) : null;
  const lon = p.has("lon") && Number.isFinite(Number(p.get("lon"))) ? Number(p.get("lon")) : null;

  // commerces et lieux OpenStreetMap (complète les adresses IGN, qui ne connaissent pas les boutiques) :
  // notre index local d'abord, Photon seulement s'il n'existe pas
  if (p.get("kind") === "poi") {
    const local = await index("pois", q, lat, lon, 6);
    if (local) {
      const suggestions = local.map((h) => {
        const near = h.city ? null : nearestCity(h);
        const city = h.city ?? (near && near.km < 12 ? near.city.name : null);
        const poi = { osm: h.osm, street: h.street ?? undefined, city: city ?? undefined, phone: h.phone ?? undefined, website: h.website ?? undefined, hours: h.hours ?? undefined, wikidata: h.wikidata ?? undefined, brand: h.brand ?? undefined, image: h.image ?? undefined };
        return { label: h.name, detail: [h.street, city].filter(Boolean).join(", "), kind: h.kind, lat: h.lat, lon: h.lon, poi };
      });
      return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" } });
    }
    const pois = (await photon(q, lat, lon, true).catch(() => [])).filter(
      (s, i, all) => all.findIndex((o) => o.label === s.label && Math.abs(o.lat - s.lat) + Math.abs(o.lon - s.lon) < 0.0008) === i,
    );
    return NextResponse.json({ suggestions: pois.slice(0, 5) }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" } });
  }

  let suggestions: Suggestion[] = [];
  try {
    suggestions = await geoplateforme(q, lat, lon);
  } catch {
    suggestions = [];
  }
  if (!suggestions.length) suggestions = await photon(q, lat, lon).catch(() => []);

  const seen = new Set<string>();
  suggestions = suggestions.filter((s) => {
    const k = `${s.label}|${s.detail}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // homonymes (rue « Carrefour » dans 30 villages) : les plus proches d'abord, et pas ceux à l'autre bout de la France
  if (lat !== null && lon !== null) {
    const here = { lat, lon };
    const ranked = suggestions.map((s, i) => ({ s, i, km: distanceKm(here, s) }));
    const close = ranked.filter((x) => x.km < 150);
    suggestions = (close.length ? close : ranked).sort((a, b) => (a.s.kind === "Ville" ? -1 : 0) - (b.s.kind === "Ville" ? -1 : 0) || a.km - b.km || a.i - b.i).map((x) => x.s);
  }
  return NextResponse.json({ suggestions: suggestions.slice(0, 7) }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" } });
}
