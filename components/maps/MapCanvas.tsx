"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, type MutableRefObject } from "react";
import type { Place } from "@/lib/places/types";
import type { PoiHit } from "@/lib/places/poi-index";
import { pinIcon, pinTone } from "./pinIcon";

const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const FALLBACK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export interface RouteSegment {
  coords: [number, number][];
  color: string;
  dashed: boolean;
}

export interface MapHandle {
  flyTo: (lat: number, lon: number, zoom?: number) => void;
  fitPlaces: (places: { lat: number; lon: number }[]) => void;
  fitBbox: (bbox: [number, number, number, number]) => void;
  fitCoords: (coords: [number, number][]) => void;
  center: () => { lat: number; lon: number };
  setPadding: (p: { left: number; bottom: number; top: number }) => void;
}

interface Props {
  initial: { lat: number; lon: number; zoom: number };
  places: Place[];
  selected: number | null;
  pin: { lat: number; lon: number } | null;
  user: { lat: number; lon: number } | null;
  origin?: { lat: number; lon: number } | null;
  route?: RouteSegment[] | null;
  onSelect: (i: number) => void;
  onUserMove: () => void;
  handle: MutableRefObject<MapHandle | null>;
  /** lieux du quartier affichés quand on zoome (false pendant un itinéraire) */
  showPois?: boolean;
  onPoi?: (p: PoiHit) => void;
  /** type du lieu épinglé (icône et couleur du grand pin) */
  pinKind?: string;
}

const POI_ZOOM = 15.5;
const LABEL_ZOOM = 16;

