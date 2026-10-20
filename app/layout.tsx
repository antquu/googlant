/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Inter, Newsreader } from "next/font/google";
import { getPrefs } from "@/lib/context";
import { ConsoleBanner } from "@/components/ConsoleBanner";
import { Analytics } from "@vercel/analytics/next";
import { CookieBanner } from "@/components/CookieBanner";
import { CONSENT_COOKIE } from "@/lib/consent";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  alternates: { canonical: "/" },
  keywords: ["moteur de recherche", "Googlant", "recherche web", "cartes", "itinéraire", "Grenoble", "sans pistage"],
  // jeton de la Google Search Console (balise meta "google-site-verification")
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
  title: { default: "Googlant", template: "%s — Googlant" },
  description: "Googlant, le moteur de recherche indépendant : son propre crawler, son propre index, sans compte et sans pistage.",
  applicationName: "Googlant",
  openGraph: { title: "Googlant", description: "Le web, indexé simplement. Sans compte, sans pistage.", type: "website", locale: "fr_FR", siteName: "Googlant", url: "/" },
  twitter: { card: "summary_large_image", title: "Googlant", description: "Le web, indexé simplement. Sans compte, sans pistage." },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#121212",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const prefs = await getPrefs();
  // bandeau cookies tant qu'aucun choix n'a été fait (lu côté serveur : pas de flash à l'affichage)
  const consent = (await cookies()).get(CONSENT_COOKIE)?.value;
  return (
    <html lang="fr" className={`dark ${sans.variable} ${serif.variable}`} data-motion={prefs.motion === "reduced" ? "reduced" : undefined}>
      <head>
        {/* serveurs d'images : connexion ouverte d'avance, les photos arrivent plus vite */}
        <link rel="preconnect" href="https://upload.wikimedia.org" />
        <link rel="preconnect" href="https://commons.wikimedia.org" />
      </head>
      <body>
        <ConsoleBanner />
        {children}
        {!consent && <CookieBanner />}
        <Analytics />
      </body>
    </html>
  );
}
