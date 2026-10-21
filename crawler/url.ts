/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const TRACKING = /^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref_src|_ga|yclid)$/i;

const BINARY = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|zip|gz|tgz|rar|7z|tar|exe|msi|dmg|apk|iso|mp3|mp4|m4a|wav|ogg|webm|mov|avi|mkv|woff2?|ttf|otf|eot|css|js|mjs|json|xml|rss|atom|csv|xlsx?|docx?|pptx?)$/i;

// machines locales (localhost, box, réseau de la maison, Tailscale) : jamais crawlées ni indexées
const LOCAL_NAME = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.lan|.*\.home|.*\.ts\.net)$/i;
const PRIVATE_IP = /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

export function isPrivateHost(host: string): boolean {
  if (host.startsWith("[")) return true; // IPv6 : le crawler n'utilise que l'IPv4
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return PRIVATE_IP.test(host);
  return LOCAL_NAME.test(host) || !host.includes(".");
}

export function normalizeUrl(input: string, base?: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim(), base);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (BINARY.test(u.pathname)) return null;
  if (isPrivateHost(u.hostname)) return null;

  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/\.$/, "");
  if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) u.port = "";

  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k));
  params.sort(([a], [b]) => a.localeCompare(b));
  u.search = params.length ? "?" + new URLSearchParams(params).toString() : "";

  u.pathname = u.pathname.replace(/\/{2,}/g, "/").replace(/\/index\.(html?|php)$/i, "/");
  return u.toString();
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function siteOf(url: string): string {
  const host = hostOf(url);
  const parts = host.split(".");
  const twoLevel = /^(co|com|org|gouv|ac|net)\.[a-z]{2}$/.test(parts.slice(-2).join("."));
  return parts.slice(twoLevel ? -3 : -2).join(".");
}
