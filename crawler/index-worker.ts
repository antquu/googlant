/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Un thread du serveur d'index : SQLite est synchrone, une recherche lente bloquerait toutes les
 * autres. Plusieurs threads, chacun avec sa connexion à la base, répondent en parallèle.
 */

import { parentPort } from "node:worker_threads";

process.env.GOOGLANT_INDEX_URL = "";
const { runLocal } = await import("../lib/index-api.ts");

parentPort!.on("message", async ({ id, op, args }: { id: number; op: Parameters<typeof runLocal>[0]; args: unknown[] }) => {
  try {
    const out = await runLocal(op, args as never);
    parentPort!.postMessage({ id, out });
  } catch (err) {
    parentPort!.postMessage({ id, error: String((err as Error)?.message ?? err) });
  }
});
