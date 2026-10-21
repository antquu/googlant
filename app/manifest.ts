/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { MetadataRoute } from "next";

// application installable (Android "Installer l'application", iPhone "Sur l'écran d'accueil")
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Googlant",
    short_name: "Googlant",
    description: "Le moteur de recherche indépendant : son propre crawler, son propre index, sans compte et sans pistage.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#121212",
    theme_color: "#121212",
    lang: "fr",
    icons: [
      { src: "/pwa/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Googlant Maps", url: "/maps", icons: [{ src: "/pwa/192", sizes: "192x192" }] }],
  };
}
