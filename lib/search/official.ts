/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Sites officiels des services publics : quand on tape "ants", "caf" ou "impots", on veut le site
 * lui-même en premier. Certains (ants.gouv.fr...) bloquent les robots, le crawler ne peut pas les lire :
 * ils sont donc listés ici à la main.
 */

import type { SearchHit } from "./types";
import { fold } from "./tokenizer";

interface Official {
  url: string;
  title: string;
  description: string;
  names: string[];
}

const OFFICIAL: Official[] = [
  { url: "https://ants.gouv.fr/", title: "France Titres (ANTS) — Agence nationale des titres sécurisés", description: "Carte d'identité, passeport, permis de conduire et certificat d'immatriculation : faire une demande et suivre son dossier en ligne.", names: ["ants", "france titres", "agence nationale des titres securises"] },
  { url: "https://www.service-public.gouv.fr/", title: "Service-Public.fr — Le site officiel de l'administration française", description: "Droits, démarches et formulaires des particuliers, des professionnels et des associations.", names: ["service public", "servicepublic"] },
  { url: "https://www.impots.gouv.fr/", title: "impots.gouv.fr — Direction générale des Finances publiques", description: "Déclaration de revenus, paiement des impôts, espace particulier et professionnel.", names: ["impots", "impot", "impots gouv", "dgfip"] },
  { url: "https://www.caf.fr/", title: "Caf.fr — Caisse d'allocations familiales", description: "Allocations familiales, aides au logement, prime d'activité, RSA : simulations et démarches en ligne.", names: ["caf", "caisse d allocations familiales"] },
  { url: "https://www.ameli.fr/", title: "ameli.fr — Le site de l'Assurance Maladie", description: "Compte ameli, remboursements, carte Vitale, arrêts de travail et informations santé.", names: ["ameli", "assurance maladie", "cpam"] },
  { url: "https://www.francetravail.fr/", title: "France Travail (ex-Pôle emploi)", description: "Offres d'emploi, inscription, actualisation et espace personnel des demandeurs d'emploi.", names: ["france travail", "pole emploi", "francetravail"] },
  { url: "https://www.urssaf.fr/", title: "Urssaf.fr — Recouvrement des cotisations sociales", description: "Espace employeur, travailleur indépendant et micro-entrepreneur : déclarations et paiements.", names: ["urssaf"] },
  { url: "https://www.legifrance.gouv.fr/", title: "Légifrance — Le service public de la diffusion du droit", description: "Codes, lois, décrets, Journal officiel et jurisprudence.", names: ["legifrance", "journal officiel"] },
  { url: "https://franceconnect.gouv.fr/", title: "FranceConnect — Accéder aux services publics en ligne", description: "Un seul identifiant pour se connecter à plus de 1 400 services en ligne.", names: ["franceconnect", "france connect"] },
  { url: "https://www.info.gouv.fr/", title: "info.gouv.fr — Le site du Gouvernement", description: "Actualités, décisions et actions du Gouvernement.", names: ["gouvernement", "gouvernement fr", "info gouv"] },
  { url: "https://www.elysee.fr/", title: "Élysée — Présidence de la République", description: "Le site officiel de la Présidence de la République française.", names: ["elysee", "presidence de la republique"] },
  { url: "https://www.interieur.gouv.fr/", title: "Ministère de l'Intérieur", description: "Sécurité, élections, titres et démarches, préfectures.", names: ["ministere de l interieur", "interieur gouv"] },
  { url: "https://www.education.gouv.fr/", title: "Ministère de l'Éducation nationale", description: "École, collège, lycée : informations pour les parents, élèves et personnels.", names: ["education nationale", "education gouv"] },
  { url: "https://www.parcoursup.gouv.fr/", title: "Parcoursup — Accès à l'enseignement supérieur", description: "Formations, calendrier et dossier de candidature pour l'entrée dans le supérieur.", names: ["parcoursup"] },
  { url: "https://www.info-retraite.fr/", title: "Info Retraite — Le portail commun des régimes de retraite", description: "Relevé de carrière, simulation et demande de retraite en ligne.", names: ["info retraite", "inforetraite"] },
  { url: "https://www.msa.fr/", title: "MSA — Mutualité sociale agricole", description: "La protection sociale du monde agricole.", names: ["msa", "mutualite sociale agricole"] },
  { url: "https://www.douane.gouv.fr/", title: "Douane.gouv.fr — Direction générale des douanes", description: "Voyageurs, professionnels, démarches et formalités douanières.", names: ["douane", "douanes"] },
  { url: "https://www.data.gouv.fr/", title: "data.gouv.fr — Plateforme ouverte des données publiques", description: "Les données publiques françaises en accès libre.", names: ["data gouv", "datagouv"] },
  { url: "https://www.vie-publique.fr/", title: "Vie-publique.fr — Au cœur du débat public", description: "Lois, rapports, discours et fiches pour comprendre les politiques publiques.", names: ["vie publique"] },
  { url: "https://www.cnil.fr/", title: "CNIL — Commission nationale de l'informatique et des libertés", description: "Protection des données personnelles : droits, conseils et plaintes.", names: ["cnil"] },
  { url: "https://www.assemblee-nationale.fr/", title: "Assemblée nationale", description: "Députés, textes de loi, séances et travaux de l'Assemblée.", names: ["assemblee nationale"] },
  { url: "https://www.senat.fr/", title: "Sénat", description: "Sénateurs, textes, travaux et séances du Sénat.", names: ["senat"] },
  { url: "https://www.monespacesante.fr/", title: "Mon espace santé", description: "Le carnet de santé numérique : documents, messagerie et agenda santé.", names: ["mon espace sante"] },
];

const key = (s: string) =>
  fold(s)
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/\/.*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(site officiel|officiel|site|fr|gouv fr|com)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const INDEX = new Map<string, Official>();
for (const o of OFFICIAL) {
  for (const n of [...o.names, new URL(o.url).hostname]) INDEX.set(key(n), o);
}

/** Le site officiel désigné par la recherche ("ants", "ants.gouv.fr", "site caf"...), sinon rien. */
export function officialFor(q: string): Official | null {
  if (/(^|\s)-?[a-z]+:\S/i.test(q)) return null;
  return INDEX.get(key(q)) ?? null;
}

/** Met le site officiel en tête des résultats (en le retirant de plus bas s'il y était déjà). */
export function withOfficial(q: string, hits: SearchHit[]): SearchHit[] {
  const o = officialFor(q);
  if (!o) return hits;
  const host = new URL(o.url).hostname;
  const bare = host.replace(/^www\./, "");
  const isHome = (u: string) => {
    try {
      const x = new URL(u);
      return x.hostname.replace(/^www\./, "") === bare && /^\/?$/.test(x.pathname);
    } catch {
      return false;
    }
  };
  const indexed = hits.find((h) => isHome(h.doc.url));
  const top: SearchHit = indexed
    ? { ...indexed, official: true, clustered: false }
    : {
        doc: {
          id: -1,
          url: o.url,
          host: bare,
          siteName: o.title.split(" — ")[0],
          title: o.title,
          description: o.description,
          text: "",
          headings: [],
          lang: "fr",
          favicon: `https://${host}/favicon.ico`,
          crawledAt: new Date().toISOString(),
          rank: 1,
          inlinks: 0,
        },
        score: 0,
        snippet: [{ text: o.description, hit: false }],
        titleTerms: [],
        official: true,
      };
  return [top, ...hits.filter((h) => h !== indexed)];
}
