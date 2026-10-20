"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import dynamic from "next/dynamic";
import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { Business } from "@/lib/places/business";
import { openStatus, weeklyHours } from "@/lib/places/hours";
import { FastImg } from "../FastImg";
import { GlobeIcon, PinIcon } from "../icons";

const PlacesMap = dynamic(() => import("./PlacesMap"), { ssr: false, loading: () => <div className="places-map places-map-loading" /> });

function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars" style={{ "--r": rating / 5 } as CSSProperties} aria-label={`${rating} sur 5`}>
      ★★★★★
    </span>
  );
}

const PhoneIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2L20 15.5V19a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z" />
  </svg>
);
const RouteIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3.5 20.5 12 12 20.5 3.5 12 12 3.5Z" />
    <path d="M9.5 13.5v-2h4.5M12.5 9.5l2 2-2 2" />
  </svg>
);

export function BusinessPanel({ query, near, initial }: { query: string; near: { lat: number; lon: number } | null; initial?: Business | null }) {
  // fiche déjà trouvée par le serveur : affichée tout de suite, sans requête
  const [biz, setBiz] = useState<Business | null>(initial ?? null);
  const [loading, setLoading] = useState(initial === undefined);

  const lat = near?.lat;
  const lon = near?.lon;

  useEffect(() => {
    if (initial !== undefined) {
      setBiz(initial);
      setLoading(false);
      return;
    }
    setBiz(null);
    setLoading(true);
    const ctrl = new AbortController();
    const params = new URLSearchParams({ q: query });
    if (lat !== undefined && lon !== undefined) {
      params.set("lat", String(lat));
      params.set("lon", String(lon));
    }
    fetch(`/api/places/lookup?${params}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ business: Business | null }>)
      .then((d) => {
        setBiz(d.business);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setLoading(false);
      });
    return () => ctrl.abort();
  }, [query, lat, lon, initial]);

  if (loading)
    return (
      <section className="biz biz-loading" aria-busy="true" aria-label="Chargement de la fiche">
        <div className="biz-media places-map-loading" />
        <div className="biz-body">
          <div className="skeleton-line" style={{ width: "70%", height: 20, marginBottom: 12 }} />
          <div className="skeleton-line" style={{ width: "45%", marginBottom: 20 }} />
          <div className="skeleton-line" style={{ width: "90%", marginBottom: 10 }} />
          <div className="skeleton-line" style={{ width: "60%" }} />
        </div>
      </section>
    );
  if (!biz) return null;
  return (
    <section className="biz" aria-label={`Fiche de ${biz.name}`}>
      <BusinessCard biz={biz} />
    </section>
  );
}

export function BusinessCard({ biz, showMedia = true, onDirections }: { biz: Business; showMedia?: boolean; onDirections?: () => void }) {
  const [showWeek, setShowWeek] = useState(false);
  const [broken, setBroken] = useState<string[]>([]);
  const [viewer, setViewer] = useState<number | null>(null);
  const [extra, setExtra] = useState<string[] | null>(null);

  useEffect(() => {
    if (biz.source !== "osm") return;
    setExtra(null);
    const params = new URLSearchParams({ name: biz.name, lat: String(biz.lat), lon: String(biz.lon) });
    if (biz.city) params.set("city", biz.city);
    if (biz.photo) params.set("photo", biz.photo);
    if (biz.website) params.set("website", biz.website);
    if (biz.wikidata) params.set("wikidata", biz.wikidata);
    if (biz.brand) params.set("brand", biz.brand);
    const ctrl = new AbortController();
    fetch(`/api/places/photos?${params}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ photos: string[] }>)
      .then((r) => setExtra(r.photos))
      .catch(() => {});
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biz.id]);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const status = biz.openNow !== undefined ? { open: biz.openNow, label: biz.openNow ? "Ouvert" : "Fermé" } : now ? openStatus(biz.hours, now) : null;
  const week = biz.weekdayText?.map((t) => {
    const [day, ...rest] = t.split(": ");
    return { day, text: rest.join(": "), today: now ? day.toLowerCase() === now.toLocaleDateString("fr-FR", { weekday: "long" }) : false };
  }) ?? weeklyHours(biz.hours);
  const photos = [...(biz.photos ?? (biz.photo ? [biz.photo] : [])), ...(extra ?? [])].filter((u, i, all) => all.indexOf(u) === i).filter((p) => !broken.includes(p));
  const photo = photos[0] ?? null;
  const drop = (p: string) => setBroken((b) => [...b, p]);

  useEffect(() => {
    if (viewer === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewer(null);
      if (e.key === "ArrowRight") setViewer((v) => (v === null ? v : (v + 1) % photos.length));
      if (e.key === "ArrowLeft") setViewer((v) => (v === null ? v : (v - 1 + photos.length) % photos.length));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [viewer, photos.length]);
  // fiche OpenStreetMap : on l'ouvre dans Googlant Maps (sauf si on y est déjà)
  const inMaps = /^(node|way|relation)[/][0-9]+$/.test(biz.id) && !onDirections ? `/maps?place=${biz.id}` : null;
  const mapLink = inMaps ? { href: inMaps } : { href: biz.url, target: "_blank", rel: "noopener" };
  const directions = `/maps?dir=${biz.lat},${biz.lon}&dname=${encodeURIComponent(biz.name)}`;

  return (
    <>
      {(showMedia || photo) && (
        <div className={`biz-media ${photo ? "has-photo" : ""} ${showMedia ? "" : "photo-only"}`}>
          {photo && (
            <button type="button" className="biz-photo" onClick={() => setViewer(0)}>
              <FastImg src={photo} width={420} alt={biz.name} loading="eager" fetchPriority="high" onFail={() => drop(photo)} />
              <span>{photos.length > 1 ? `Voir les ${photos.length} photos` : "Voir la photo"}</span>
            </button>
          )}
          {showMedia && (
            <a {...mapLink} className="biz-map" aria-label="Voir sur la carte">
              <PlacesMap
                places={[{ id: biz.id, name: biz.name, category: biz.category, lat: biz.lat, lon: biz.lon, distanceM: 0, url: biz.url }]}
                center={biz}
                selected={0}
                onSelect={() => {}}
                showUser={false}
                still
                zoom={16}
              />
            </a>
          )}
        </div>
      )}

      {photos.length > 1 && (
        <div className="biz-photos">
          {photos.slice(1).map((p, i) => (
            <button key={p} type="button" onClick={() => setViewer(i + 1)} aria-label={`Photo ${i + 2}`}>
              <FastImg src={p} width={90} alt="" onFail={() => drop(p)} />
            </button>
          ))}
        </div>
      )}

      {viewer !== null && photos[viewer] && createPortal(
        <div className="biz-viewer" role="dialog" aria-label={`Photos de ${biz.name}`} onClick={() => setViewer(null)}>
          <FastImg key={photos[viewer]} src={photos[viewer]} width={960} alt={biz.name} loading="eager" onClick={(e) => e.stopPropagation()} />
          <button type="button" className="biz-viewer-close" aria-label="Fermer" onClick={() => setViewer(null)}>×</button>
          {photos.length > 1 && (
            <>
              <button type="button" className="biz-viewer-nav prev" aria-label="Précédente" onClick={(e) => { e.stopPropagation(); setViewer((viewer - 1 + photos.length) % photos.length); }}>‹</button>
              <button type="button" className="biz-viewer-nav next" aria-label="Suivante" onClick={(e) => { e.stopPropagation(); setViewer((viewer + 1) % photos.length); }}>›</button>
              <span className="biz-viewer-count">{viewer + 1} / {photos.length}</span>
            </>
          )}
        </div>,
        document.body,
      )}

      <div className="biz-body">
        <h2 className="biz-name">{biz.name}</h2>
        {biz.rating !== undefined && (
          <div className="biz-rating">
            <b>{biz.rating.toLocaleString("fr-FR", { minimumFractionDigits: 1 })}</b>
            <Stars rating={biz.rating} />
            {biz.ratings !== undefined && (
              <a href={biz.url} target="_blank" rel="noopener">
                {biz.ratings.toLocaleString("fr-FR")} avis
              </a>
            )}
          </div>
        )}
        <div className="biz-category">
          {biz.category}
          {biz.city ? ` à ${biz.city}` : ""}
        </div>

        <div className="biz-actions">
          {biz.website && (
            <a href={biz.website} target="_blank" rel="noopener" className="biz-action">
              <GlobeIcon width={15} height={15} /> Site Web
            </a>
          )}
          {onDirections ? (
            <button type="button" onClick={onDirections} className="biz-action">
              <RouteIcon /> Itinéraire
            </button>
          ) : (
            <a href={directions} className="biz-action">
              <RouteIcon /> Itinéraire
            </a>
          )}
          {biz.phone && (
            <a href={`tel:${biz.phone.replace(/\s/g, "")}`} className="biz-action">
              <PhoneIcon /> Appeler
            </a>
          )}
        </div>

        <dl className="biz-facts">
          {biz.address && (
            <div>
              <dt>Adresse :</dt>
              <dd>
                <a {...mapLink}>
                  {biz.address}
                </a>
              </dd>
            </div>
          )}
          {biz.phone && (
            <div>
              <dt>Téléphone :</dt>
              <dd>
                <a href={`tel:${biz.phone.replace(/\s/g, "")}`}>{biz.phone}</a>
              </dd>
            </div>
          )}
          {(status || week) && (
            <div>
              <dt>Horaires :</dt>
              <dd>
                <button type="button" className="biz-hours-toggle" onClick={() => setShowWeek((v) => !v)} aria-expanded={showWeek} disabled={!week}>
                  {status ? (
                    <>
                      <span className={status.open ? "is-open" : "is-closed"}>{status.label.split(" · ")[0]}</span>
                      {status.label.includes(" · ") && <span> · {status.label.split(" · ").slice(1).join(" · ").replace(/^./, (c) => c.toUpperCase())}</span>}
                    </>
                  ) : (
                    <span>Voir les horaires</span>
                  )}
                  {week && <span className="biz-caret" data-open={showWeek ? "1" : undefined} aria-hidden />}
                </button>
                {showWeek && week && (
                  <table className="biz-week">
                    <tbody>
                      {week.map((w) => (
                        <tr key={w.day} data-today={w.today ? "1" : undefined}>
                          <th>{w.day}</th>
                          <td>{w.text}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </dd>
            </div>
          )}
        </dl>

        {biz.editUrl && (
          <p className="biz-suggest">
            <a href={biz.editUrl} target="_blank" rel="noopener">
              Suggérer une modification
            </a>
            {biz.source === "osm" && <span> · données OpenStreetMap, modifiables par tous</span>}
          </p>
        )}

        {biz.reviews && biz.reviews.length > 0 && (
          <div className="biz-reviews">
            <h3>Avis</h3>
            {biz.reviews.map((r, i) => (
              <figure key={i} className="biz-review">
                <figcaption>
                  <b>{r.author}</b>
                  <Stars rating={r.rating} />
                  <span className="muted">{r.when}</span>
                </figcaption>
                <blockquote>{r.text.length > 220 ? r.text.slice(0, 220) + "…" : r.text}</blockquote>
              </figure>
            ))}
            <a href={biz.url} target="_blank" rel="noopener" className="biz-more">
              Tous les avis sur Google Maps
            </a>
          </div>
        )}

        <p className="biz-source">
          <PinIcon /> {biz.source === "google" ? "Données Google" : "© contributeurs OpenStreetMap"}
        </p>
      </div>
    </>
  );
}
