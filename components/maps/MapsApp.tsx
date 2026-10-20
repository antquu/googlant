"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { GeocodeResult } from "@/app/api/places/geocode/route";
import { nearestCity } from "@/lib/geo/cities";
import type { Business } from "@/lib/places/business";
import { openStatus } from "@/lib/places/hours";
import { detectLocal } from "@/lib/places/intent";
import type { Place, PlacesResponse } from "@/lib/places/types";
import { saveLocation } from "@/lib/prefs";
import type { PlaceIcon } from "@/lib/places/icons";
import type { PoiHit } from "@/lib/places/poi-index";
import { BusinessCard } from "../places/BusinessPanel";
import { PlaceGlyph } from "../places/PlaceGlyph";
import { Compass, Route } from "lucide-react";
import { ArrowUpIcon, ChevronLeftIcon, CloseIcon, SearchIcon } from "../icons";
import { Directions, type Spot } from "./Directions";
import { SearchSuggest, type MapSuggestion } from "./SearchSuggest";
import type { MapHandle, RouteSegment } from "./MapCanvas";

const MapCanvas = dynamic(() => import("./MapCanvas"), { ssr: false, loading: () => <div className="maps-canvas maps-canvas-loading" /> });

const CHIPS: { label: string; q: string; icon: PlaceIcon }[] = [
  { label: "Restaurants", q: "restaurant", icon: "Utensils" },
  { label: "Cafés", q: "café", icon: "Coffee" },
  { label: "Boulangeries", q: "boulangerie", icon: "Croissant" },
  { label: "Supermarchés", q: "supermarché", icon: "ShoppingCart" },
  { label: "Pharmacies", q: "pharmacie", icon: "Pill" },
  { label: "Hôtels", q: "hôtel", icon: "BedDouble" },
  { label: "Bars", q: "bar", icon: "Wine" },
  { label: "Musées", q: "musée", icon: "Landmark" },
  { label: "Stations-service", q: "station essence", icon: "Fuel" },
  { label: "Distributeurs", q: "distributeur", icon: "Banknote" },
];

type Mode = "home" | "loading" | "list" | "detail" | "place" | "empty";

// exemples qui défilent dans la barre, comme sur l'accueil
const MAP_HINTS = ["Boulangerie près d'ici", "Musée de Grenoble", "Pharmacie de garde", "Place Grenette", "Pizzeria", "Gare de Lyon Part-Dieu"];

interface Props {
  initialQuery: string;
  initialDir?: Spot | null;
  initialPlace?: Business | null;
  approx?: { lat: number; lon: number } | null;
  start: { lat: number; lon: number; label: string; zoom: number };
  user: { lat: number; lon: number } | null;
}

// lieu de notre index OpenStreetMap -> fiche affichable tout de suite (sans nouvelle requête)
function poiToBusiness(p: { osm: string; name: string; kind: string; street?: string | null; city?: string | null; lat: number; lon: number; phone?: string | null; website?: string | null; hours?: string | null; wikidata?: string | null; brand?: string | null; image?: string | null }): Business {
  const img = p.image?.startsWith("https://") ? p.image : p.image ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p.image.replace(/^File:/i, ""))}?width=640` : undefined;
  return {
    id: p.osm, name: p.name, category: p.kind, city: p.city ?? undefined, lat: p.lat, lon: p.lon,
    address: [p.street, p.city].filter(Boolean).join(", ") || undefined, phone: p.phone ?? undefined, website: p.website ?? undefined, hours: p.hours ?? undefined,
    photo: img, wikidata: p.wikidata ?? undefined, brand: p.brand ?? undefined,
    url: `https://www.openstreetmap.org/${p.osm}`, editUrl: `https://www.openstreetmap.org/edit?${p.osm.replace("/", "=")}`, source: "osm",
  };
}

