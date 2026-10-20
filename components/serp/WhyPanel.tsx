"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useState } from "react";
import { CloseIcon } from "../icons";

// "Pourquoi ce résultat ?" : le bouton "i" d'un résultat envoie ses infos, le panneau
// s'ouvre en haut de la colonne de droite (au-dessus de la fiche ou de l'encart).

export interface WhyInfo {
  url: string;
  host: string;
  title: string;
  siteName: string;
  crawledAt: string;
  publishedAt?: string;
  lang?: string;
  rank: number;
  inlinks: number;
  directory?: boolean;
  score: number;
  position: number;
  snippet: string;
}

const EVENT = "googlant:why";

export function WhyButton({ info }: { info: WhyInfo }) {
  return (
    <button
      type="button"
      className="why-btn"
      aria-label={`Pourquoi ce résultat : ${info.title}`}
      title="Pourquoi ce résultat ?"
      onClick={() => window.dispatchEvent(new CustomEvent<WhyInfo>(EVENT, { detail: info }))}
    >
      i
    </button>
  );
}

const LANGS: Record<string, string> = { fr: "français", en: "anglais", es: "espagnol", de: "allemand", it: "italien", pt: "portugais", nl: "néerlandais" };

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return "il y a quelques instants";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} jour${s >= 172800 ? "s" : ""}`;
}

const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export function WhyPanel({ query }: { query: string }) {
  const [info, setInfo] = useState<WhyInfo | null>(null);

  useEffect(() => {
    const on = (e: Event) => setInfo((e as CustomEvent<WhyInfo>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  useEffect(() => setInfo(null), [query]);

  if (!info) return null;

  // mots de la recherche retrouvés dans le titre ou dans l'extrait
  const words = [...new Set(query.split(/\s+/).filter((w) => w.length > 2 && !/:/.test(w)))];
  const inTitle = words.filter((w) => fold(info.title).includes(fold(w)));
  const inText = words.filter((w) => !inTitle.includes(w) && fold(info.snippet).includes(fold(w)));
  const pagerank = (info.rank * 10).toFixed(1);

  return (
    <section className="why" key={info.url} aria-label="Pourquoi ce résultat ?">
      <header className="why-head">
        <h2>Pourquoi ce résultat ?</h2>
        <button type="button" className="why-close" aria-label="Fermer" onClick={() => setInfo(null)}>
          <CloseIcon />
        </button>
      </header>
      <p className="why-page">
        <b>{info.siteName || info.host}</b>
        <span>{info.title}</span>
      </p>
      <ul className="why-list">
        {info.directory ? (
          <li>
            <span>Source</span>
            <b>Fiche de l&apos;annuaire Googlant : ce site bloque les robots, il n&apos;est pas crawlé</b>
          </li>
        ) : (
          <li>
            <span>Exploré</span>
            <b>
              {ago(info.crawledAt)} par GooglantBot <small>({date(info.crawledAt)})</small>
            </b>
          </li>
        )}
        {info.publishedAt && (
          <li>
            <span>Publié</span>
            <b>{date(info.publishedAt)}</b>
          </li>
        )}
        <li>
          <span>Correspondance</span>
          <b>
            {inTitle.length > 0 && <>« {inTitle.join(" », « ")} » dans le titre</>}
            {inTitle.length > 0 && inText.length > 0 && <br />}
            {inText.length > 0 && <>« {inText.join(" », « ")} » dans le texte</>}
            {inTitle.length === 0 && inText.length === 0 && <>mots proches (pluriels, accents, fautes corrigées)</>}
          </b>
        </li>
        <li>
          <span>Popularité</span>
          <b>
            PageRank {pagerank}/10 · {info.inlinks} lien{info.inlinks > 1 ? "s" : ""} vers cette page dans l&apos;index
          </b>
        </li>
        {info.lang && (
          <li>
            <span>Langue</span>
            <b>{LANGS[info.lang.slice(0, 2)] ?? info.lang}</b>
          </li>
        )}
        <li>
          <span>Classement</span>
          <b>
            {info.position}
            <sup>{info.position === 1 ? "er" : "e"}</sup> résultat · score {info.score.toFixed(2)}
          </b>
        </li>
      </ul>
      <p className="why-note">
        Aucun résultat n&apos;est payé, à part ceux marqués « Sponsorisé ». Le score combine la pertinence des mots (BM25), la part de la recherche
        retrouvée et la popularité de la page.
      </p>
      <a className="why-link" href={info.url} target="_blank" rel="noopener">
        Ouvrir la page ↗
      </a>
    </section>
  );
}
