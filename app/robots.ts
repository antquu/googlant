/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// pages d'accueil et Maps indexables ; les pages de résultats et l'API ne le sont pas
// (contenu infini et sans intérêt pour un autre moteur, et ça économise la bande passante Vercel)
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/maps", "/privacy"],
        disallow: ["/api/", "/search", "/preferences", "/maps?"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
