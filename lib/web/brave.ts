/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "server-only";
import type { IndexedDoc, SearchHit, SnippetPart } from "../search/types";

const API = "https://api.search.brave.com/res/v1";

export const webEnabled = () => !!process.env.BRAVE_SEARCH_API_KEY;

const cache = globalThis as unknown as { __brave?: Map<string, { at: number; value: unknown }> };
const store = (cache.__brave ??= new Map());

async function call<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return null;
  const qs = new URLSearchParams({ country: "fr", search_lang: "fr", ui_lang: "fr-FR", safesearch: "moderate", ...params });
  const cacheKey = `${path}?${qs}`;
  const hit = store.get(cacheKey);
  if (hit && Date.now() - hit.at < 15 * 60 * 1000) return hit.value as T;
  try {
    const res = await fetch(`${API}${path}?${qs}`, {
      headers: { Accept: "application/json", "X-Subscription-Token": key },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) {
      console.error("[googlant] Brave Search", res.status);
      return null;
    }
    const value = (await res.json()) as T;
    store.set(cacheKey, { at: Date.now(), value });
    if (store.size > 300) store.delete(store.keys().next().value!);
    return value;
  } catch (err) {
    console.error("[googlant] Brave Search", err);
    return null;
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", nbsp: " " };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, (_, e: string) => ENTITIES[e]);

function toSnippet(html: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  for (const chunk of html.split(/(<strong>.*?<\/strong>)/g)) {
    if (!chunk) continue;
    const hit = chunk.startsWith("<strong>");
    parts.push({ text: decode(chunk.replace(/<[^>]+>/g, "")), hit });
  }
  return parts;
}

interface BraveItem {
  title: string;
  url: string;
  description?: string;
  page_age?: string;
  profile?: { name?: string };
  meta_url?: { hostname?: string; favicon?: string };
  thumbnail?: { src?: string };
}

let fakeId = -1;
function toHit(r: BraveItem): SearchHit {
  const host = (r.meta_url?.hostname ?? new URL(r.url).hostname).replace(/^www\./, "");
  const doc: IndexedDoc = {
    id: fakeId--,
    url: r.url,
    host,
    siteName: r.profile?.name ?? host,
    title: decode(r.title.replace(/<[^>]+>/g, "")),
    description: decode((r.description ?? "").replace(/<[^>]+>/g, "")),
    text: "",
    headings: [],
    favicon: r.meta_url?.favicon,
    image: r.thumbnail?.src,
    publishedAt: r.page_age && !Number.isNaN(Date.parse(r.page_age)) ? new Date(r.page_age).toISOString() : undefined,
    crawledAt: new Date().toISOString(),
    rank: 0,
    inlinks: 0,
  };
  return { doc, score: 0, snippet: toSnippet(r.description ?? ""), titleTerms: [] };
}

export async function webSearch(q: string, page: number): Promise<{ hits: SearchHit[]; more: boolean } | null> {
  const data = await call<{ web?: { results: BraveItem[] }; query?: { more_results_available?: boolean } }>("/web/search", {
    q,
    count: "20",
    offset: String(Math.min(page - 1, 9)),
  });
  if (!data) return null;
  return { hits: (data.web?.results ?? []).map(toHit), more: !!data.query?.more_results_available };
}

export async function newsSearch(q: string): Promise<SearchHit[] | null> {
  const data = await call<{ results: BraveItem[] }>("/news/search", { q, count: "20" });
  return data ? data.results.map(toHit) : null;
}

export interface WebImage {
  src: string;
  thumb: string;
  alt: string;
  pageUrl: string;
  pageTitle: string;
  host: string;
  favicon?: string;
}

export async function imageSearch(q: string): Promise<WebImage[] | null> {
  const data = await call<{
    results: { title: string; url: string; thumbnail?: { src?: string }; properties?: { url?: string }; meta_url?: { hostname?: string; favicon?: string } }[];
  }>("/images/search", { q, count: "60" });
  if (!data) return null;
  return data.results
    .filter((r) => r.thumbnail?.src)
    .map((r) => ({
      src: r.properties?.url ?? r.thumbnail!.src!,
      thumb: r.thumbnail!.src!,
      alt: decode(r.title),
      pageUrl: r.url,
      pageTitle: decode(r.title),
      host: (r.meta_url?.hostname ?? new URL(r.url).hostname).replace(/^www\./, ""),
      favicon: r.meta_url?.favicon,
    }));
}
