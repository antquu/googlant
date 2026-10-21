/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Aperçu IA en haut des résultats : Gemini (offre gratuite de Google) résume les meilleures
 * pages de l'index et les cite avec [1], [2]... Réponses gardées en cache pour économiser le quota.
 */

import "server-only";
import type { SearchHit } from "../search/types";

export interface AiSource {
  n: number;
  url: string;
  host: string;
  siteName: string;
  title: string;
  favicon?: string;
  image?: string;
  date?: string;
  snippet: string;
}

const KEY = () => process.env.GEMINI_API_KEY ?? "";
// le premier modèle qui répond est retenu ; GEMINI_MODEL pour en imposer un
const MODELS = (process.env.GEMINI_MODEL ?? "gemini-flash-latest,gemini-2.5-flash,gemini-2.0-flash").split(",").map((m) => m.trim()).filter(Boolean);

export const aiEnabled = () => !!KEY();

/** Recherches où un aperçu a du sens : pas les noms de sites, pas les opérateurs, pas les requêtes d'un mot très court. */
export function wantsOverview(q: string, hits: SearchHit[]): boolean {
  if (!aiEnabled() || hits.length < 2) return false;
  if (/(^|\s)-?[a-z]+:\S/i.test(q)) return false;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (q.length < 4) return false;
  // "youtube", "leboncoin.fr" : l'utilisateur veut le site, pas un résumé
  if (words.length === 1 && hits.slice(0, 2).some((h) => h.doc.host.replace(/^www\./, "").split(".")[0] === words[0].replace(/\.\w+$/, ""))) return false;
  if (/^(https?:\/\/|www\.)/.test(q)) return false;
  return true;
}

export function toSources(hits: SearchHit[]): AiSource[] {
  return hits
    .filter((h) => !h.clustered)
    .slice(0, 6)
    .map((h, i) => ({
      n: i + 1,
      url: h.doc.url,
      host: h.doc.host.replace(/^www\./, ""),
      siteName: h.doc.siteName,
      title: h.doc.title,
      favicon: h.doc.favicon,
      image: h.doc.image,
      date: h.doc.publishedAt ?? h.doc.crawledAt,
      snippet: (h.doc.description || h.snippet.map((p) => p.text).join("")).slice(0, 180),
    }));
}

function prompt(q: string, hits: SearchHit[]): string {
  const docs = hits
    .filter((h) => !h.clustered)
    .slice(0, 6)
    .map((h, i) => {
      const body = [h.doc.description, h.doc.text].filter(Boolean).join("\n").replace(/\s+/g, " ").slice(0, 1800);
      return `[${i + 1}] ${h.doc.title} (${h.doc.host})\n${body}`;
    })
    .join("\n\n");
  return `Recherche : ${q}\nDate du jour : ${new Date().toLocaleDateString("fr-FR")}\n\nPages trouvées :\n\n${docs}`;
}

const SYSTEM = `Tu écris l'"Aperçu IA" d'un moteur de recherche, à partir des pages fournies uniquement.
- Réponds dans la langue de la recherche (français par défaut).
- Commence par 1 à 3 phrases qui répondent directement, sans introduction.
- Ensuite, si c'est utile, un intertitre "## ..." et une liste "- **Point :** explication" (3 à 5 points), ou un court paragraphe.
- 220 mots au maximum. Pas de conclusion, pas de formule de politesse.
- Après chaque information, cite la ou les pages avec [1], [2]... (numéros des pages fournies).
- N'invente rien qui ne soit pas dans les pages. Si elles ne permettent pas de répondre, écris seulement : AUCUNE`;

type Cached = { at: number; text: string };
const holder = globalThis as unknown as { __ai?: Map<string, Cached>; __aiBusy?: number };
const cache = (holder.__ai ??= new Map());
const DAY = 24 * 3600 * 1000;

export function cached(q: string): string | null {
  const hit = cache.get(q.toLowerCase());
  return hit && Date.now() - hit.at < DAY ? hit.text : null;
}

function remember(q: string, text: string) {
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  cache.set(q.toLowerCase(), { at: Date.now(), text });
}

async function call(model: string, body: unknown): Promise<Response> {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": KEY() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
}

/** Texte de l'aperçu, morceau par morceau. Rien du tout si Gemini refuse, est saturé ou ne sait pas répondre. */
export async function* overview(q: string, hits: SearchHit[]): AsyncGenerator<string> {
  const base = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: prompt(q, hits) }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 900 },
  };
  let res: Response | null = null;
  for (const model of MODELS) {
    // sans "réflexion" : la réponse commence bien plus vite
    res = await call(model, { ...base, generationConfig: { ...base.generationConfig, thinkingConfig: { thinkingBudget: 0 } } }).catch(() => null);
    if (res?.status === 400) res = await call(model, base).catch(() => null);
    if (res?.ok) break;
    if (res?.status === 429) console.warn(`[googlant] aperçu IA : quota Gemini atteint (${model})`);
  }
  if (!res?.ok || !res.body) return;

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let text = "";
  let sent = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      try {
        const data = JSON.parse(line.slice(5)) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
        for (const p of data.candidates?.[0]?.content?.parts ?? []) if (p.text && !p.thought) text += p.text;
      } catch {
        continue;
      }
      // on attend quelques caractères pour repérer "AUCUNE" avant d'envoyer quoi que ce soit
      if (text.length < 12 && "AUCUNE".startsWith(text.trim().toUpperCase())) continue;
      if (/^\s*AUCUNE/i.test(text)) return;
      yield text.slice(sent);
      sent = text.length;
    }
  }
  if (/^\s*AUCUNE/i.test(text) || !text.trim()) return;
  if (sent < text.length) yield text.slice(sent);
  remember(q, text);
}
