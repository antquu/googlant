// Googlant by antquu (github.com/antquu)
// SPDX-License-Identifier: GPL-3.0-or-later
// Compile le moteur de crawl Go (crawler-go) dans bin/. Cible : GOOS/GOARCH, sinon la machine courante.
// Ex. pour le serveur Linux depuis Windows : GOOS=linux GOARCH=amd64 npm run crawler:build
import { execFileSync } from "node:child_process";

const os = process.env.GOOS ?? ({ win32: "windows" }[process.platform] ?? process.platform);
const arch = process.env.GOARCH ?? (process.arch === "x64" ? "amd64" : process.arch);
const name = `googlant-crawler-${os === "windows" ? "win32" : os}-${arch}${os === "windows" ? ".exe" : ""}`;
execFileSync("go", ["build", "-trimpath", "-ldflags=-s -w", "-o", `../bin/${name}`, "."], {
  cwd: "crawler-go",
  stdio: "inherit",
  env: { ...process.env, GOOS: os, GOARCH: arch, CGO_ENABLED: "0" },
});
console.log(`bin/${name}`);
