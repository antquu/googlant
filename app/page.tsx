/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Link from "next/link";
import { Suspense } from "react";
import { campaignsByProximity } from "@/lib/ads/select";
import { getPrefs, getUserLocation } from "@/lib/context";
import { cleanTitle } from "@/lib/db/write";
import { dekOf } from "@/lib/home";
import { getHome } from "@/lib/home-data";
import { Featured } from "@/components/home/Featured";
import { HeroBook } from "@/components/home/HeroBook";
import { LatestCards } from "@/components/home/LatestCards";
import { LiveLine } from "@/components/home/LiveLine";
import { Shelf } from "@/components/home/Shelf";
import { SubmitSite } from "@/components/home/SubmitSite";
import { Logo } from "@/components/Logo";
import { SearchComposer } from "@/components/SearchComposer";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

const HINTS = ["Tramway de Lyon", "Comment fonctionne PageRank ?", "Hooks React", "Horaires bus Grenoble", "Robot d'indexation", "Next.js App Router"];

export default async function Home() {
  const [loc, prefs] = await Promise.all([getUserLocation(), getPrefs()]);

  const campaigns = campaignsByProximity(loc).map(({ campaign: c, km }) => ({
    id: c.id,
    url: c.url,
    cityName: c.cityName,
    network: c.network,
    displayUrl: c.displayUrl,
    km,
    lines: c.lines,
    cover: c.cover,
  }));

  const trending = [loc ? `Transports ${loc.city.replace(/^près de /, "")}` : "Horaires tram Grenoble", "Tramway de Lyon", "PageRank", "React", "Index inversé", "Node.js", "Clermont-Ferrand", "TypeScript"];

  return (
    <>
      <SiteHeader transparent logoHidden />
      <main>
        <section className="container hero">
          <div className="hero-copy">
            <Logo size="xl" href={null} withVersion />
            <p className="hero-tagline">Un moteur de recherche indépendant, avec son propre crawler et son propre index. Sans compte, sans pistage.</p>
            <div className="hero-composer hero-search">
              <SearchComposer hints={HINTS} autoFocus suggestions={prefs.suggestions} />
            </div>
            <div className="trending-row hero-composer">
              <span className="trending-label">Tendances</span>
              {trending.map((t) => (
                <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="chip">
                  {t}
                </Link>
              ))}
            </div>
          </div>
          <HeroBook campaigns={campaigns} />
        </section>

        {/* le haut de page s'affiche tout de suite ; les sections tirées de l'index arrivent ensuite */}
        <Suspense fallback={<div className="container" style={{ minHeight: 480 }} />}>
          <HomeSections />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <HomeFooter />
      </Suspense>
    </>
  );
}

async function HomeSections() {
  const selections = await getHome();
  const stats = selections?.stats ?? null;
  const live = selections?.live ?? [];
  const hasPages = !!stats && stats.docs > 0;
  return (
    <div className="container">
      {stats && hasPages && <LiveLine initial={{ items: live, stats }} />}

      {selections === null && (
        <div className="empty">
          <h2>L&apos;index est momentanément injoignable</h2>
          <p>Le serveur d&apos;index ne répond pas pour le moment. Réessayez dans un instant.</p>
        </div>
      )}

      {selections && !hasPages && (
        <div className="empty">
          <h2>L&apos;index est vide</h2>
          <p>Démarrez le crawler permanent : les pages apparaîtront ici au fur et à mesure.</p>
          <p>
            <code>npm run crawler</code>
          </p>
        </div>
      )}

      {selections && selections.featured.length > 0 && (
        <section className="section" aria-labelledby="featured-title">
          <div className="section-heading">
            <div>
              <h2 id="featured-title">À la une</h2>
              <p>Une sélection des pages les plus importantes de l&apos;index.</p>
            </div>
          </div>
          <Featured
            docs={selections.featured.map((d) => ({ id: d.id, url: d.url, host: d.host, siteName: d.siteName, title: cleanTitle(d.title), description: dekOf(d), inlinks: d.inlinks }))}
          />
        </section>
      )}

      {selections && selections.shelf.length > 0 && (
        <section className="section">
          <Shelf docs={selections.shelf.map((d) => ({ id: d.id, url: d.url, host: d.host, siteName: d.siteName, title: cleanTitle(d.title), inlinks: d.inlinks }))} />
        </section>
      )}

      {selections && selections.latest.length > 0 && (
        <section className="section">
          <div className="section-heading">
            <div>
              <h2>Fraîchement indexé</h2>
              <p>Les dernières pages visitées par GooglantBot.</p>
            </div>
          </div>
          <LatestCards docs={selections.latest} />
        </section>
      )}

      {/* 1 000 000 de pages : le crawler est arrêté, on ne propose plus d'ajouter de site */}
      {(!stats || stats.docs < 1_000_000) && <SubmitSite />}
    </div>
  );
}

async function HomeFooter() {
  const selections = await getHome();
  return <SiteFooter stats={selections?.stats ?? null} />;
}
