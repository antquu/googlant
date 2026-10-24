/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, Suspense } from "react";
import Loading from "./loading";
import { redirect } from "next/navigation";
import { campaignsByProximity, selectAds } from "@/lib/ads/select";
import { getPrefs, getUserLocation } from "@/lib/context";
import { plural } from "@/lib/format";
import { index } from "@/lib/index-api";
import { parseQuery } from "@/lib/search/engine";
import { cleanTitle } from "@/lib/db/write";
import type { SearchHit } from "@/lib/search/types";
import { imageSearch, newsSearch, webEnabled, webSearch } from "@/lib/web/brave";
import { fold } from "@/lib/search/tokenizer";
import { detectLocal } from "@/lib/places/intent";
import { SearchIcon } from "@/components/icons";
import { BusinessPanel } from "@/components/places/BusinessPanel";
import { findBusiness } from "@/lib/places/lookup";
import { LocalPack } from "@/components/places/LocalPack";
import { AdItem } from "@/components/serp/AdItem";
import { KnowledgePanel, SideAd } from "@/components/serp/Aside";
import { ImageGrid } from "@/components/serp/ImageGrid";
import { ImagePack } from "@/components/serp/ImagePack";
import { LeaveCard } from "@/components/serp/LeaveCard";
import { WhyPanel } from "@/components/serp/WhyPanel";
import { AiOverview, Questions } from "@/components/serp/AiOverview";
import { indexQuestions } from "@/lib/search/questions";
import { AnswerBox } from "@/components/serp/AnswerBox";
import { findAnswer } from "@/lib/search/answer";
import { officialFor, withOfficial } from "@/lib/search/official";
import { streamOverview, toSources, wantsOverview } from "@/lib/ai/overview";
import { rivalFor } from "@/lib/search/rivals";
import { Pager } from "@/components/serp/Pager";
import { ResultItem } from "@/components/serp/ResultItem";
import { SiteFooter } from "@/components/SiteFooter";

type SP = Promise<{ q?: string; page?: string; tab?: string; exact?: string }>;

const TABS = ["all", "images", "news"];

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `${q}` : "Recherche", robots: { index: false } };
}

// une nouvelle recherche affiche tout de suite le squelette, au lieu de laisser les anciens résultats figés
export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  if (!(sp.q ?? "").trim()) redirect("/");
  return (
    <Suspense key={`${sp.q}|${sp.tab ?? ""}|${sp.page ?? ""}|${sp.exact ?? ""}`} fallback={<Loading />}>
      <Results sp={sp} />
    </Suspense>
  );
}

