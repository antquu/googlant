/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "server-only";
import { cookies, headers } from "next/headers";
import { nearestCity } from "./geo/cities";
import { locateIp } from "./geo/ip";
import { LOCATION_COOKIE, PREFS_COOKIE, type UserLocation } from "./geo/types";
import { DEFAULT_PREFS, type Prefs } from "./prefs";

export async function getUserLocation(): Promise<UserLocation | null> {
  const jar = await cookies();
  const raw = jar.get(LOCATION_COOKIE)?.value;
  if (raw) {
    try {
      const loc = JSON.parse(decodeURIComponent(raw)) as UserLocation;
      if (Number.isFinite(loc.lat) && Number.isFinite(loc.lon) && typeof loc.city === "string") {
        return { city: loc.city.slice(0, 60), region: loc.region?.slice(0, 60), lat: loc.lat, lon: loc.lon, source: loc.source === "gps" ? "gps" : "manual" };
      }
    } catch {
    }
  }

  const h = await headers();
  const lat = Number(h.get("x-vercel-ip-latitude") ?? h.get("cf-iplatitude"));
  const lon = Number(h.get("x-vercel-ip-longitude") ?? h.get("cf-iplongitude"));
  if (lat && lon && Number.isFinite(lat) && Number.isFinite(lon)) {
    const headerCity = h.get("x-vercel-ip-city") ?? h.get("cf-ipcity");
    const { city, km } = nearestCity({ lat, lon });
    return {
      city: headerCity ? safeDecode(headerCity) : km < 40 ? city.name : "votre région",
      region: km < 80 ? city.region : undefined,
      lat,
      lon,
      source: "ip",
    };
  }

  const clientIp = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim();
  const geo = await locateIp(clientIp);
  if (geo) return { city: geo.city, region: geo.region, lat: geo.lat, lon: geo.lon, source: "ip" };
  return null;
}

export async function getPrefs(): Promise<Prefs> {
  const jar = await cookies();
  const raw = jar.get(PREFS_COOKIE)?.value;
  if (!raw) return DEFAULT_PREFS;
  try {
    const p = JSON.parse(decodeURIComponent(raw)) as Partial<Prefs>;
    return {
      perPage: [10, 20, 30].includes(Number(p.perPage)) ? Number(p.perPage) : DEFAULT_PREFS.perPage,
      newTab: typeof p.newTab === "boolean" ? p.newTab : DEFAULT_PREFS.newTab,
      suggestions: typeof p.suggestions === "boolean" ? p.suggestions : DEFAULT_PREFS.suggestions,
      motion: p.motion === "reduced" ? "reduced" : "full",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
