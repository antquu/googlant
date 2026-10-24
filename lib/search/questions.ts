/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * "Autres questions" sans IA : les intertitres en forme de question des meilleures pages
 * ("Comment fonctionne... ?"), avec le paragraphe qui les suit comme réponse.
 */

import type { SearchHit } from "./types";
import { fold, tokenize } from "./tokenizer";

export interface Faq {
  q: string;
  a: string;
  url: string;
  host: string;
}

const QUESTION = /^(comment|pourquoi|quand|qui|que|quoi|quel|quelle|quels|quelles|combien|où|est-ce|qu'est|faut-il|peut-on|doit-on|how|why|what|when|who|where|which|can|is|are|do|does)\b.{8,110}\?$/i;

const ENGLISH = /^(how|why|what|when|who|where|which|can|is|are|do|does)\b/i;

export function indexQuestions(query: string, hits: SearchHit[], max = 4): Faq[] {
  const terms = new Set(tokenize(query));
  const french = !ENGLISH.test(query.trim());
  const out: Faq[] = [];
  const seen = new Set<string>();
  for (const h of hits.slice(0, 10)) {
    const text = h.doc.text.replace(/\s+/g, " ");
    for (const raw of h.doc.headings) {
      const q = raw.replace(/\s+/g, " ").trim();
      if (!QUESTION.test(q)) continue;
      // la question doit parler de la recherche, et dans sa langue
      if (!tokenize(q).some((t) => terms.has(t))) continue;
      if (french && ENGLISH.test(q)) continue;
      const key = fold(q).replace(/[^a-z0-9]/g, "");
      if (seen.has(key)) continue;
      // réponse : le texte juste après l'intertitre, coupé à la fin d'une phrase
      const at = text.indexOf(q);
      if (at < 0) continue;
      const after = text.slice(at + q.length, at + q.length + 420).trim();
      const whole = after.slice(0, 300).match(/^.*[.!](?=\s|$)/)?.[0] ?? "";
      const a = (whole.length > 60 ? whole : after.slice(0, 260).replace(/\s\S*$/, "") + "…").trim();
      if (a.length < 50 || /\?$/.test(a) || /patienter|chargement|javascript|cookie/i.test(a)) continue;
      seen.add(key);
      out.push({ q, a, url: h.doc.url, host: h.doc.host.replace(/^www\./, "") });
      if (out.length >= max) return out;
      break; // une question par page, pour varier les sources
    }
  }
  return out;
}