export default function MapCanvas({ initial, places, selected, pin, user, origin = null, route = null, onSelect, onUserMove, handle, showPois = true, onPoi, pinKind }: Props) {
  // pastilles du quartier, pour cacher celle qui est remplacée par le grand pin
  const poiEls = useRef<{ el: HTMLElement; lat: number; lon: number }[]>([]);
  const pinPos = useRef<{ lat: number; lon: number } | null>(null);
  pinPos.current = pin ? { lat: pin.lat, lon: pin.lon } : null;
  const poiCb = useRef(onPoi);
  poiCb.current = onPoi;
  const placesRef = useRef(places);
  placesRef.current = places;
  const routeRef = useRef<RouteSegment[] | null>(route);
  routeRef.current = route;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pinEls = useRef<HTMLElement[]>([]);
  const cb = useRef({ onSelect, onUserMove });
  cb.current = { onSelect, onUserMove };

  useEffect(() => {
    if (!container.current) return;
    let styleLoaded = false;
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE,
      center: [initial.lon, initial.lat],
      zoom: initial.zoom,
      attributionControl: { compact: true },
      fadeDuration: 0,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    map.on("style.load", () => {
      styleLoaded = true;
      drawRoute(map, routeRef.current);
    });
    map.on("error", () => {
      if (!styleLoaded && STYLE !== FALLBACK) {
        styleLoaded = true;
        map.setStyle(FALLBACK);
      }
    });
    map.on("moveend", (e) => {
      if ((e as { originalEvent?: unknown }).originalEvent) cb.current.onUserMove();
    });
    mapRef.current = map;

    handle.current = {
      flyTo: (lat, lon, zoom = 16) => map.flyTo({ center: [lon, lat], zoom, speed: 1.6, curve: 1.3, essential: true }),
      fitPlaces: (pts) => {
        if (!pts.length) return;
        const b = new maplibregl.LngLatBounds([pts[0].lon, pts[0].lat], [pts[0].lon, pts[0].lat]);
        for (const p of pts) b.extend([p.lon, p.lat]);
        map.fitBounds(b, { padding: 70, maxZoom: 16, duration: 900 });
      },
      fitBbox: ([s, n, w, e]) => map.fitBounds([[w, s], [e, n]], { padding: 40, maxZoom: 15, duration: 900 }),
      fitCoords: (coords) => {
        if (!coords.length) return;
        const b = new maplibregl.LngLatBounds(coords[0], coords[0]);
        for (const c of coords) b.extend(c);
        map.fitBounds(b, { padding: 60, maxZoom: 16, duration: 900 });
      },
      center: () => {
        const c = map.getCenter();
        return { lat: +c.lat.toFixed(5), lon: +c.lng.toFixed(5) };
      },
      setPadding: (p) => map.setPadding({ ...p, right: 0 }),
    };

    return () => {
      handle.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const added: maplibregl.Marker[] = [];
    pinEls.current = places.map((p, i) => {
      const el = document.createElement("div");
      el.className = "map-pin";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "map-marker";
      btn.setAttribute("aria-label", p.name);
      // icône du type de commerce (Lucide), couleur selon la famille, comme sur Google Maps
      el.dataset.tone = pinTone(p.category);
      const glyph = document.createElement("span");
      glyph.appendChild(pinIcon(p.category));
      btn.appendChild(glyph);
      const label = document.createElement("span");
      label.className = "map-pin-label";
      label.textContent = p.name;
      el.append(btn, label);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        cb.current.onSelect(i);
      });
      added.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lon, p.lat]).addTo(map));
      return el;
    });
    return () => added.forEach((m) => m.remove());
  }, [places]);

  useEffect(() => {
    pinEls.current.forEach((el, i) => el.classList.toggle("is-selected", i === selected));
  }, [selected, places]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource("route") || map.isStyleLoaded()) drawRoute(map, route);
    else {
      // tuiles encore en chargement : on dessine dès que la carte est au repos
      const later = () => drawRoute(map, routeRef.current);
      map.once("idle", later);
      return () => {
        map.off("idle", later);
      };
    }
  }, [route]);

  const originLat = origin?.lat;
  const originLon = origin?.lon;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || originLat === undefined || originLon === undefined) return;
    const el = document.createElement("div");
    el.className = "map-origin";
    const m = new maplibregl.Marker({ element: el }).setLngLat([originLon, originLat]).addTo(map);
    return () => {
      m.remove();
    };
  }, [originLat, originLon]);

  // --- lieux du quartier, comme Google Maps : pastilles avec l'icône du commerce, le nom de plus près
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showPois) return;
    let markers: maplibregl.Marker[] = [];
    let ctrl: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastKey = "";
    const clear = () => {
      markers.forEach((m) => m.remove());
      markers = [];
      poiEls.current = [];
      lastKey = "";
    };
    const load = () => {
      const z = map.getZoom();
      map.getContainer().classList.toggle("map-pois-small", z < LABEL_ZOOM);
      if (z < POI_ZOOM) return clear();
      const b = map.getBounds();
      const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((x) => x.toFixed(3)).join(",");
      if (bbox === lastKey) return;
      ctrl?.abort();
      ctrl = new AbortController();
      fetch(`/api/places/nearby?bbox=${bbox}`, { signal: ctrl.signal })
        .then((r) => r.json() as Promise<{ pois: PoiHit[] }>)
        .then(({ pois }) => {
          clear();
          lastKey = bbox;
          // pas de doublon avec les résultats de recherche déjà épinglés
          const taken = new Set(placesRef.current.map((p) => p.name.toLowerCase()));
          for (const p of pois) {
            if (taken.has(p.name.toLowerCase())) continue;
            const el = document.createElement("button");
            el.type = "button";
            el.className = "map-poi";
            el.dataset.tone = pinTone(p.kind);
            el.setAttribute("aria-label", `${p.name} — ${p.kind}`);
            const dot = document.createElement("span");
            dot.className = "map-poi-dot";
            dot.appendChild(pinIcon(p.kind, 13));
            const label = document.createElement("span");
            label.className = "map-poi-label";
            label.textContent = p.name;
            el.append(dot, label);
            el.addEventListener("click", (e) => {
              e.stopPropagation();
              poiCb.current?.(p);
            });
            const pp = pinPos.current;
            if (pp && Math.abs(pp.lat - p.lat) + Math.abs(pp.lon - p.lon) < 0.00005) el.classList.add("is-pinned");
            poiEls.current.push({ el, lat: p.lat, lon: p.lon });
            markers.push(new maplibregl.Marker({ element: el, anchor: "left", offset: [-11, 0] }).setLngLat([p.lon, p.lat]).addTo(map));
          }
        })
        .catch(() => {});
    };
    const onMove = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 350);
    };
    map.on("moveend", onMove);
    if (map.loaded()) load();
    else map.once("idle", load);
    return () => {
      map.off("moveend", onMove);
      if (timer) clearTimeout(timer);
      ctrl?.abort();
      clear();
    };
  }, [showPois]);

  const pinLat = pin?.lat;
  const pinLon = pin?.lon;
  const userLat = user?.lat;
  const userLon = user?.lon;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || pinLat === undefined || pinLon === undefined) return;
    // la pastille ronde grandit et devient le pin, même couleur, même icône
    const el = document.createElement("div");
    el.className = "map-pin is-selected is-solo is-grow";
    if (pinKind) el.dataset.tone = pinTone(pinKind);
    const marker = document.createElement("span");
    marker.className = "map-marker";
    const glyph = document.createElement("span");
    if (pinKind) glyph.appendChild(pinIcon(pinKind, 16));
    marker.appendChild(glyph);
    el.appendChild(marker);
    const m = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([pinLon, pinLat]).addTo(map);
    // la petite pastille du même lieu s'efface pendant ce temps
    const near = (p: { lat: number; lon: number }) => Math.abs(p.lat - pinLat) + Math.abs(p.lon - pinLon) < 0.00005;
    for (const p of poiEls.current) p.el.classList.toggle("is-pinned", near(p));
    return () => {
      m.remove();
      for (const p of poiEls.current) p.el.classList.remove("is-pinned");
    };
  }, [pinLat, pinLon, pinKind]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || userLat === undefined || userLon === undefined) return;
    const el = document.createElement("div");
    el.className = "map-user";
    const m = new maplibregl.Marker({ element: el }).setLngLat([userLon, userLat]).addTo(map);
    return () => {
      m.remove();
    };
  }, [userLat, userLon]);

  return <div ref={container} className="maps-canvas" />;
}

function drawRoute(map: maplibregl.Map, route: RouteSegment[] | null) {
  const data: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: (route ?? []).map((seg) => ({
      type: "Feature",
      properties: { color: seg.color, dashed: seg.dashed },
      geometry: { type: "LineString", coordinates: seg.coords },
    })),
  };
  const source = map.getSource("route") as maplibregl.GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
    return;
  }
  map.addSource("route", { type: "geojson", data });
  map.addLayer({
    id: "route-casing",
    type: "line",
    source: "route",
    filter: ["==", ["get", "dashed"], false],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#0d0f12", "line-width": 10 },
  });
  map.addLayer({
    id: "route-line",
    type: "line",
    source: "route",
    filter: ["==", ["get", "dashed"], false],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 6 },
  });
  map.addLayer({
    id: "route-walk",
    type: "line",
    source: "route",
    filter: ["==", ["get", "dashed"], true],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#e2e8f0", "line-width": 3.5, "line-dasharray": [0.2, 2] },
  });
}
