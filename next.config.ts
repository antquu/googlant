/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dossier de build séparé possible (ex. compiler la prod sans casser le serveur de dev)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  outputFileTracingIncludes: {
    "/**": ["./data/seed.jsonl.gz", "./crawler/directory.json"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), interest-cohort=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
