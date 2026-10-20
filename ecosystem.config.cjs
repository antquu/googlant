/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

module.exports = {
  apps: [
    {
      name: "googlant-web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      env: { NODE_ENV: "production", NODE_OPTIONS: "--disable-warning=ExperimentalWarning" },
      max_memory_restart: "1G",
      restart_delay: 3000,
    },
    {
      name: "googlant-crawler",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "crawler/cluster.ts --quiet",
      env: { NODE_OPTIONS: "--disable-warning=ExperimentalWarning --max-old-space-size=2048" },
      max_memory_restart: "2500M",
      restart_delay: 10000,
      kill_timeout: 30000,
    },
  ],
};
