/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { openDb } from "../lib/db/db.ts";
import { search } from "../lib/search/engine.ts";

const query = process.argv.slice(2).join(" ");
if (!query) {
  console.error('Usage : npm run search -- "votre requête"');
  process.exit(1);
}

const db = openDb();
const res = search(db, query, { perPage: 10 });

console.log(`\n${res.total} résultats en ${res.tookMs} ms${res.correctedQuery ? ` — essayez « ${res.correctedQuery} »` : ""}\n`);
for (const [i, hit] of res.hits.entries()) {
  const snippet = hit.snippet.map((p) => (p.hit ? `\x1b[1m${p.text}\x1b[0m` : p.text)).join("");
  console.log(`${hit.clustered ? "   ↳ " : String(i + 1).padStart(2) + ". "}\x1b[36m${hit.doc.title}\x1b[0m  \x1b[2m(${hit.score} · PR ${hit.doc.rank})\x1b[0m`);
  console.log(`    \x1b[32m${hit.doc.url}\x1b[0m`);
  console.log(`    ${snippet}\n`);
}
if (res.related.length) console.log(`Recherches associées : ${res.related.join(" · ")}`);
