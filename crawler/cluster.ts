/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Lance plusieurs crawlers en parallèle sur la même base, chacun sur sa part des sites.
 * Usage : tsx crawler/cluster.ts [--shards N] [options du crawler…]
 * Sans --shards : 1 si le moteur Go est compilé (il utilise déjà tous les cœurs), sinon autant de
 * crawlers Node que la machine le permet (1 par cœur, ~600 Mo de RAM chacun).
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const at = args.indexOf("--shards");
const auto = Math.max(1, Math.min(cpus().length, Math.floor(totalmem() / (600 * 1024 * 1024))));
// avec le moteur Go, un seul processus utilise déjà tous les cœurs
const arch = process.arch === "x64" ? "amd64" : process.arch;
const goEngine = !args.includes("node") && existsSync(new URL(`../bin/googlant-crawler-${process.platform}-${arch}${process.platform === "win32" ? ".exe" : ""}`, import.meta.url));
const shards = at >= 0 ? Math.max(1, Number(args[at + 1]) || auto) : goEngine ? 1 : auto;
const rest = at >= 0 ? [...args.slice(0, at), ...args.slice(at + 2)] : args;

const daemon = fileURLToPath(new URL("./daemon.ts", import.meta.url));
const tsx = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const children = new Map<number, ChildProcess>();
let stopping = false;

function start(i: number) {
  const child = spawn(process.execPath, [tsx, daemon, ...rest, "--shard", `${i}/${shards}`], { stdio: "inherit" });
  children.set(i, child);
  child.on("exit", (code) => {
    children.delete(i);
    if (stopping) {
      if (!children.size) process.exit(0);
      return;
    }
    console.error(`crawler ${i + 1}/${shards} arrêté (code ${code}) : relance dans 10 s`);
    setTimeout(() => start(i), 10_000);
  });
}

console.log(`${shards} crawler(s) en parallèle`);
for (let i = 0; i < shards; i++) setTimeout(() => start(i), i * 3000);

const stop = () => {
  if (stopping) process.exit(1);
  stopping = true;
  for (const c of children.values()) c.kill("SIGINT");
  if (!children.size) process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
