/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Confidentialité" };

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="container">
        <div className="page-hero">
          <h1>
            Confidentialité, <em>sans astérisque</em>
          </h1>
          <p>Googlant n&apos;a pas de comptes. Il n&apos;y a donc rien à rattacher à vos recherches.</p>
        </div>
        <div className="prose">
          <h2>Ce que nous ne faisons pas</h2>
          <ul>
            <li>Pas de compte, pas d&apos;identifiant, pas d&apos;historique de recherche conservé.</li>
            <li>Pas de cookie publicitaire ni de traceur tiers, pas d&apos;outil d&apos;analyse d&apos;audience.</li>
            <li>Les liens sortants sont ouverts sans en-tête Referer : les sites visités ne savent pas ce que vous avez cherché.</li>
          </ul>

          <h2>Les trois seuls cookies</h2>
          <p>
            <code>googlant_consent</code> retient votre choix dans le bandeau des cookies (« Tout accepter » ou « Refuser »).{" "}
            <code>googlant_prefs</code> mémorise vos <Link prefetch={false} href="/preferences">préférences</Link> (nombre de résultats, nouvel onglet…).{" "}
            <code>googlant_loc</code> mémorise la ville ou la position que vous avez choisie, seulement si vous avez accepté les cookies. Si vous les
            refusez, la position n&apos;est jamais gardée d&apos;une visite à l&apos;autre. Ces cookies restent sur votre appareil et vous pouvez les
            effacer à tout moment depuis la page Préférences.
          </p>

          <h2>La localisation</h2>
          <p>
            Par défaut, la ville est déduite de l&apos;adresse IP par l&apos;hébergeur (ou, si celui-ci ne la fournit pas, par le service ipwho.is), au niveau de la ville seulement. La position précise
            n&apos;est utilisée que si vous l&apos;activez dans les <Link prefetch={false} href="/preferences">préférences</Link> : elle est arrondie (environ 100 m) puis rapprochée de la
            grande ville la plus proche, et ne sert qu&apos;à localiser les résultats et les annonces.
          </p>

          <h2>Les annonces</h2>
          <p>
            Les résultats sponsorisés sont contextuels : ils dépendent de la requête tapée et de la ville approximative, jamais d&apos;un profil.
            Chaque annonce indique pourquoi elle vous est montrée.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
