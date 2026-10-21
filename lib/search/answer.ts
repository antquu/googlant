/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Answer box ("extrait optimisé" chez Google) : pour une question, le passage d'une des premières
 * pages qui y répond le mieux, affiché en tête des résultats. Pas d'IA, juste le texte indexé.
 */

import type { IndexedDoc, SearchHit, SnippetPart } from "./types";
import { fold, tokenize } from "./tokenizer";

export interface Answer {
  doc: IndexedDoc;
  parts: SnippetPart[];
}

const QUESTION =
  /^(comment|pourquoi|quand|qui|que|quoi|quel|quelle|quels|quelles|combien|où|ou est|est-ce|c'est quoi|qu'est-ce|à quoi|a quoi|de quoi|définition|definition|signification|how|why|what|when|who|where|which|is|are|can|does|do)\b|\?\s*$/i;

const JUNK = /cookie|javascript|newsletter|abonnez|inscrivez|connectez|©|tous droits|all rights|cliquez|click here|lire aussi|read more|partager|share|panier|livraison|t-shirt|[$€£]\s?\d|\d\s?[$€£]|msrp/i;
const FRENCH_Q = /^(comment|pourquoi|quand|qui|que|quoi|quel|quelle|quels|quelles|combien|où|est-ce|c'est|qu'est|à quoi|a quoi|de quoi|définition|signification)|[àâçéèêëîïôûù]/i;

// phrase de menu ou de liste ("Visites tous publics Les bons gestes Ressources...") : trop de mots en majuscule
function looksLikeMenu(s: string): boolean {
  const words = s.split(/\s+/);
  const caps = words.filter((w, i) => i > 0 && /^\p{Lu}/u.test(w) && !/[.!?:]$/.test(words[i - 1])).length;
  return caps / words.length > 0.22;
}

// mots de la question elle-même, à ne pas chercher dans le texte
const QWORDS = new Set(tokenize("comment pourquoi quand qui que quoi quel quelle quels quelles combien où ou est ce qu est-ce c est qu'est-ce c'est à a de définition definition signification faire how why what when who where which is are can does do the"));

export function isQuestion(q: string): boolean {
  return QUESTION.test(q.trim()) && q.trim().split(/\s+/).length >= 2;
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ0-9«"])/)
    // date collée en tête de phrase ("20/07/2026 Le ciel...") : retirée
    .map((s) => s.trim().replace(/^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})\s*[-–—|:]?\s*/, ""))
    .filter((s, i, all) => all.indexOf(s) === i)
    .filter((s) => s.length >= 40 && s.length <= 320 && !JUNK.test(s) && /[.!]$/.test(s) && !looksLikeMenu(s) && (s.match(/\p{L}/gu)?.length ?? 0) > s.length * 0.6);
}

/** Meilleur passage parmi les 3 premiers résultats, ou rien s'il ne répond pas vraiment. */
export function findAnswer(q: string, hits: SearchHit[]): Answer | null {
  if (!isQuestion(q)) return null;
  const terms = [...new Set(tokenize(q))].filter((t) => !QWORDS.has(t));
  if (!terms.length) return null;
  const french = FRENCH_Q.test(q);
  // la page doit parler du sujet dès son titre
  const subject = terms;
  let best: { score: number; doc: IndexedDoc; text: string } | null = null;

  hits
    .filter((h) => !h.clustered && h.doc.text && (!french || !h.doc.lang || h.doc.lang === "fr"))
    .filter((h) => {
      const title = new Set(tokenize(`${h.doc.title} ${h.doc.headings.slice(0, 3).join(" ")}`));
      return subject.filter((t) => title.has(t)).length >= Math.max(1, Math.ceil(subject.length / 2));
    })
    .slice(0, 3)
    .forEach((h, rank) => {
      const desc = h.doc.description.trim();
      const list = sentences(`${desc}${desc && !/[.!?]$/.test(desc) ? "." : ""} ${h.doc.text.slice(0, 12_000)}`);
      list.forEach((first, i) => {
        // passage de 1 à 3 phrases, 360 caractères au plus
        let text = first;
        for (let j = i + 1; j < Math.min(i + 3, list.length) && text.length + list[j].length < 360; j++) text += " " + list[j];
        const words = new Set(tokenize(text));
        const lead = new Set(tokenize(first));
        const covered = terms.filter((t) => words.has(t)).length / terms.length;
        if (covered < (terms.length <= 3 ? 1 : 0.75)) return;
        const leadCovered = terms.filter((t) => lead.has(t)).length / terms.length;
        // une définition ("X est un...", "X is a...") ou une explication ("parce que", "car") répond mieux
        const answers = /\b(est|sont|signifie|désigne|permet|consiste|is|are|means|refers)\b|\b(parce que|car|afin de|because|due to)\b/i.test(text) ? 1.25 : 1;
        const score = (covered * 2 + leadCovered) * answers * (1 - rank * 0.12) * (1 - Math.min(i, 40) * 0.006) * (text.length > 110 ? 1 : 0.8);
        if (!best || score > best.score) best = { score, doc: h.doc, text };
      });
    });

  const found = best as { score: number; doc: IndexedDoc; text: string } | null;
  if (!found || found.score < 2.9) return null;
  // mots de la question en gras, comme dans les extraits de résultats
  const termSet = new Set(terms);
  const parts: SnippetPart[] = [];
  for (const piece of found.text.split(/([\p{L}\p{N}'’-]+)/u)) {
    if (!piece) continue;
    const hit = /[\p{L}\p{N}]/u.test(piece) && tokenize(piece).some((t) => termSet.has(t)) && fold(piece).length > 2;
    const last = parts[parts.length - 1];
    if (last && last.hit === hit) last.text += piece;
    else parts.push({ text: piece, hit });
  }
  return { doc: found.doc, parts };
}
