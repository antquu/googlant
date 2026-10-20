/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { openDb } from "../lib/db/db.ts";
import { exportSeed, importDirectory, importPages, readJsonl } from "../lib/db/import.ts";
import { computePageRank } from "../lib/db/pagerank.ts";

const [cmd, arg] = process.argv.slice(2);
const db = openDb();

switch (cmd) {
  case "import": {
    const file = arg ?? "data/pages.jsonl";
    const t0 = performance.now();
    const n = importPages(db, readJsonl(file));
    const d = importDirectory(db, "crawler/directory.json");
    const r = computePageRank(db);
    console.log(`${n} pages importées depuis ${file}, ${d} fiches d'annuaire, PageRank sur ${r.links} liens — ${Math.round(performance.now() - t0)} ms`);
    break;
  }
  case "seed": {
    const n = exportSeed(db, arg ?? "data/seed.jsonl.gz");
    console.log(`${n} pages exportées dans ${arg ?? "data/seed.jsonl.gz"}`);
    break;
  }
  case "pagerank": {
    const r = computePageRank(db);
    console.log(`PageRank : ${r.pages} pages, ${r.links} liens, ${r.ms} ms`);
    break;
  }
  case "stats": {
    const s = db
      .prepare(
        `SELECT (SELECT count(*) FROM pages) AS pages, (SELECT count(*) FROM hosts WHERE pages > 0) AS hosts,
                (SELECT count(*) FROM images) AS images, (SELECT count(*) FROM frontier WHERE state = 0) AS queued,
                (SELECT count(*) FROM frontier WHERE state = 0 AND next_at <= unixepoch()) AS due,
                (SELECT count(*) FROM frontier WHERE state = 2) AS dead`,
      )
      .get();
    console.table(s);
    break;
  }
  default:
    console.error("Commandes : import [fichier] · seed [fichier] · pagerank · stats");
    process.exit(1);
}
db.close();
