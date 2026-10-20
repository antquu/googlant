/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Metadata } from "next";
import { getPrefs, getUserLocation } from "@/lib/context";
import { PreferencesForm } from "@/components/PreferencesForm";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Préférences" };

export default async function PreferencesPage() {
  const [prefs, loc] = await Promise.all([getPrefs(), getUserLocation()]);
  return (
    <>
      <SiteHeader />
      <main className="container">
        <div className="page-hero">
          <h1>
            Vos <em>préférences</em>
          </h1>
          <p>Pas de compte : vos réglages sont enregistrés dans un cookie sur cet appareil, et nulle part ailleurs.</p>
        </div>
        <PreferencesForm initial={prefs} loc={loc} />
      </main>
      <SiteFooter />
    </>
  );
}
