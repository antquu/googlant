/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Recalcul du PageRank dans son propre processus (lancé par crawler/daemon.ts).
 */

import { openDb } from "../lib/db/db.ts";
import { computePageRank } from "../lib/db/pagerank.ts";

const db = openDb();
const r = computePageRank(db);
db.close();
console.log(`\x1b[1mPageRank recalculé : ${r.pages.toLocaleString("fr-FR")} pages, ${r.links.toLocaleString("fr-FR")} liens en ${r.ms} ms\x1b[0m`);
