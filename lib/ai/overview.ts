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

// GEMINI_API_KEY, GEMINI_API_KEY2, GEMINI_API_KEY3... : on passe à la clé suivante quand l'une est à court de quota
const KEYS = () =>
  Object.keys(process.env)
    .filter((k) => /^GEMINI_API_KEY\d*$/i.test(k) && process.env[k])
    .sort((a, b) => (Number(a.replace(/\D/g, "")) || 1) - (Number(b.replace(/\D/g, "")) || 1))
    .map((k) => process.env[k]!.trim());
// le premier modèle qui répond est retenu ; GEMINI_MODEL pour en imposer un
const MODELS = (process.env.GEMINI_MODEL || "gemini-flash-latest,gemini-2.5-flash,gemini-2.0-flash").split(",").map((m) => m.trim()).filter(Boolean);

export const aiEnabled = () => KEYS().length > 0;

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

// clé à court de quota : mise de côté une minute ; modèle inconnu : oublié ; réglage de "réflexion" accepté par modèle
const resting = new Map<string, number>();
const deadModels = new Set<string>();
const thinkingFor = new Map<string, number>();
// sans "réflexion" la réponse commence bien plus vite ; les modèles récents prennent thinkingLevel, les 2.x thinkingBudget
const THINKING = [{ thinkingBudget: 0 }, { thinkingLevel: "minimal" }, { thinkingLevel: "low" }, null];
let turn = 0;

type Reader = ReadableStreamDefaultReader<string>;
const FIRST_BYTE_MS = 9_000;
const FIRST_TEXT_MS = 14_000;
const BUDGET_MS = 22_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((ok) => setTimeout(() => ok(null), ms))]);
}

/** Ouvre un flux Gemini avec la première clé et le premier modèle qui répondent vite. */
async function open(body: Record<string, unknown>, started: number): Promise<{ reader: Reader; ctrl: AbortController } | null> {
  const keys = KEYS();
  const start = turn++ % Math.max(keys.length, 1);
  const order = [...keys.slice(start), ...keys.slice(0, start)].filter((k) => (resting.get(k) ?? 0) < Date.now());
  for (const model of MODELS.filter((m) => !deadModels.has(m))) {
    for (const key of order) {
      for (let t = thinkingFor.get(model) ?? 0; t < THINKING.length; t++) {
        if (Date.now() - started > BUDGET_MS) return null;
        if ((resting.get(key) ?? 0) > Date.now()) break;
        const ctrl = new AbortController();
        const gen = body.generationConfig as Record<string, unknown>;
        const payload = { ...body, generationConfig: THINKING[t] ? { ...gen, thinkingConfig: THINKING[t] } : gen };
        const res = await withTimeout(
          fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify(payload),
            signal: ctrl.signal,
          }).catch(() => null),
          FIRST_BYTE_MS,
        );
        if (!res) {
          ctrl.abort();
          break; // trop lent : clé suivante
        }
        if (res.ok && res.body) {
          thinkingFor.set(model, t);
          return { reader: res.body.pipeThrough(new TextDecoderStream()).getReader(), ctrl };
        }
        if (res.status === 400) continue; // réglage de réflexion refusé par ce modèle : le suivant
        if (res.status === 404) {
          deadModels.add(model);
          break;
        }
        if (res.status === 429 || res.status === 403 || res.status === 401) {
          resting.set(key, Date.now() + (res.status === 429 ? 60_000 : 3_600_000));
          console.warn(`[googlant] aperçu IA : clé n°${keys.indexOf(key) + 1} ${res.status === 429 ? "à court de quota" : "refusée"}`);
        }
        break;
      }
      if (deadModels.has(model)) break;
    }
  }
  return null;
}

/** Texte de l'aperçu, morceau par morceau. Rien du tout si Gemini refuse, est saturé, trop lent ou ne sait pas répondre. */
export async function* overview(q: string, hits: SearchHit[]): AsyncGenerator<string> {
  const started = Date.now();
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: prompt(q, hits) }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 900 },
  };
  const stream = await open(body, started);
  if (!stream) return;
  const { reader, ctrl } = stream;

  let buf = "";
  let text = "";
  let sent = 0;
  for (;;) {
    // le modèle "réfléchit" trop longtemps avant d'écrire : on abandonne plutôt que de faire attendre
    const chunk = sent ? await reader.read() : await withTimeout(reader.read(), Math.max(1_000, FIRST_TEXT_MS - (Date.now() - started)));
    if (!chunk) {
      ctrl.abort();
      return;
    }
    const { value, done } = chunk;
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
