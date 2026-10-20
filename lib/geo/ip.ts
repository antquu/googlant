/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "server-only";

export interface IpLocation {
  city: string;
  region?: string;
  lat: number;
  lon: number;
}

const cache = globalThis as unknown as { __ipgeo?: Map<string, { at: number; value: IpLocation | null }> };
const store = (cache.__ipgeo ??= new Map());

const isPrivate = (ip: string) => !ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80|::ffff:127\.)/i.test(ip);

export async function locateIp(clientIp: string): Promise<IpLocation | null> {
  if (process.env.GEOIP_LOOKUP === "0") return null;
  const local = isPrivate(clientIp);
  if (!local && process.env.GEOIP_LOOKUP !== "1") return null;

  const key = local ? "self" : clientIp;
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return hit.value;

  const target = local ? "" : encodeURIComponent(clientIp);
  let value: IpLocation | null = null;
  try {
    const res = await fetch(`https://ipwho.is/${target}?fields=success,city,region,latitude,longitude&lang=fr`, { signal: AbortSignal.timeout(2500) });
    const d = (await res.json()) as { success: boolean; city: string; region: string; latitude: number; longitude: number };
    if (d.success && Number.isFinite(d.latitude)) value = { city: d.city, region: d.region, lat: d.latitude, lon: d.longitude };
  } catch {
    try {
      const res = await fetch(`http://ip-api.com/json/${target}?fields=status,city,regionName,lat,lon&lang=fr`, { signal: AbortSignal.timeout(2500) });
      const d = (await res.json()) as { status: string; city: string; regionName: string; lat: number; lon: number };
      if (d.status === "success") value = { city: d.city, region: d.regionName, lat: d.lat, lon: d.lon };
    } catch {
    }
  }
  store.set(key, { at: Date.now(), value });
  return value;
}
