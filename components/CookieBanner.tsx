"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Link from "next/link";
import { useState } from "react";
import type { Consent } from "@/lib/consent";
import { saveConsent } from "@/lib/prefs";

// bandeau des cookies, collé en bas de l'écran : il reste tant qu'on n'a pas choisi
export function CookieBanner() {
  const [closing, setClosing] = useState(false);
  const [gone, setGone] = useState(false);
  if (gone) return null;

  const choose = (c: Consent) => {
    saveConsent(c);
    setClosing(true);
    setTimeout(() => setGone(true), 420);
  };

  return (
    <section className="cookie-bar" data-closing={closing ? "1" : undefined} role="dialog" aria-modal="false" aria-labelledby="cookie-title">
      <div className="cookie-bar-glow" aria-hidden />
      <div className="cookie-bar-inner">
        <div className="cookie-bar-mark" aria-hidden>
          Googlant
        </div>
        <div className="cookie-bar-copy">
          <h2 id="cookie-title">Quelques cookies, rien de plus</h2>
          <p>
            Googlant n&apos;a ni compte, ni pub ciblée, ni pistage. On garde seulement vos préférences et, si vous acceptez, votre ville pour classer les résultats
            locaux. <Link href="/privacy">En savoir plus</Link>
          </p>
        </div>
        <div className="cookie-bar-actions">
          <button type="button" className="cookie-btn cookie-btn-ghost" onClick={() => choose("essential")}>
            Refuser
          </button>
          <button type="button" className="cookie-btn cookie-btn-primary" onClick={() => choose("all")} autoFocus>
            Tout accepter
          </button>
        </div>
      </div>
    </section>
  );
}
