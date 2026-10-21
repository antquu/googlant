/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Link from "next/link";
import { getStats } from "@/lib/home-data";
import type { IndexStats } from "@/lib/search/store";
import { FooterStats } from "./FooterStats";
import { VERSION } from "./Logo";

// une recherche d'images différente à chaque visite
const IMAGE_IDEAS = ["Lyon", "Grenoble", "montagne", "aurore boréale", "tramway", "architecture", "chat", "Alpes", "plage", "volcan", "forêt", "Paris la nuit", "street art", "Saint-Étienne", "Nancy place Stanislas"];

function explore() {
  const q = IMAGE_IDEAS[Math.floor(Math.random() * IMAGE_IDEAS.length)];
  return [
    { label: "Recherche web", href: "/" },
    { label: "Images", href: `/search?q=${encodeURIComponent(q)}&tab=images` },
    { label: "Googlant Maps", href: "/maps" },
  ];
}

export async function SiteFooter({ stats: given }: { stats?: IndexStats | null } = {}) {
  const stats = given !== undefined ? given : await getStats();
  return (
    <footer className="footer">
      <div className="footer-glow" aria-hidden />
      <div className="container">
        <div className="footer-grid">
          <div className="footer-intro">
            <p className="footer-tagline">
              Le web, <em>indexé simplement.</em>
            </p>
            {stats && <FooterStats initial={stats} />}
          </div>

          <nav className="footer-col" aria-label="Explorer">
            <h3>Explorer</h3>
            {explore().map((l) => (
              <Link prefetch={false} key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
            <a href="https://www.grelines.fr" target="_blank" rel="noopener">
              GreLines
            </a>
          </nav>

          <nav className="footer-col" aria-label="Googlant">
            <h3>Googlant</h3>
            <Link prefetch={false} href="/preferences">Préférences</Link>
            <Link prefetch={false} href="/privacy">Confidentialité</Link>
            <a href="https://github.com/antquu/googlant" target="_blank" rel="noreferrer">
              Code source
            </a>
          </nav>
        </div>

        <div className="footer-wordmark" aria-hidden>
          Googlant
        </div>

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Googlant · {VERSION}</span>
          <span>An Antoine ADAM production</span>
        </div>
      </div>
    </footer>
  );
}
