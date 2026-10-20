/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { JUNK_ALT, JUNK_IMAGE } from "../lib/search/engine.ts";
import { normalizeUrl } from "./url.ts";

export interface Extracted {
  title: string;
  description: string;
  headings: string[];
  text: string;
  lang?: string;
  canonical?: string;
  siteName?: string;
  favicon?: string;
  image?: string;
  publishedAt?: string;
  images: { src: string; alt: string }[];
  links: string[];
  noindex: boolean;
  nofollow: boolean;
  contentHash: string;
}

const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();

function findPublished($: cheerio.CheerioAPI): string | undefined {
  const meta =
    $('meta[property="article:published_time"]').attr("content") ||
    $('meta[name="date"]').attr("content") ||
    $('meta[itemprop="datePublished"]').attr("content");
  let candidate = meta;
  if (!candidate) {
    $('script[type="application/ld+json"]').each((_, el) => {
      if (candidate) return;
      const m = $(el).text().match(/"datePublished"\s*:\s*"([^"]+)"/);
      if (m) candidate = m[1];
    });
  }
  if (!candidate) return undefined;
  const d = new Date(candidate);
  return Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 864e5 || d.getFullYear() < 1995 ? undefined : d.toISOString();
}

export function parseSitemap(xml: string): { pages: string[]; sitemaps: string[] } {
  const $ = cheerio.load(xml, { xml: true });
  return {
    pages: $("urlset > url > loc").map((_, el) => $(el).text().trim()).get(),
    sitemaps: $("sitemapindex > sitemap > loc").map((_, el) => $(el).text().trim()).get(),
  };
}

export function extract(html: string, pageUrl: string): Extracted {
  const $ = cheerio.load(html);

  const robots = ($('meta[name="robots"]').attr("content") ?? "").toLowerCase();
  const baseHref = $("base[href]").attr("href");
  const base = baseHref ? new URL(baseHref, pageUrl).toString() : pageUrl;

  const title = clean($("title").first().text()) || clean($('meta[property="og:title"]').attr("content")) || clean($("h1").first().text());
  const lead = $("main p, article p, [role=main] p, #mw-content-text p, body p")
    .map((_, el) => clean($(el).text()).replace(/\[\s*(\d+|[a-z]|note \d+)\s*\]/gi, ""))
    .get()
    .find((p) => p.length > 90 && p.split(" ").length > 12 && !/^(coordonn|\d+°)/i.test(p));
  const description =
    clean($('meta[name="description"]').attr("content")) || clean($('meta[property="og:description"]').attr("content")) || (lead ? lead.slice(0, 320) : "");

  const canonicalHref = $('link[rel="canonical"]').attr("href");
  const canonical = canonicalHref ? normalizeUrl(canonicalHref, base) ?? undefined : undefined;

  const iconHref = $('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').first().attr("href");
  const favicon = iconHref ? safeAbs(iconHref, base) : safeAbs("/favicon.ico", base);
  const ogImage = $('meta[property="og:image"]').attr("content");

  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const rel = ($(el).attr("rel") ?? "").toLowerCase();
    if (rel.includes("nofollow")) return;
    const n = normalizeUrl($(el).attr("href")!, base);
    if (n) links.add(n);
  });

  const images: { src: string; alt: string }[] = [];
  $("img[src], img[data-src]").each((_, el) => {
    if (images.length >= 12) return;
    const alt = clean($(el).attr("alt"));
    const src = $(el).attr("src") || $(el).attr("data-src");
    const w = Number($(el).attr("width") ?? 0);
    const h = Number($(el).attr("height") ?? 0);
    // logos, icônes, boutons, petites vignettes : pas des images qu'on veut montrer
    if (!src || src.startsWith("data:") || alt.length < 4 || (w && w < 200) || (h && h < 120) || JUNK_IMAGE.test(src) || JUNK_ALT.test(alt)) return;
    const abs = safeAbs(src, base);
    if (abs && /^https?:/.test(abs) && !/\.svg(\?|$)/i.test(abs)) images.push({ src: abs, alt });
  });

  const headings = $("h1, h2, h3")
    .map((_, el) => clean($(el).text()))
    .get()
    .filter((h) => h.length > 1 && h.length < 160)
    .slice(0, 30);

  $("script, style, noscript, template, svg, iframe, nav, footer, header, form, [aria-hidden=true], .cookie, #cookie-banner").remove();
  const main = $("main, article, [role=main]").first();
  const text = clean((main.length ? main : $("body")).text()).slice(0, 60_000);

  return {
    title: title.slice(0, 300),
    description: description.slice(0, 500),
    headings,
    text,
    lang: clean($("html").attr("lang")).slice(0, 5).toLowerCase() || undefined,
    canonical,
    siteName: clean($('meta[property="og:site_name"]').attr("content")) || undefined,
    favicon: favicon ?? undefined,
    image: ogImage ? safeAbs(ogImage, base) ?? undefined : undefined,
    publishedAt: findPublished($),
    images,
    links: [...links].slice(0, 300),
    noindex: robots.includes("noindex"),
    nofollow: robots.includes("nofollow"),
    contentHash: createHash("sha1").update(title + "\n" + description + "\n" + text.slice(0, 20_000)).digest("hex"),
  };
}

function safeAbs(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

