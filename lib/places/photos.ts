/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "server-only";
import { fold } from "../search/tokenizer";
import type { Business } from "./business";

// photos gratuites pour les fiches : tags OSM, Wikidata, Wikimedia Commons autour du lieu, image du site web

const UA = "GooglantBot/1.0 (github.com/antquu)";
const MAX = 8;
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|.*\.lan|.*\.home|\d+\.\d+\.\d+\.\d+)$|^\[/i;

const commons = (file: string, width = 800) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/^File:/i, ""))}?width=${width}`;

async function getJson<T>(url: string, ms = 3_000, retry = true): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(ms) });
    const data = res.ok ? ((await res.json()) as T & { error?: { code?: string } }) : null;
    // la recherche géographique de Wikimedia renvoie parfois "too busy" : on réessaie une fois
    if (retry && data?.error?.code?.includes("too-busy")) {
      await new Promise((r) => setTimeout(r, 700));
      return getJson<T>(url, ms, false);
    }
    return data;
  } catch {
    return null;
  }
}

async function wikidata(id: string, props = ["P18", "P8592"]): Promise<string[]> {
  if (!/^Q\d+$/.test(id)) return [];
  type Claims = Record<string, { mainsnak: { datavalue?: { value: unknown } } }[]>;
  const r = await getJson<{ claims?: Claims }>(`https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${id}&format=json`);
  const files = props.flatMap((prop) => r?.claims?.[prop]?.map((c) => c.mainsnak.datavalue?.value) ?? []);
  return files.filter((f): f is string => typeof f === "string").map((f) => commons(f));
}

const GENERIC = new Set(["boulangerie", "patisserie", "pharmacie", "restaurant", "hotel", "cafe", "brasserie", "magasin", "boutique", "france", "place", "avenue", "centre", "grand", "petit", "saint", "sainte", "maison", "garage", "coiffure", "tabac", "presse", "pain"]);

async function nearby(name: string, city: string, lat: number, lon: number): Promise<string[]> {
  // le nom de la ville ne compte pas : "Pharmacie de Monestier" ne doit pas valider une photo de "boîte à livres de Monestier"
  const town = new Set(fold(city).split(/[^a-z0-9]+/));
  const words = fold(name).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !GENERIC.has(w) && !town.has(w));
  if (!words.length) return [];
  const params = new URLSearchParams({
    action: "query", format: "json", generator: "geosearch", ggscoord: `${lat}|${lon}`, ggsradius: "150", ggsnamespace: "6", ggslimit: "30",
    prop: "imageinfo", iiprop: "url|mime", iiurlwidth: "800",
  });
  type Page = { index?: number; title: string; imageinfo?: { thumburl?: string; mime?: string }[] };
  const r = await getJson<{ query?: { pages?: Record<string, Page> } }>(`https://commons.wikimedia.org/w/api.php?${params}`);
  return Object.values(r?.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    // le nom du fichier doit parler du lieu, sinon on récupère n'importe quelle photo du quartier
    .filter((pg) => words.some((w) => fold(pg.title).includes(w)))
    .flatMap((p) => p.imageinfo ?? [])
    .filter((i) => i.thumburl && /jpe?g|png|webp/.test(i.mime ?? ""))
    .map((i) => i.thumburl!);
}

async function wikipedia(name: string, lat: number, lon: number): Promise<string[]> {
  const params = new URLSearchParams({
    action: "query", format: "json", generator: "geosearch", ggscoord: `${lat}|${lon}`, ggsradius: "400", ggslimit: "10",
    prop: "pageimages", piprop: "thumbnail", pithumbsize: "800",
  });
  type Page = { title: string; thumbnail?: { source: string } };
  const r = await getJson<{ query?: { pages?: Record<string, Page> } }>(`https://fr.wikipedia.org/w/api.php?${params}`);
  const want = fold(name);
  // seulement l'article qui parle vraiment de ce lieu
  return Object.values(r?.query?.pages ?? {})
    .filter((pg) => pg.thumbnail && (fold(pg.title).includes(want) || want.includes(fold(pg.title.replace(/ \(.*\)$/, "")))))
    .map((pg) => pg.thumbnail!.source);
}

async function article(name: string, lat: number, lon: number): Promise<string[]> {
  const params = new URLSearchParams({
    action: "query", format: "json", titles: name, redirects: "1", prop: "pageimages|coordinates", piprop: "thumbnail", pithumbsize: "800",
  });
  type Page = { thumbnail?: { source: string }; coordinates?: { lat: number; lon: number }[] };
  const r = await getJson<{ query?: { pages?: Record<string, Page> } }>(`https://fr.wikipedia.org/w/api.php?${params}`);
  return Object.values(r?.query?.pages ?? {})
    .filter((pg) => pg.thumbnail && pg.coordinates?.some((c) => Math.abs(c.lat - lat) + Math.abs(c.lon - lon) < 0.02))
    .map((pg) => pg.thumbnail!.source);
}

async function website(url: string): Promise<string[]> {
  try {
    if (PRIVATE_HOST.test(new URL(url).hostname)) return [];
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(2_500) });
    if (!res.ok || !res.headers.get("content-type")?.includes("html")) return [];
    const html = (await res.text()).slice(0, 300_000);
    const found = [...html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>/gi)]
      .map((m) => m[0].match(/content=["']([^"']+)["']/i)?.[1])
      .filter((u): u is string => !!u)
      .map((u) => new URL(u.replace(/&amp;/g, "&"), res.url).href)
      .filter((u) => u.startsWith("https://") && !/logo|favicon|icon/i.test(u));
    return found.slice(0, 2);
  } catch {
    return [];
  }
}

const cache = globalThis as unknown as { __photos?: Map<string, { at: number; photos: string[] }> };
const store = (cache.__photos ??= new Map());

export async function freePhotos(biz: Pick<Business, "name" | "city" | "lat" | "lon" | "photo" | "website" | "wikidata" | "brand">): Promise<string[]> {
  const key = `${biz.name}|${biz.city ?? ""}|${biz.lat.toFixed(4)},${biz.lon.toFixed(4)}`;
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < (hit.photos.length ? 6 * 3600_000 : 5 * 60_000)) return hit.photos;
  const site = biz.website ? (/^https?:/.test(biz.website) ? biz.website : `https://${biz.website}`) : null;
  const groups = await Promise.all([
    Promise.resolve(biz.photo ? [biz.photo] : []),
    site ? website(site) : Promise.resolve([]),
    biz.wikidata ? wikidata(biz.wikidata) : Promise.resolve([]),
    biz.name.length > 3 ? article(biz.name, biz.lat, biz.lon) : Promise.resolve([]),
    biz.name.length > 3 ? wikipedia(biz.name, biz.lat, biz.lon) : Promise.resolve([]),
    nearby(biz.name, biz.city ?? "", biz.lat, biz.lon),
  ]);
  // même fichier servi par Wikipédia et Commons : on compare sans la query string
  const photos = groups.flat().filter((u, i, all) => all.findIndex((o) => o.split("?")[0] === u.split("?")[0]) === i);
  // logo de l'enseigne seulement si on n'a rien trouvé d'autre
  if (!photos.length && biz.brand) photos.push(...(await wikidata(biz.brand, ["P154"])).slice(0, 1));
  if (store.size > 2000) store.clear();
  store.set(key, { at: Date.now(), photos: photos.slice(0, MAX) });
  return photos.slice(0, MAX);
}
