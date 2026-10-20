/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Extraction de texte PDF minimaliste, sans dépendance : titre des métadonnées et texte des
 * flux FlateDecode (opérateurs Tj / TJ / ' / "). Les PDF à polices CID ou scannés donnent peu
 * de texte : on garde alors seulement le titre.
 */

import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

export interface PdfInfo {
  title: string;
  text: string;
  lang?: string;
  contentHash: string;
}

const MAX_TEXT = 60_000;

function decodeLiteral(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = raw[++i];
    if (next === undefined) break;
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "b" || next === "f") out += " ";
    else if (/[0-7]/.test(next)) {
      let oct = next;
      while (oct.length < 3 && /[0-7]/.test(raw[i + 1] ?? "")) oct += raw[++i];
      out += String.fromCharCode(parseInt(oct, 8));
    } else if (next === "\r" || next === "\n") {
      if (next === "\r" && raw[i + 1] === "\n") i++;
    } else out += next;
  }
  return out;
}

/** Chaîne PDF (déjà sans parenthèses) : UTF-16BE si elle commence par le BOM, sinon PDFDocEncoding ≈ latin-1. */
function pdfString(s: string): string {
  if (s.charCodeAt(0) === 0xfe && s.charCodeAt(1) === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < s.length; i += 2) out += String.fromCharCode((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1));
    return out;
  }
  return s;
}

function hexString(h: string): string {
  const hex = h.replace(/[^0-9a-f]/gi, "");
  let s = "";
  for (let i = 0; i + 1 < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return pdfString(s);
}

/** Lit une chaîne littérale « (…) » équilibrée à partir de la position de la parenthèse ouvrante. */
function readLiteral(src: string, start: number): { value: string; end: number } {
  let depth = 0;
  let i = start;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) break;
  }
  return { value: decodeLiteral(src.slice(start + 1, i)), end: i + 1 };
}

function metaTitle(head: string): string {
  const lit = head.match(/\/Title\s*\(/);
  if (lit?.index !== undefined) return pdfString(readLiteral(head, head.indexOf("(", lit.index)).value).trim();
  const hex = head.match(/\/Title\s*<([0-9a-fA-F\s]+)>/);
  return hex ? hexString(hex[1]).trim() : "";
}

function textOps(content: string): string {
  const parts: string[] = [];
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    if (ch === "(") {
      const { value, end } = readLiteral(content, i);
      parts.push(value);
      i = end;
    } else if (ch === "T" && (content[i + 1] === "d" || content[i + 1] === "D" || content[i + 1] === "*" || content[i + 1] === "m")) {
      parts.push(" ");
      i += 2;
    } else if (ch === "E" && content[i + 1] === "T") {
      parts.push("\n");
      i += 2;
    } else if (ch === "]") {
      // fin d'un tableau TJ : les grands décalages négatifs séparent des mots
      parts.push("");
      i++;
    } else {
      // gros espacement dans un TJ (ex. « -250 ») → espace entre mots
      const m = content.slice(i, i + 8).match(/^-(\d{3,})/);
      if (m) {
        parts.push(" ");
        i += m[0].length;
      } else i++;
    }
  }
  return parts.join("");
}

export function extractPdf(buf: Buffer, url: string): PdfInfo | null {
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return null;
  const src = buf.toString("latin1");
  let title = metaTitle(src.slice(-200_000)) || metaTitle(src.slice(0, 200_000));
  let text = "";

  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  let streams = 0;
  while ((m = re.exec(src)) && text.length < MAX_TEXT && streams < 400) {
    const start = m.index + m[0].length;
    const end = src.indexOf("endstream", start);
    if (end < 0) break;
    const dict = src.slice(Math.max(0, m.index - 300), m.index);
    re.lastIndex = end;
    if (/\/Subtype\s*\/Image|\/Type\s*\/XObject|\/Length1|\/FontFile/.test(dict)) continue;
    streams++;
    let data: string;
    try {
      data = /FlateDecode/.test(dict) ? inflateSync(buf.subarray(start, end)).toString("latin1") : /\/Filter/.test(dict) ? "" : src.slice(start, end);
    } catch {
      continue;
    }
    if (!/\bBT\b/.test(data)) continue;
    text += textOps(data) + "\n";
  }

  // ligatures fi / fl souvent codées en caractères de contrôle, le reste des contrôles est jeté
  text = text.replace(/\x02/g, "fi").replace(/\x03/g, "fl").replace(/[\x00-\x08\x0b-\x1f]/g, "");
  text = text.replace(/[^\S\n]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  // texte illisible (polices CID, encodages exotiques) : on ne garde que le titre
  const letters = (text.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length;
  if (text.length < 120 || letters / text.length < 0.55) text = "";
  text = text.slice(0, MAX_TEXT);

  const fileLike = /^[\w.-]+$/.test(title) && /[_.]/.test(title);
  if (!title || title.length < 3 || fileLike || /^(untitled|sans titre|microsoft word.*|document\d*|\d+)$/i.test(title)) {
    const file = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "").replace(/\.pdf$/i, "");
    const fromFile = file.replace(/[_-]+/g, " ").trim();
    const fromText = text.split("\n").find((l) => l.length > 8 && l.length < 140) ?? text.slice(0, 90).replace(/\s\S*$/, "");
    title = /[a-zA-ZÀ-ÿ]{4,}/.test(fromFile) && !/^[A-Z0-9 ]{12,}$/.test(fromFile) ? fromFile : fromText || fromFile;
  }
  title = title.replace(/\s+/g, " ").slice(0, 200);
  const lang = /\b(le|la|les|des|est|pour|dans|une)\b/i.test(text.slice(0, 3000)) ? "fr" : /\b(the|and|for|with|this)\b/i.test(text.slice(0, 3000)) ? "en" : undefined;
  return { title, text, lang, contentHash: createHash("sha1").update(title + "\n" + text.slice(0, 20_000)).digest("hex") };
}
