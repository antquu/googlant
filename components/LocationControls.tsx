"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CITIES, cityBySlug, nearestCity } from "@/lib/geo/cities";
import type { UserLocation } from "@/lib/geo/types";
import { saveLocation } from "@/lib/prefs";
import { PinIcon } from "./icons";

const SOURCE: Record<UserLocation["source"], string> = {
  ip: "d'après votre adresse IP",
  gps: "position précise",
  manual: "ville choisie",
};

export function LocationControls({ loc, compact = false }: { loc: UserLocation | null; compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  const apply = (next: UserLocation | null) => {
    saveLocation(next);
    startTransition(() => router.refresh());
  };

  const locate = () => {
    if (!("geolocation" in navigator)) return setStatus("Géolocalisation indisponible.");
    setStatus("Localisation…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const { city, km } = nearestCity({ lat, lon });
        setStatus(null);
        apply({ city: km < 25 ? city.name : `près de ${city.name}`, region: city.region, lat: +lat.toFixed(3), lon: +lon.toFixed(3), source: "gps" });
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? "Autorisation refusée." : "Position introuvable."),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  };

  return (
    <div className={`loc-controls ${compact ? "loc-compact" : ""}`}>
      {!compact && (
        <span className="loc-current" data-known={loc ? "1" : undefined}>
          <PinIcon />
          {loc ? (
            <span>
              <b>{loc.city}</b> <span className="muted">· {SOURCE[loc.source]}</span>
            </span>
          ) : (
            <span className="muted">Position inconnue</span>
          )}
        </span>
      )}
      <div className="loc-actions">
        <button type="button" className="pill pill-outlined pill-sm" onClick={locate} disabled={pending}>
          <PinIcon /> {loc?.source === "gps" ? "Actualiser" : "Me localiser"}
        </button>
        <select
          className="select"
          aria-label="Choisir une ville"
          value=""
          onChange={(e) => {
            const c = cityBySlug(e.target.value);
            if (c) apply({ city: c.name, region: c.region, lat: c.lat, lon: c.lon, source: "manual" });
          }}
        >
          <option value="">Choisir une ville…</option>
          {CITIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        {!compact && loc && loc.source !== "ip" && (
          <button type="button" className="pill pill-tertiary pill-sm" onClick={() => apply(null)}>
            Oublier
          </button>
        )}
      </div>
      {(status || pending) && <span className="muted loc-status">{pending ? "Actualisation…" : status}</span>}
    </div>
  );
}
