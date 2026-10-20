/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const STOPWORDS = new Set(
  `
  a à au aux avec ce ces cet cette dans de des du elle en et eux il ils je la le les leur leurs lui ma mais me même mes moi mon ne nos notre nous on ou où par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous c d j l m n s t y été être avoir est sont était ont fait faire plus comme tout tous toute toutes aussi ainsi alors donc car si sans sous entre vers chez ici là cela ça celui celle ceux celles dont
  the of and to in is it that for on with as was be by this are or from at an not have has had but they you we he she his her its their our your which will would can could been were what when where who how all any some no if then than so do does did about into over also more most other such only just
  www http https com fr org net html php
`
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => fold(w)),
);

export function fold(input: string): string {
  return input
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function stem(word: string): string {
  let w = word;
  if (w.length <= 3 || /^\d+$/.test(w)) return w;

  if (w.endsWith("ies") && w.length > 4) w = w.slice(0, -3) + "y";
  else if (w.endsWith("aux") && w.length > 4) w = w.slice(0, -3) + "al";
  else if (w.endsWith("eaux")) w = w.slice(0, -1);
  else if ((w.endsWith("s") || w.endsWith("x")) && !w.endsWith("ss") && w.length > 4) w = w.slice(0, -1);

  const suffixes = ["ements", "ement", "ations", "ation", "ateurs", "ateur", "atrice", "euses", "euse", "ismes", "isme", "istes", "iste", "ites", "ite", "ing", "ness", "ment", "ique", "iques"];
  for (const s of suffixes) {
    if (w.endsWith(s) && w.length - s.length >= 4) {
      w = w.slice(0, -s.length);
      break;
    }
  }
  if (w.endsWith("e") && w.length > 4) w = w.slice(0, -1);
  if (w.endsWith("ed") && w.length > 5) w = w.slice(0, -2);
  return w;
}

export interface Token {
  term: string;
  raw: string;
  start: number;
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu;

export function tokenizeWithPositions(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(WORD)) {
    let raw = m[0];
    let start = m.index ?? 0;
    const apos = raw.search(/['’]/);
    if (apos > 0 && apos <= 2) {
      start += apos + 1;
      raw = raw.slice(apos + 1);
    }
    const folded = fold(raw).replace(/['’]/g, "");
    if (folded.length < 2 && !/\d/.test(folded)) continue;
    if (STOPWORDS.has(folded)) continue;
    if (folded.length > 40) continue;
    out.push({ term: stem(folded), raw, start });
  }
  return out;
}

export function tokenize(text: string): string[] {
  return tokenizeWithPositions(text).map((t) => t.term);
}

export function tokenizeUrl(url: string): string[] {
  try {
    const u = new URL(url);
    return tokenize(`${u.hostname.replace(/^www\./, "")} ${decodeURIComponent(u.pathname)}`.replace(/[._\-/]+/g, " "));
  } catch {
    return tokenize(url);
  }
}

export function levenshtein(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
