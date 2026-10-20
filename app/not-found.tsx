/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Link from "next/link";
import { SearchComposer } from "@/components/SearchComposer";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="container">
        <div className="page-hero">
          <h1>
            Page <em>introuvable</em>
          </h1>
          <p>Même notre crawler ne l&apos;a jamais croisée. Essayez plutôt une recherche :</p>
        </div>
        <div style={{ maxWidth: 600 }}>
          <SearchComposer />
          <p style={{ marginTop: 18 }}>
            <Link href="/" className="section-link">
              ← Retour à l&apos;accueil
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
