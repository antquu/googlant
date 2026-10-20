/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fold } from "./tokenizer";

export interface Rival {
  name: string;
  url: string;
  host: string;
}

// autres moteurs : si on les cherche, on propose d'y aller directement
const RIVALS: (Rival & { words: string[] })[] = [
  { name: "Google", url: "https://www.google.com", host: "google.com", words: ["google", "google.com", "google.fr", "gogle", "googel"] },
  { name: "Bing", url: "https://www.bing.com", host: "bing.com", words: ["bing", "bing.com", "microsoft bing"] },
  { name: "DuckDuckGo", url: "https://duckduckgo.com", host: "duckduckgo.com", words: ["duckduckgo", "duck duck go", "duckduckgo.com", "ddg"] },
  { name: "Qwant", url: "https://www.qwant.com", host: "qwant.com", words: ["qwant", "qwant.com"] },
  { name: "Ecosia", url: "https://www.ecosia.org", host: "ecosia.org", words: ["ecosia", "ecosia.org"] },
  { name: "Yahoo", url: "https://fr.yahoo.com", host: "yahoo.com", words: ["yahoo", "yahoo.fr", "yahoo.com"] },
  { name: "Brave Search", url: "https://search.brave.com", host: "search.brave.com", words: ["brave search", "search.brave.com"] },
  { name: "Startpage", url: "https://www.startpage.com", host: "startpage.com", words: ["startpage", "startpage.com"] },
  { name: "Yandex", url: "https://yandex.com", host: "yandex.com", words: ["yandex", "yandex.com"] },
  { name: "Lilo", url: "https://www.lilo.org", host: "lilo.org", words: ["lilo", "lilo.org"] },
];

/** La recherche est-elle juste le nom d'un autre moteur (« google », « bing.com »…) ? */
export function rivalFor(query: string): Rival | null {
  const q = fold(query.trim()).replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/$/, "");
  const hit = RIVALS.find((r) => r.words.includes(q));
  return hit ? { name: hit.name, url: hit.url, host: hit.host } : null;
}
