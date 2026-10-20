"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Place } from "@/lib/places/types";

const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const FALLBACK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

interface Props {
  places: Place[];
  center: { lat: number; lon: number };
  selected: number | null;
  onSelect: (i: number) => void;
  showUser: boolean;
  still?: boolean;
  zoom?: number;
}

export default function PlacesMap({ places, center, selected, onSelect, showUser, still = false, zoom = 15 }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<HTMLElement[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!container.current) return;
    let styleLoaded = false;
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE,
      center: [center.lon, center.lat],
      zoom,
      attributionControl: { compact: true },
      cooperativeGestures: !still,
      interactive: !still,
      fadeDuration: 0,
    });
    if (!still) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("style.load", () => (styleLoaded = true));
    map.on("error", () => {
      if (!styleLoaded && STYLE !== FALLBACK) {
        styleLoaded = true;
        map.setStyle(FALLBACK);
      }
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const added: maplibregl.Marker[] = [];
    markers.current = [];

    if (showUser) {
      const el = document.createElement("div");
      el.className = "map-user";
      added.push(new maplibregl.Marker({ element: el }).setLngLat([center.lon, center.lat]).addTo(map));
    }

    const bounds = new maplibregl.LngLatBounds([center.lon, center.lat], [center.lon, center.lat]);
    places.forEach((p, i) => {
      const el = document.createElement("div");
      el.className = "map-pin";
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "map-marker";
      pin.setAttribute("aria-label", p.name);
      const num = document.createElement("span");
      num.textContent = still ? "" : String(i + 1);
      pin.appendChild(num);
      el.appendChild(pin);
      pin.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectRef.current(i);
      });
      markers.current.push(el);
      added.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lon, p.lat]).addTo(map));
      if (i < 10) bounds.extend([p.lon, p.lat]);
    });
    if (places.length > 1) map.fitBounds(bounds, { padding: 56, maxZoom: 16, duration: 0 });
    else map.jumpTo({ center: places[0] ? [places[0].lon, places[0].lat] : [center.lon, center.lat], zoom });

    return () => added.forEach((m) => m.remove());
  }, [places, center.lat, center.lon, showUser, still, zoom]);

  useEffect(() => {
    markers.current.forEach((el, i) => el.classList.toggle("is-selected", i === selected));
    const map = mapRef.current;
    const p = selected !== null ? places[selected] : null;
    if (map && p && !map.getBounds().contains([p.lon, p.lat])) map.easeTo({ center: [p.lon, p.lat], duration: 500 });
  }, [selected, places]);

  return <div ref={container} className="places-map" />;
}