async function Results({ sp }: { sp: Awaited<SP> }) {
  const q = (sp.q ?? "").trim().slice(0, 256);
  if (sp.tab === "maps") redirect(`/maps?q=${encodeURIComponent(q)}`);
  const tab = sp.tab && TABS.includes(sp.tab) ? sp.tab : "all";
  const page = Math.max(1, Math.min(50, Number(sp.page) || 1));

  const [loc, prefs] = await Promise.all([getUserLocation(), getPrefs()]);

  const tabHref = (id: string) => `/search?q=${encodeURIComponent(q)}${id === "all" ? "" : `&tab=${id}`}`;
  const pageHref = (p: number) => `${tabHref(tab)}${p > 1 ? `&page=${p}` : ""}`;

  const local = detectLocal(q);
  const center = local.city
    ? { lat: local.city.lat, lon: local.city.lon, label: local.city.name, precise: false }
    : loc
      ? { lat: loc.lat, lon: loc.lon, label: loc.city, precise: loc.source === "gps" }
      : null;
  const showBusiness = tab === "all" && page === 1 && !!local.category && local.rest.length > 0;
  const showPack = tab === "all" && page === 1 && !!local.category && !showBusiness;
  const packTitle = local.category ? local.category.label : "Googlant Maps";

  const wantPack = tab === "all" && page === 1 && !/(^|\s)-?[a-z]+:\S/i.test(q);
  // fiche établissement préparée en même temps que les résultats (au plus 2 s, sinon le navigateur la cherche)
  const bizEarly = showBusiness
    ? Promise.race([findBusiness(q, center).catch(() => null), new Promise<undefined>((ok) => setTimeout(() => ok(undefined), 2000))])
    : Promise.resolve(undefined);
  const [res, packRaw, bizInitial] = await Promise.all([
    tab === "images"
      ? null
      : tab === "news"
        ? index("news", q, { perPage: prefs.perPage, city: loc?.city })
        : index("search", q, { page, perPage: prefs.perPage, city: loc?.city, autoCorrect: sp.exact !== "1" }),
    wantPack ? index("images", q, 12) : null,
    bizEarly,
  ]);
  const packImages = (packRaw ?? []).slice(0, 10).map((i) => ({ src: i.src, alt: i.alt, pageUrl: i.page.url, host: i.page.host }));
  const ownImages = tab === "images" ? ((await index("images", q)) ?? []) : [];
  const indexDown = tab !== "images" && !res;

  const web = webEnabled();
  const [webAll, webNews, webImages] = await Promise.all([
    web && tab === "all" ? webSearch(q, page) : null,
    web && tab === "news" ? newsSearch(q) : null,
    web && tab === "images" ? imageSearch(q) : null,
  ]);
  const images = webImages?.length
    ? webImages
    : ownImages.map((i) => ({ src: i.src, alt: i.alt, pageUrl: i.page.url, pageTitle: i.page.title, host: i.page.host, favicon: i.page.favicon }));

  let hits: SearchHit[] = res?.hits ?? [];
  if (webNews?.length) hits = webNews;
  if (webAll?.hits.length && res) {
    const seen = new Set<string>();
    const key = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    const own = page === 1 ? res.hits.filter((h, i) => i < 4 && !h.clustered && h.titleTerms.length >= Math.max(1, res.hits[0].titleTerms.length)).slice(0, 2) : [];
    hits = [...own, ...webAll.hits].filter((h) => {
      const k = key(h.doc.url);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  // "ants", "caf", "impots" : le site officiel du service public en premier
  if (tab === "all" && page === 1) hits = withOfficial(q, hits);
  const pages = webAll ? Math.min(10, webAll.more ? page + 1 : page) : res ? Math.min(50, Math.ceil(res.total / res.perPage)) : 0;
  const ads = wantPack ? selectAds(q, loc) : [];
  // "google", "bing"... : on propose d'y aller directement (sous les annonces, au-dessus des résultats)
  const rival = tab === "all" && page === 1 ? rivalFor(q) : null;

  // aperçu IA (Gemini) : seulement pour les vraies recherches de la première page
  // lancé tout de suite avec les résultats déjà en main : le texte arrive dans la page au fil de l'eau
  const ai = tab === "all" && page === 1 && !rival && !showBusiness && !showPack && res && wantsOverview(q, res.hits)
    ? { sources: toSources(res.hits), first: streamOverview(q, res.hits) }
    : null;

  // "Autres questions" tirées de l'index : seules si pas d'aperçu IA, sinon en secours de celui-ci
  const faq = tab === "all" && page === 1 && !rival && !showBusiness && res && !webAll ? indexQuestions(q, res.hits) : [];

  // question ("pourquoi mon enfant ne dort pas") : passage de la meilleure page en tête, comme l'extrait optimisé de Google
  const answer = tab === "all" && page === 1 && !rival && !showBusiness && res && !webAll ? findAnswer(q, res.hits) : null;

  const parsed = parseQuery(q);
  const top = res?.hits[0];
  const showPanel =
    tab === "all" && !officialFor(q) &&
    page === 1 &&
    top &&
    !res?.autoCorrected &&
    (fold(cleanTitle(top.doc.title)) === fold(parsed.text) || (parsed.terms.length > 0 && top.titleTerms.length === parsed.terms.length && (top.doc.description || top.doc.text).length > 40));
  const siblings = showPanel && top ? ((await index("siblings", top.doc)) ?? []) : [];
  const shown = new Set(ads.map((a) => a.campaign.id));
  const other = tab === "all" ? campaignsByProximity(loc).find((c) => !shown.has(c.campaign.id)) : undefined;
  const sideAd = ads[1] ?? (other ? { campaign: other.campaign, distanceKm: other.km, reason: "" } : null);

  return (
    <>
      <main>
        {indexDown && (
          <div className="container">
            <div className="empty">
              <h2>L&apos;index est injoignable</h2>
              <p>
                Le serveur d&apos;index ne répond pas pour le moment. Réessayez dans un instant.
              </p>
            </div>
          </div>
        )}

        {tab === "images" && (
          <div className="container">
            {images.length ? (
              <ImageGrid images={images} />
            ) : (
              <NoResults q={q} />
            )}
          </div>
        )}

        {res && (
          <div className="container serp" key={`${q}-${tab}-${page}`}>
            <div>
              <p className="serp-stats">
                <span>
                  {webAll || webNews ? "Résultats du web entier" : res.total ? `Environ ${plural(res.total, "résultat")}` : "Aucun résultat"} ({(res.tookMs / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 3 })} s)
                </span>
                {loc && (
                  <>
                    <span className="sep">·</span>
                    <span>{loc.city}</span>
                  </>
                )}
                {page > 1 && (
                  <>
                    <span className="sep">·</span>
                    <span>Page {page}</span>
                  </>
                )}
              </p>

              {res.correctedQuery && (
                <p className="spell">
                  {res.autoCorrected ? (
                    <>
                      Résultats pour <Link prefetch={false} href={`/search?q=${encodeURIComponent(res.correctedQuery)}`}>{res.correctedQuery}</Link>
                      <small>
                        Rechercher plutôt{" "}
                        <Link prefetch={false} href={`${tabHref(tab)}&exact=1`} style={{ fontStyle: "normal", fontWeight: 500 }}>
                          {q}
                        </Link>{" "}
                        — aucun document ne contient exactement ces mots.
                      </small>
                    </>
                  ) : (
                    <>
                      Essayez avec cette orthographe : <Link prefetch={false} href={`/search?q=${encodeURIComponent(res.correctedQuery)}`}>{res.correctedQuery}</Link>
                    </>
                  )}
                </p>
              )}

              {ads.length > 0 && (
                <section className="ads" aria-label="Résultats sponsorisés">
                  {ads.map((slot, i) => (
                    <AdItem key={slot.campaign.id} slot={slot} index={i} />
                  ))}
                </section>
              )}

              {rival && <LeaveCard key={q} rival={rival} />}

              {ai ? <AiOverview key={`ai-${q}`} q={q} {...ai} fallback={faq} /> : faq.length > 0 && <Questions items={faq} />}

              {answer && <AnswerBox answer={answer} newTab={prefs.newTab} />}

              {showPack && <LocalPack query={q} title={packTitle} center={center} loc={loc}moreHref={`/maps?q=${encodeURIComponent(q)}`} />}

              {hits.map((hit, i) => (
                <Fragment key={hit.doc.url}>
                  <ResultItem hit={hit} index={i} query={q} newTab={prefs.newTab} />
                  {i === Math.min(2, hits.length - 1) && packImages.length >= 4 && <ImagePack images={packImages} moreHref={tabHref("images")} newTab={prefs.newTab} />}
                </Fragment>
              ))}

              {!hits.length && !showPack && <NoResults q={q} />}

              {/* pages "Gooooooglant" en bas ; « Charger plus » reste pour les images */}
              {tab === "all" && hits.length > 0 && <Pager page={page} pages={pages} href={pageHref} />}

              {res.related.length > 0 && page === 1 && tab === "all" && (
                <section className="related">
                  <h2>Recherches associées</h2>
                  <div className="related-grid">
                    {res.related.map((r) => (
                      <Link prefetch={false} key={r} href={`/search?q=${encodeURIComponent(r)}`}>
                        <SearchIcon />
                        <span>{r}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <aside className="serp-aside">
              <WhyPanel query={q} />
              {showBusiness && <BusinessPanel query={q} near={center} initial={bizInitial} />}
              {showPanel && !showBusiness && top && <KnowledgePanel doc={top.doc} siblings={siblings} />}
              {sideAd && <SideAd slot={sideAd} />}
            </aside>
          </div>
        )}
      </main>
      <Suspense fallback={null}>
        <SiteFooter />
      </Suspense>
    </>
  );
}

function NoResults({ q }: { q: string }) {
  return (
    <div className="empty">
      <h2>Aucun document ne correspond à « {q} »</h2>
      <ul>
        <li>Vérifiez l&apos;orthographe des termes de recherche.</li>
        <li>Essayez d&apos;autres mots-clés, ou des mots plus généraux.</li>
        <li>
          L&apos;index de Googlant est construit par son propre crawler, il s&apos;enrichit à chaque passage du crawler.
        </li>
      </ul>
    </div>
  );
}
