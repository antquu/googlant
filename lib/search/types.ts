/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface CrawledPage {
  url: string;
  finalUrl: string;
  canonical?: string;
  status: number;
  crawledAt: string;
  depth: number;
  lang?: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
  siteName?: string;
  favicon?: string;
  image?: string;
  publishedAt?: string;
  images: { src: string; alt: string }[];
  links: string[];
  contentHash: string;
}

export interface IndexedDoc {
  id: number;
  url: string;
  host: string;
  siteName: string;
  title: string;
  description: string;
  text: string;
  headings: string[];
  lang?: string;
  favicon?: string;
  image?: string;
  publishedAt?: string;
  crawledAt: string;
  rank: number;
  inlinks: number;
  directory?: boolean;
}

export interface SnippetPart {
  text: string;
  hit: boolean;
}

export interface SearchHit {
  doc: IndexedDoc;
  score: number;
  snippet: SnippetPart[];
  clustered?: boolean;
  titleTerms: string[];
}

export interface SearchResponse {
  query: string;
  correctedQuery?: string;
  autoCorrected?: boolean;
  total: number;
  page: number;
  perPage: number;
  tookMs: number;
  hits: SearchHit[];
  related: string[];
}
