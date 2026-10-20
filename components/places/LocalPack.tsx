"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { UserLocation } from "@/lib/geo/types";
import { formatHours, openStatus } from "@/lib/places/hours";
import type { Place, PlacesResponse } from "@/lib/places/types";
import { ArrowRightIcon, PinIcon } from "../icons";
import { LocationControls } from "../LocationControls";

const PlacesMap = dynamic(() => import("./PlacesMap"), { ssr: false, loading: () => <div className="places-map places-map-loading" /> });

interface Props {
  query: string;
  title: string;
  center: { lat: number; lon: number; label: string; precise: boolean } | null;
  loc: UserLocation | null;
  moreHref?: string;
}

function distance(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}

function Stars({ rating, count }: { rating: number; count?: number }) {
  return (
    <span className="place-rating">
      <b>{rating.toLocaleString("fr-FR", { minimumFractionDigits: 1 })}</b>
      <span className="stars" style={{ "--r": rating / 5 } as CSSProperties} aria-hidden>
        ★★★★★
      </span>
      {count !== undefined && <span className="muted">({count.toLocaleString("fr-FR")})</span>}
    </span>
  );
}

function PlaceRow({ place, index, active, onHover, now }: { place: Place; index: number; active: boolean; onHover: (i: number) => void; now: Date | null }) {
  const status = place.openNow !== undefined ? { open: place.openNow, label: place.openNow ? "Ouvert" : "Fermé" } : now ? openStatus(place.hours, now) : null;
  return (
    <li className="place" data-active={active ? "1" : undefined} onMouseEnter={() => onHover(index)} onFocus={() => onHover(index)}>
      <span className="place-num">{index + 1}</span>
      <div className="place-body">
        <a href={place.url} target="_blank" rel="noopener" className="place-name">
          {place.name}
        </a>
        <div className="place-meta">
          {place.rating !== undefined && <Stars rating={place.rating} count={place.ratings} />}
          <span>{place.category}</span>
          <span className="muted">· {distance(place.distanceM)}</span>
        </div>
        {place.address && <div className="place-address">{place.address}</div>}
        {status ? (
          <div className={`place-status ${status.open ? "is-open" : "is-closed"}`}>{status.label}</div>
        ) : (
          place.hours && <div className="place-address muted">{formatHours(place.hours)}</div>
        )}
      </div>
      <div className="place-actions">
        {place.website && (
          <a href={place.website} target="_blank" rel="noopener" className="place-action">
            Site web
          </a>
        )}
        {place.phone && (
          <a href={`tel:${place.phone.replace(/\s/g, "")}`} className="place-action">
            Appeler
          </a>
        )}
        <a href={`/maps?dir=${place.lat},${place.lon}&dname=${encodeURIComponent(place.name)}`} className="place-action">
          Itinéraire
        </a>
      </div>
    </li>
  );
}

export function LocalPack({ query, title, center, loc, moreHref }: Props) {
  const [data, setData] = useState<PlacesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const lat = center?.lat;
  const lon = center?.lon;
  const precise = center?.precise;

  useEffect(() => {
    setNow(new Date());
    if (lat === undefined || lon === undefined) return;
    const ctrl = new AbortController();
    setLoading(true);
    setSelected(null);
    const r = precise ? 1200 : 2500;
    fetch(`/api/places?q=${encodeURIComponent(query)}&lat=${lat}&lon=${lon}&r=${r}`, { signal: ctrl.signal })
      .then((res) => res.json() as Promise<PlacesResponse>)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [query, lat, lon, precise]);

  const select = (i: number) => {
    setSelected(i);
    listRef.current?.children[i]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const places = data?.places ?? [];
  const shown = places.slice(0, 3);

  return (
    <section className="local" aria-label={title}>
      <div className="local-head">
        <div>
          <h2>{title}</h2>
          <p>
            <PinIcon /> {center ? `Autour de ${center.label}` : "Position inconnue"}
          </p>
        </div>
        {data && <span className="local-source">{data.source === "google" ? "Google" : "OpenStreetMap"}</span>}
      </div>

      {!center && (
        <div className="local-empty">
          <p>Indiquez votre position pour voir les commerces les plus proches.</p>
          <LocationControls loc={loc} compact />
        </div>
      )}

      {center && (
        <div className="local-grid">
          <div className="local-map">
            <PlacesMap places={shown} center={center} selected={selected} onSelect={select} showUser={!!loc && !!center.precise} />
          </div>
          <div className="local-list-wrap">
            {loading && !data && (
              <div className="local-skeleton">
                {[0, 1, 2].map((i) => (
                  <div key={i}>
                    <div className="skeleton-line" style={{ width: "55%", height: 14, marginBottom: 8 }} />
                    <div className="skeleton-line" style={{ width: "80%", height: 10 }} />
                  </div>
                ))}
              </div>
            )}
            {data?.error && <p className="local-error">{data.error}</p>}
            {data && !data.error && !places.length && <p className="local-error">Aucun établissement trouvé dans ce secteur.</p>}
            {shown.length > 0 && (
              <ol className="places" ref={listRef} data-loading={loading ? "1" : undefined}>
                {shown.map((p, i) => (
                  <PlaceRow key={p.id} place={p} index={i} active={i === selected} onHover={setSelected} now={now} />
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      <div className="local-foot">
        <span className="muted">{data?.attribution ?? "© contributeurs OpenStreetMap"}</span>
        {moreHref && places.length > 3 && (
          <Link prefetch={false} href={moreHref} className="local-more">
            Ouvrir dans Googlant Maps <ArrowRightIcon />
          </Link>
        )}
      </div>
    </section>
  );
}
