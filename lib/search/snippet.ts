/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tokenizeWithPositions } from "./tokenizer";
import type { SnippetPart } from "./types";

export function highlight(text: string, terms: Set<string>): SnippetPart[] {
  const parts: SnippetPart[] = [];
  let cursor = 0;
  for (const tok of tokenizeWithPositions(text)) {
    if (!terms.has(tok.term)) continue;
    if (tok.start > cursor) parts.push({ text: text.slice(cursor, tok.start), hit: false });
    parts.push({ text: tok.raw, hit: true });
    cursor = tok.start + tok.raw.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false });
  const merged: SnippetPart[] = [];
  for (const p of parts) {
    const prev = merged[merged.length - 1];
    if (prev && prev.hit && p.hit) prev.text += p.text;
    else if (prev && prev.hit && !p.hit && /^\s+$/.test(p.text) && p.text.length < 3) merged.push(p);
    else merged.push({ ...p });
  }
  return merged;
}

export function makeSnippet(text: string, description: string, terms: Set<string>, maxLen = 230): SnippetPart[] {
  const tokens = tokenizeWithPositions(text);
  const hits = tokens.filter((t) => terms.has(t.term));

  if (!hits.length) {
    const fallback = description || text;
    return highlight(trimTo(fallback, maxLen), terms);
  }

  let best = { start: hits[0].start, score: -1 };
  for (let i = 0; i < hits.length; i++) {
    const distinct = new Set<string>();
    let count = 0;
    for (let j = i; j < hits.length && hits[j].start - hits[i].start < maxLen - 40; j++) {
      distinct.add(hits[j].term);
      count++;
    }
    const score = distinct.size * 10 + count;
    if (score > best.score) best = { start: hits[i].start, score };
  }

  let start = Math.max(0, best.start - 60);
  const sentence = text.lastIndexOf(". ", best.start);
  if (sentence >= 0 && best.start - sentence < 90) start = sentence + 2;
  else if (start > 0) start = text.indexOf(" ", start) + 1;

  let end = Math.min(text.length, start + maxLen);
  if (end < text.length) end = Math.max(text.lastIndexOf(" ", end), start + 40);

  const slice = (start > 0 ? "… " : "") + text.slice(start, end).trim() + (end < text.length ? " …" : "");
  return highlight(slice, terms);
}

function trimTo(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.lastIndexOf(" ", n);
  return s.slice(0, cut > 40 ? cut : n) + " …";
}
