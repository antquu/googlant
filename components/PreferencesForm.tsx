"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { UserLocation } from "@/lib/geo/types";
import { DEFAULT_PREFS, savePrefs, type Prefs } from "@/lib/prefs";
import { LocationControls } from "./LocationControls";

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function PreferencesForm({ initial, loc }: { initial: Prefs; loc: UserLocation | null }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const update = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(next);
    document.documentElement.dataset.motion = next.motion === "reduced" ? "reduced" : "";
    setToast("Préférences enregistrées");
    router.refresh();
  };

  return (
    <div className="form">
      <div className="field">
        <div className="field-label">
          <b>Résultats par page</b>
          <span>Nombre de liens affichés sur chaque page de résultats.</span>
        </div>
        <div className="segmented" role="group" aria-label="Résultats par page">
          {[10, 20, 30].map((n) => (
            <button key={n} type="button" aria-pressed={prefs.perPage === n} onClick={() => update({ perPage: n })}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ animationDelay: "40ms" }}>
        <div className="field-label">
          <b>Ouvrir les résultats dans un nouvel onglet</b>
          <span>La page de résultats reste ouverte derrière.</span>
        </div>
        <Switch label="Nouvel onglet" checked={prefs.newTab} onChange={(newTab) => update({ newTab })} />
      </div>

      <div className="field" style={{ animationDelay: "80ms" }}>
        <div className="field-label">
          <b>Suggestions de recherche</b>
          <span>Complétion automatique pendant la saisie, calculée à partir de l&apos;index.</span>
        </div>
        <Switch label="Suggestions" checked={prefs.suggestions} onChange={(suggestions) => update({ suggestions })} />
      </div>

      <div className="field" style={{ animationDelay: "120ms" }}>
        <div className="field-label">
          <b>Animations</b>
          <span>Livres flottants, transitions et effets de ressort.</span>
        </div>
        <div className="segmented" role="group" aria-label="Animations">
          <button type="button" aria-pressed={prefs.motion === "full"} onClick={() => update({ motion: "full" })}>
            Complètes
          </button>
          <button type="button" aria-pressed={prefs.motion === "reduced"} onClick={() => update({ motion: "reduced" })}>
            Réduites
          </button>
        </div>
      </div>

      <div className="field field-stack" style={{ animationDelay: "160ms" }}>
        <div className="field-label">
          <b>Position</b>
          <span>Localise les résultats, les commerces et les annonces. Rien n'est envoyé ailleurs.</span>
        </div>
        <LocationControls loc={loc} />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
        <button
          type="button"
          className="pill pill-tertiary pill-sm"
          onClick={() => {
            update(DEFAULT_PREFS);
            setToast("Préférences réinitialisées");
          }}
        >
          Tout réinitialiser
        </button>
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
