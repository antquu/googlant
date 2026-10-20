/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "à l'instant";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), "month");
  return rtf.format(Math.round(diff / (86400 * 365)), "year");
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function breadcrumb(url: string): string {
  try {
    const u = new URL(url);
    const parts = decodeURIComponent(u.pathname)
      .split("/")
      .filter(Boolean)
      .slice(0, 3)
      .map((p) => (p.length > 28 ? p.slice(0, 26) + "…" : p));
    return [u.hostname.replace(/^www\./, ""), ...parts].join(" › ");
  } catch {
    return url;
  }
}

export function plural(n: number, one: string, many = one + "s"): string {
  return `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;
}

export const LANGS: Record<string, string> = {
  fr: "Français",
  en: "Anglais",
  "en-us": "Anglais",
  "en-gb": "Anglais",
  "fr-fr": "Français",
  de: "Allemand",
  es: "Espagnol",
  it: "Italien",
};
