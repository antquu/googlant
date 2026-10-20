"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const FILE_TYPES = [
  { v: "", label: "Tous les types" },
  { v: "pdf", label: "PDF" },
  { v: "html", label: "Pages web" },
  { v: "doc", label: "Word (.doc)" },
  { v: "docx", label: "Word (.docx)" },
  { v: "xls", label: "Excel" },
  { v: "ppt", label: "PowerPoint" },
  { v: "txt", label: "Texte" },
  { v: "php", label: "PHP" },
];

const LANGS = [
  { v: "", label: "Toutes les langues" },
  { v: "fr", label: "Français" },
  { v: "en", label: "Anglais" },
  { v: "es", label: "Espagnol" },
  { v: "de", label: "Allemand" },
  { v: "it", label: "Italien" },
];

const DATES = [
  { v: "", label: "Toutes les dates" },
  { v: "1", label: "Moins de 24 heures" },
  { v: "7", label: "Moins d'une semaine" },
  { v: "31", label: "Moins d'un mois" },
  { v: "365", label: "Moins d'un an" },
];

const opValue = (q: string, ops: string[]) => q.match(new RegExp(`(?:^|\\s)(?:${ops.join("|")}):(\\S+)`, "i"))?.[1] ?? "";

function withOp(q: string, ops: string[], value: string): string {
  const stripped = q.replace(new RegExp(`(^|\\s)(?:${ops.join("|")}):\\S+`, "gi"), " ").replace(/\s+/g, " ").trim();
  return value ? `${stripped} ${value}`.trim() : stripped;
}

export const hasOperators = (q: string) => /(^|\s)-?(filetype|ext|lang|after|before|site|intitle|inurl):\S/i.test(q);

export function ToolsButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`serp-tab serp-tools-btn ${open ? "is-open" : ""}`} aria-expanded={open} onClick={onToggle}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="10" cy="17" r="2" />
      </svg>
      Outils
    </button>
  );
}

function daysAgo(after: string): string {
  if (!after) return "";
  const days = (Date.now() - new Date(after).getTime()) / 86_400_000;
  return DATES.find((d) => d.v && days <= Number(d.v) + 1)?.v ?? "";
}

export function SearchTools({ q, tab }: { q: string; tab: string }) {
  const router = useRouter();
  const active = hasOperators(q);
  const [site, setSite] = useState(opValue(q, ["site"]));

  const go = (next: string) => {
    if (!next.trim()) return;
    router.push(`/search?q=${encodeURIComponent(next)}${tab === "all" ? "" : `&tab=${tab}`}`);
  };

  const fileType = opValue(q, ["filetype", "ext"]).toLowerCase();
  const lang = opValue(q, ["lang"]).toLowerCase();
  const date = daysAgo(opValue(q, ["after"]));

  const setDate = (v: string) => {
    if (!v) return go(withOp(q, ["after", "before"], ""));
    const d = new Date(Date.now() - Number(v) * 86_400_000).toISOString().slice(0, 10);
    go(withOp(q, ["after", "before"], `after:${d}`));
  };

  const submitSite = (e: FormEvent) => {
    e.preventDefault();
    const s = site.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    go(withOp(q, ["site"], s ? `site:${s}` : ""));
  };

  return (
    <div className="serp-tools" role="group" aria-label="Filtres de recherche">
          <label className={`serp-tool ${fileType ? "is-set" : ""}`}>
            <span className="sr-only">Type de fichier</span>
            <select value={FILE_TYPES.some((f) => f.v === fileType) ? fileType : ""} onChange={(e) => go(withOp(q, ["filetype", "ext"], e.target.value ? `filetype:${e.target.value}` : ""))}>
              {FILE_TYPES.map((f) => (
                <option key={f.v} value={f.v}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`serp-tool ${lang ? "is-set" : ""}`}>
            <span className="sr-only">Langue</span>
            <select value={LANGS.some((l) => l.v === lang) ? lang : ""} onChange={(e) => go(withOp(q, ["lang"], e.target.value ? `lang:${e.target.value}` : ""))}>
              {LANGS.map((l) => (
                <option key={l.v} value={l.v}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`serp-tool ${date ? "is-set" : ""}`}>
            <span className="sr-only">Date</span>
            <select value={date} onChange={(e) => setDate(e.target.value)}>
              {DATES.map((d) => (
                <option key={d.v} value={d.v}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <form className={`serp-tool serp-tool-site ${opValue(q, ["site"]) ? "is-set" : ""}`} onSubmit={submitSite}>
            <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="Dans un site (ex. wikipedia.org)" aria-label="Rechercher dans un site" enterKeyHint="search" />
          </form>
          {active && (
            <button type="button" className="serp-tools-clear" onClick={() => go(withOp(q, ["filetype", "ext", "lang", "after", "before", "site", "-site", "intitle", "inurl"], "") || q)}>
              Effacer les filtres
            </button>
          )}
          <details className="serp-tools-help">
            <summary>Opérateurs</summary>
            <ul>
              <li><code>&quot;phrase exacte&quot;</code> cette phrase mot pour mot</li>
              <li><code>-mot</code> exclure un mot</li>
              <li><code>site:lemonde.fr</code> / <code>-site:</code> dans un site, ou sauf ce site</li>
              <li><code>filetype:pdf</code> type de fichier</li>
              <li><code>intitle:météo</code> mot dans le titre</li>
              <li><code>inurl:blog</code> mot dans l&apos;adresse</li>
              <li><code>lang:en</code> langue de la page</li>
              <li><code>after:2025-01</code> <code>before:2024</code> date de publication</li>
            </ul>
          </details>
    </div>
  );
}