function placeToBusiness(p: Place): Business {
  const [type, id] = p.id.split("/");
  const osm = p.url.includes("openstreetmap.org");
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    city: p.address?.match(/\d{5} (.+)$/)?.[1],
    lat: p.lat,
    lon: p.lon,
    address: p.address,
    phone: p.phone,
    website: p.website,
    photo: p.photo,
    wikidata: p.wikidata,
    brand: p.brand,
    hours: p.hours,
    openNow: p.openNow,
    rating: p.rating,
    ratings: p.ratings,
    url: p.url,
    editUrl: osm ? `https://www.openstreetmap.org/edit?${type}=${id}` : p.url,
    source: osm ? "osm" : "google",
  };
}

function distance(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}

export function MapsApp({ initialQuery, initialDir = null, initialPlace = null, approx = null, start, user: initialUser }: Props) {
  const handle = useRef<MapHandle | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [query, setQuery] = useState(initialPlace?.name ?? initialQuery);
  const [mode, setMode] = useState<Mode>(initialPlace ? "detail" : initialQuery ? "loading" : "home");
  const [results, setResults] = useState<Place[]>([]);
  const [resultTitle, setResultTitle] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<Business | null>(initialPlace);
  const [geo, setGeo] = useState<GeocodeResult | null>(null);
  const [areaLabel, setAreaLabel] = useState(start.label);
  const [dirty, setDirty] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dirOpen, setDirOpen] = useState(!!initialDir);
  const [dirDest, setDirDest] = useState<Spot | null>(initialDir);
  const [route, setRoute] = useState<RouteSegment[] | null>(null);
  const [routeEnds, setRouteEnds] = useState<{ origin: Spot | null; dest: Spot | null }>({ origin: null, dest: null });
  const [user, setUser] = useState(initialUser);
  const [now, setNow] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sugOpen, setSugOpen] = useState(false);
  const lastCategory = useRef<string | null>(null);
  const runId = useRef(0);

  useEffect(() => setNow(new Date()), []);

  useEffect(() => {
    const apply = () => {
      const mobile = window.innerWidth < 760;
      handle.current?.setPadding(mobile ? { left: 0, top: 110, bottom: collapsed ? 80 : Math.round(window.innerHeight * 0.46) } : { left: collapsed ? 0 : 432, top: 60, bottom: 0 });
    };
    const t = setTimeout(apply, 300);
    window.addEventListener("resize", apply);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", apply);
    };
  }, [collapsed]);

  const setUrl = (q: string) => {
    const url = q ? `/maps?q=${encodeURIComponent(q)}` : "/maps";
    window.history.replaceState(null, "", url);
  };

  // fiche ouverte : son identifiant dans l'adresse, pour la retrouver en rechargeant ou en partageant le lien
  useEffect(() => {
    if (mode === "detail" && detail && /^(node|way|relation)[/][0-9]+$/.test(detail.id)) window.history.replaceState(null, "", `/maps?place=${detail.id}`);
    else if (mode !== "detail" && window.location.search.includes("place=")) setUrl(query.trim());
  }, [mode, detail]);

  const searchCategory = useCallback(async (q: string, center: { lat: number; lon: number }, label: string) => {
    const id = ++runId.current;
    setMode("loading");
    setDetail(null);
    setGeo(null);
    setSelected(null);
    setError(null);
    const res = await fetch(`/api/places?q=${encodeURIComponent(q)}&lat=${center.lat}&lon=${center.lon}&r=1800`).then((r) => r.json() as Promise<PlacesResponse>).catch(() => null);
    if (id !== runId.current) return;
    const intent = detectLocal(q);
    lastCategory.current = q;
    setDirty(false);
    if (!res || res.error) {
      setError(res?.error ?? "Le service cartographique ne répond pas.");
      setResults([]);
      setMode("empty");
      return;
    }
    setResults(res.places);
    setResultTitle(intent.category?.label ?? q);
    setAreaLabel(label);
    setMode(res.places.length ? "list" : "empty");
    if (res.places.length) handle.current?.fitPlaces(res.places.slice(0, 12));
  }, []);

  const run = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      setUrl(q);
      if (!q) {
        setMode("home");
        setResults([]);
        setDetail(null);
        setGeo(null);
        return;
      }
      const intent = detectLocal(q);
      const mapCenter = handle.current?.center() ?? start;

      if (intent.category && !intent.rest) {
        const center = intent.city ? { lat: intent.city.lat, lon: intent.city.lon } : mapCenter;
        if (intent.city) handle.current?.flyTo(center.lat, center.lon, 14);
        await searchCategory(q, center, intent.city?.name ?? areaLabel);
        return;
      }

      const id = ++runId.current;
      setMode("loading");
      setError(null);
      setResults([]);
      setSelected(null);
      lastCategory.current = null;
      setDirty(false);

      if (intent.category) {
        const params = new URLSearchParams({ q, lat: String(mapCenter.lat), lon: String(mapCenter.lon) });
        const r = await fetch(`/api/places/lookup?${params}`).then((x) => x.json() as Promise<{ business: Business | null }>).catch(() => null);
        if (id !== runId.current) return;
        if (r?.business) {
          setDetail(r.business);
          setGeo(null);
          setMode("detail");
          handle.current?.flyTo(r.business.lat, r.business.lon, 17);
          return;
        }
      }

      const g = await fetch(`/api/places/geocode?q=${encodeURIComponent(q)}`).then((x) => x.json() as Promise<{ place: GeocodeResult | null }>).catch(() => null);
      if (id !== runId.current) return;
      if (g?.place) {
        setGeo(g.place);
        setDetail(null);
        setAreaLabel(g.place.name);
        setMode("place");
        handle.current?.fitBbox(g.place.bbox);
      } else {
        setMode("empty");
      }
    },
    [areaLabel, searchCategory, start],
  );

  useEffect(() => {
    if (initialUser || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = +pos.coords.latitude.toFixed(4);
        const lon = +pos.coords.longitude.toFixed(4);
        const { city, km } = nearestCity({ lat, lon });
        const label = km < 25 ? city.name : `près de ${city.name}`;
        setUser({ lat, lon });
        setAreaLabel(label);
        saveLocation({ city: label, region: city.region, lat, lon, source: "gps" });
        if (!initialQuery && !initialDir) handle.current?.flyTo(lat, lon, 15);
      },
      () => {},
      { timeout: 10_000, maximumAge: 300_000 },
    );
  }, []);

  useEffect(() => {
    if (!initialQuery || initialDir || initialPlace) return;
    const t = setTimeout(() => run(initialQuery), 450);
    return () => clearTimeout(t);
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(query);
  };

  const pickChip = (q: string) => {
    setQuery(q);
    setUrl(q);
    const c = handle.current?.center() ?? start;
    searchCategory(q, c, areaLabel);
  };

  // suggestion choisie : un commerce ouvre sa fiche, une adresse ou une ville centre la carte dessus
  const openSuggestion = async (sug: MapSuggestion) => {
    setUrl(sug.label);
    const id = ++runId.current;
    const town = sug.kind === "Ville" || sug.kind === "Commune";
    const asPlace = () => {
      const d = town ? 0.05 : 0.003;
      setGeo({ name: sug.label, label: sug.detail, type: sug.kind, lat: sug.lat, lon: sug.lon, bbox: [sug.lat - d, sug.lat + d, sug.lon - d * 1.4, sug.lon + d * 1.4] });
      setDetail(null);
      setResults([]);
      setMode("place");
      if (town) setAreaLabel(sug.label);
      handle.current?.flyTo(sug.lat, sug.lon, town ? 13 : 17);
    };
    if (sug.kind === "Adresse" || town) return asPlace();
    if (sug.poi) {
      // déjà tout ce qu'il faut dans notre index : fiche immédiate
      setDetail(poiToBusiness({ ...sug.poi, name: sug.label, kind: sug.kind, lat: sug.lat, lon: sug.lon }));
      setGeo(null);
      setResults([]);
      setMode("detail");
      lastCategory.current = null;
      handle.current?.flyTo(sug.lat, sug.lon, 17);
      return;
    }
    setMode("loading");
    setError(null);
    lastCategory.current = null;
    const params = new URLSearchParams({ q: sug.label, lat: String(sug.lat), lon: String(sug.lon) });
    const r = await fetch(`/api/places/lookup?${params}`).then((x) => x.json() as Promise<{ business: Business | null }>).catch(() => null);
    if (id !== runId.current) return;
    const b = r?.business;
    if (b && Math.abs(b.lat - sug.lat) + Math.abs(b.lon - sug.lon) < 0.004) {
      setDetail(b);
      setGeo(null);
      setResults([]);
      setMode("detail");
      handle.current?.flyTo(b.lat, b.lon, 17);
    } else asPlace();
  };

  // clic sur un lieu affiché en zoomant : sa fiche s'ouvre dans le panneau
  const openPoi = (p: PoiHit) => {
    ++runId.current;
    setDetail(poiToBusiness(p));
    setGeo(null);
    setMode("detail");
    setSelected(null);
    setQuery(p.name);
    setUrl(p.name);
    setCollapsed(false);
    handle.current?.flyTo(p.lat, p.lon, 17.5);
  };

  const searchArea = () => {
    if (!lastCategory.current) return;
    const c = handle.current?.center() ?? start;
    const { city, km } = nearestCity(c);
    searchCategory(lastCategory.current, c, km < 15 ? city.name : "cette zone");
  };

  const select = (i: number) => {
    setSelected(i);
    listRef.current?.children[i]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const openDetail = (i: number) => {
    const p = results[i];
    setSelected(i);
    setDetail(placeToBusiness(p));
    setMode("detail");
    setCollapsed(false);
    handle.current?.flyTo(p.lat, p.lon, 17);
  };

  const locate = () => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = +pos.coords.latitude.toFixed(4);
        const lon = +pos.coords.longitude.toFixed(4);
        const { city, km } = nearestCity({ lat, lon });
        setUser({ lat, lon });
        setAreaLabel(km < 25 ? city.name : `près de ${city.name}`);
        saveLocation({ city: km < 25 ? city.name : `près de ${city.name}`, region: city.region, lat, lon, source: "gps" });
        handle.current?.flyTo(lat, lon, 15);
      },
      () => setError("Impossible d'obtenir votre position."),
      { timeout: 10_000, maximumAge: 600_000 },
    );
  };

  const closeDirections = () => {
    setDirOpen(false);
    setRoute(null);
  };

  const openDirections = (dest: Spot | null) => {
    setDirDest(dest);
    setDirOpen(true);
    setCollapsed(false);
  };

  const locateOnce = () =>
    new Promise<{ lat: number; lon: number } | null>((resolve) => {
      const fallback = approx ?? { lat: start.lat, lon: start.lon };
      if (!("geolocation" in navigator)) return resolve(fallback);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = { lat: +pos.coords.latitude.toFixed(4), lon: +pos.coords.longitude.toFixed(4) };
          setUser(p);
          resolve(p);
        },
        () => resolve(fallback),
        { timeout: 8_000, maximumAge: 600_000 },
      );
    });

  const onRoute = useCallback((segments: RouteSegment[] | null, origin: Spot | null, dest: Spot | null) => {
    setRoute(segments);
    setRouteEnds({ origin, dest });
    const coords = segments?.flatMap((s) => s.coords) ?? [];
    if (coords.length) handle.current?.fitCoords(coords);
    else if (dest) handle.current?.flyTo(dest.lat, dest.lon, 15);
  }, []);

  const showList = mode === "list" || (mode === "detail" && results.length > 0);

  return (
    <div className="maps-app" data-collapsed={collapsed ? "1" : undefined}>
      <MapCanvas
        handle={handle}
        initial={{ lat: start.lat, lon: start.lon, zoom: start.zoom }}
        places={dirOpen ? [] : results}
        selected={selected}
        pin={dirOpen ? routeEnds.dest : mode === "detail" && detail && selected === null ? detail : geo && mode === "place" ? geo : null}
        pinKind={!dirOpen && mode === "detail" && detail && selected === null ? detail.category : undefined}
        origin={dirOpen ? routeEnds.origin : null}
        route={dirOpen ? route : null}
        user={user}
        onSelect={(i) => (mode === "detail" ? openDetail(i) : select(i))}
        onUserMove={() => lastCategory.current && setDirty(true)}
        showPois={!dirOpen}
        onPoi={openPoi}
      />

      <div className="maps-chips" role="toolbar" aria-label="Catégories">
        {CHIPS.map((c) => (
          <button key={c.q} type="button" className="maps-chip" data-active={lastCategory.current === c.q ? "1" : undefined} onClick={() => pickChip(c.q)}>
            <PlaceGlyph icon={c.icon} size={15} /> {c.label}
          </button>
        ))}
      </div>

      {dirty && (
        <button type="button" className="maps-area" onClick={searchArea}>
          <SearchIcon width={15} height={15} /> Rechercher dans cette zone
        </button>
      )}

      <button type="button" className="maps-locate" onClick={locate} aria-label="Ma position" title="Ma position">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
          <circle cx="12" cy="12" r="7" />
        </svg>
      </button>

      <aside className="maps-panel" aria-label="Googlant Maps">
        <div className="maps-panel-head">
          <Link href="/" className="maps-brand" aria-label="Retour à Googlant">
            <span className="logo">
              <span>
                <span className="logo-g">G</span>ooglant
              </span>
            </span>
            <span className="maps-brand-maps">Maps</span>
          </Link>
          <div className="maps-tabs" role="tablist" aria-label="Googlant Maps" data-tab={dirOpen ? "dir" : "explore"}>
            <button type="button" role="tab" aria-selected={!dirOpen} onClick={() => dirOpen && closeDirections()}>
              <Compass size={16} strokeWidth={1.9} aria-hidden /> Explorer
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={dirOpen}
              onClick={() => !dirOpen && openDirections(dirDest ?? (mode === "detail" && detail ? { label: detail.name, lat: detail.lat, lon: detail.lon } : null))}
            >
              <Route size={16} strokeWidth={1.9} aria-hidden /> Itinéraire
            </button>
            <span className="maps-tabs-bar" aria-hidden />
          </div>
          {!dirOpen && (
            <form className="composer-wrap maps-composer maps-explore-slide" onSubmit={onSubmit} role="search">
              <div className="composer composer-compact" data-open={sugOpen ? "1" : undefined} data-filled={query.trim() ? "1" : undefined}>
                <SearchIcon className="composer-icon" />
                <div className="composer-field">
                  <SearchSuggest
                    value={query}
                    onChange={setQuery}
                    near={() => handle.current?.center() ?? user ?? start}
                    chips={CHIPS}
                    onCategory={(chip) => pickChip(chip.q)}
                    onPlace={openSuggestion}
                    onOpenChange={setSugOpen}
                    hints={MAP_HINTS}
                  />
                </div>
                {query && (
                  <>
                    <button
                      type="button"
                      className="composer-clear"
                      aria-label="Effacer"
                      onClick={() => {
                        setQuery("");
                        run("");
                      }}
                    >
                      <CloseIcon />
                    </button>
                    <span className="composer-divider" />
                  </>
                )}
                <button type="submit" className="cta-go" aria-label="Rechercher" disabled={!query.trim()}>
                  <ArrowUpIcon style={{ transform: "rotate(90deg)" }} />
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="maps-panel-body">
          {dirOpen ? (
            <div className="maps-dir-slide">
              <Directions key={dirDest ? `${dirDest.lat},${dirDest.lon}` : "none"} destination={dirDest} user={user ?? approx} onClose={closeDirections} onRoute={onRoute} onLocate={locateOnce} />
            </div>
          ) : (
          <div className="maps-explore-slide">
          {mode === "home" && (
            <div className="maps-home">
              <p className="maps-kicker">Explorer autour de {areaLabel}</p>
              <div className="maps-tiles">
                {CHIPS.slice(0, 8).map((c) => (
                  <button key={c.q} type="button" onClick={() => pickChip(c.q)}>
                    <span className="maps-tile-icon">
                      <PlaceGlyph icon={c.icon} size={16} />
                    </span>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "loading" && (
            <div className="local-skeleton">
              {[0, 1, 2, 3].map((i) => (
                <div key={i}>
                  <div className="skeleton-line" style={{ width: "60%", height: 14, marginBottom: 8 }} />
                  <div className="skeleton-line" style={{ width: "85%", height: 10 }} />
                </div>
              ))}
            </div>
          )}

          {mode === "empty" && (
            <div className="maps-home">
              <p className="maps-kicker">Aucun résultat</p>
              <p className="maps-hint">{error ?? "Essayez un autre mot, ou déplacez la carte puis choisissez une catégorie."}</p>
            </div>
          )}

          {showList && mode === "list" && (
            <>
              <div className="maps-results-head">
                <h1>{resultTitle}</h1>
                <p>
                  {results.length} résultat{results.length > 1 ? "s" : ""} · autour de {areaLabel}
                </p>
              </div>
              <ol className="maps-results" ref={listRef}>
                {results.map((p, i) => {
                  const st = p.openNow !== undefined ? { open: p.openNow, label: p.openNow ? "Ouvert" : "Fermé" } : now ? openStatus(p.hours, now) : null;
                  return (
                    <li key={p.id} data-active={i === selected ? "1" : undefined} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                      <button type="button" onClick={() => openDetail(i)} onMouseEnter={() => setSelected(i)}>
                        <span className="place-num">{i + 1}</span>
                        <span className="maps-result-body">
                          <b>{p.name}</b>
                          {p.rating !== undefined && (
                            <span className="place-rating">
                              <b>{p.rating.toLocaleString("fr-FR", { minimumFractionDigits: 1 })}</b>
                              <span className="stars" style={{ "--r": p.rating / 5 } as CSSProperties}>
                                ★★★★★
                              </span>
                              {p.ratings !== undefined && <span className="muted">({p.ratings})</span>}
                            </span>
                          )}
                          <span className="muted">
                            {p.category} · {distance(p.distanceM)}
                          </span>
                          {p.address && <span className="muted">{p.address}</span>}
                          {st && <span className={st.open ? "is-open" : "is-closed"}>{st.label}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          )}

          {mode === "detail" && detail && (
            <div className="maps-detail">
              {results.length > 0 && (
                <button
                  type="button"
                  className="maps-back"
                  onClick={() => {
                    setMode("list");
                    setDetail(null);
                    handle.current?.fitPlaces(results.slice(0, 12));
                  }}
                >
                  <ChevronLeftIcon /> {resultTitle}
                </button>
              )}
              <div className="biz maps-biz">
                <BusinessCard biz={detail} showMedia={false} onDirections={() => openDirections({ label: detail.name, lat: detail.lat, lon: detail.lon })} />
              </div>
            </div>
          )}

          {mode === "place" && geo && (
            <div className="maps-place">
              <p className="maps-kicker">{geo.type === "city" || geo.type === "town" || geo.type === "village" ? "Commune" : "Lieu"}</p>
              <h1>{geo.name}</h1>
              <p className="maps-place-label">{geo.label}</p>
              <div className="biz-actions">
                <button type="button" className="biz-action" onClick={() => openDirections({ label: geo.name, lat: geo.lat, lon: geo.lon })}>
                  Itinéraire
                </button>
                <Link className="biz-action" href={`/search?q=${encodeURIComponent(geo.name)}`}>
                  Rechercher sur le web
                </Link>
              </div>
              <p className="maps-kicker" style={{ marginTop: 18 }}>
                À proximité
              </p>
              <div className="maps-tiles">
                {CHIPS.slice(0, 6).map((c) => (
                  <button key={c.q} type="button" onClick={() => pickChip(c.q)}>
                    <PlaceGlyph icon={c.icon} size={15} />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          </div>
          )}
        </div>

        <button type="button" className="maps-collapse" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? "Afficher le panneau" : "Masquer le panneau"}>
          <ChevronLeftIcon />
        </button>
      </aside>
    </div>
  );
}
