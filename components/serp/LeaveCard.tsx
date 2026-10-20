"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useState } from "react";
import type { Rival } from "@/lib/search/rivals";
import { ArrowRightIcon } from "../icons";

// on cherche « google » ou « bing » sur Googlant : on demande simplement où aller
export function LeaveCard({ rival }: { rival: Rival }) {
  const [closing, setClosing] = useState(false);
  const [gone, setGone] = useState(false);
  if (gone) return null;

  const stay = () => {
    setClosing(true);
    setTimeout(() => setGone(true), 320);
  };

  return (
    <section className="leave-card" data-closing={closing ? "1" : undefined} aria-labelledby="leave-title">
      <div className="leave-card-copy">
        <h2 id="leave-title">Vous voulez partir sur {rival.name} ?</h2>
        <p>
          Pas de souci, on ne vous retient pas. Vous pouvez aussi rester sur Googlant et voir nos résultats pour « {rival.name} ».
        </p>
      </div>
      <div className="leave-card-actions">
        <button type="button" className="cookie-btn cookie-btn-ghost" onClick={stay}>
          Continuer sur Googlant
        </button>
        <a className="cookie-btn cookie-btn-primary leave-card-go" href={rival.url} rel="noopener">
          Continuer vers {rival.name} <ArrowRightIcon />
        </a>
      </div>
    </section>
  );
}
