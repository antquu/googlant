"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { Itinerary, Leg, PlanResult } from "@/lib/route/plan";
import { ChevronLeftIcon } from "../icons";
import { byTypedPrefix } from "@/lib/places/icons";
import { PlaceGlyph } from "../places/PlaceGlyph";
import type { RouteSegment } from "./MapCanvas";

export interface Spot {
  label: string;
  lat: number;
  lon: number;
}

interface Suggestion {
  label: string;
  detail: string;
  kind: string;
  lat: number;
  lon: number;
}

interface Props {
  destination: Spot | null;
  user: { lat: number; lon: number } | null;
  onClose: () => void;
  onRoute: (route: RouteSegment[] | null, origin: Spot | null, destination: Spot | null) => void;
  onLocate: () => Promise<{ lat: number; lon: number } | null>;
}

const MY_POSITION = "Ma position";
const MODES = [
  { id: "TRAM", label: "Tram" },
  { id: "SUBWAY", label: "Métro" },
  { id: "BUS", label: "Bus" },
  { id: "RAIL", label: "Train" },
];
const MODE_LABEL: Record<string, string> = { TRAM: "Tram", SUBWAY: "Métro", BUS: "Bus", RAIL: "Train", FERRY: "Bateau", GONDOLA: "Téléphérique", FUNICULAR: "Funiculaire", CABLE_CAR: "Téléphérique" };

const hhmm = (t: number) => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const minutes = (s: number) => {
  const m = Math.max(1, Math.round(s / 60));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
};
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

function Badge({ leg }: { leg: Leg }) {
  if (!leg.line) return null;
  return (
    <span className="line-badge" style={{ "--c": leg.line.color, color: leg.line.text } as CSSProperties}>
      {leg.line.short}
    </span>
  );
}

const Walk = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="13" cy="4" r="1.6" />
    <path d="m10 21 2-6 3 3v4M8 12l2-4 4 1 2 4M10 8l-2 7" />
  </svg>
);

/** Champ de lieu avec suggestions (adresses, arrêts, lieux) au fil de la frappe. */
function PlaceField({ value, onText, onPick, placeholder, near, allowMine }: { value: string; onText: (v: string) => void; onPick: (s: Spot) => void; placeholder: string; near: { lat: number; lon: number } | null; allowMine: boolean }) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [pois, setPois] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current || value.trim().length < 2 || value === MY_POSITION) {
      setItems([]);
      setPois([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ q: value });
      if (near) {
        // arrondi à ~1 km : mêmes requêtes pour les voisins, donc servies par le cache CDN
        params.set("lat", near.lat.toFixed(2));
        params.set("lon", near.lon.toFixed(2));
      }
      // adresses et lieux (rapide) puis commerces (plus lent), affichés au fur et à mesure
      fetch(`/api/places/autocomplete?${params}`, { signal: ctrl.signal })
        .then((x) => x.json() as Promise<{ suggestions: Suggestion[] }>)
        .then((r) => {
          setItems(r.suggestions);
          setCursor(-1);
        })
        .catch(() => {});
      params.set("kind", "poi");
      fetch(`/api/places/autocomplete?${params}`, { signal: ctrl.signal })
        .then((x) => x.json() as Promise<{ suggestions: Suggestion[] }>)
        .then((r) => setPois(r.suggestions))
        .catch(() => {});
    }, 140);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value, near]);

  const merged = byTypedPrefix([...pois, ...items].filter((s, i, all) => all.findIndex((o) => o.label === s.label && Math.abs(o.lat - s.lat) < 0.001) === i), value);
  const options: Suggestion[] = [...(allowMine && value !== MY_POSITION ? [{ label: MY_POSITION, detail: "Position actuelle", kind: "gps", lat: NaN, lon: NaN }] : []), ...merged.slice(0, 9)];

  const pick = (s: Suggestion) => {
    typed.current = false;
    setOpen(false);
    setItems([]);
    setPois([]);
    onText(s.label);
    onPick({ label: s.label, lat: s.lat, lon: s.lon });
  };

  return (
    <div className="dir-field">
      <input
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        onChange={(e) => {
          typed.current = true;
          onText(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setOpen(true);
          if (value === MY_POSITION) e.target.select();
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !options.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(options.length - 1, c + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(-1, c - 1));
          } else if (e.key === "Enter" && cursor >= 0) {
            e.preventDefault();
            pick(options[cursor]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && options.length > 0 && (
        <ul className="dir-suggest" role="listbox">
          {options.map((s, i) => (
            <li key={`${s.label}-${s.detail}-${i}`}>
              <button type="button" role="option" aria-selected={i === cursor} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}>
                {s.kind === "gps" ? <span className="dir-suggest-gps" aria-hidden /> : <PlaceGlyph kind={s.kind} size={16} />}
                <span>
                  <b>{s.label}</b>
                  {s.detail && <small>{s.kind !== "gps" ? `${s.kind} · ` : ""}{s.detail}</small>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Directions({ destination, user, onClose, onRoute, onLocate }: Props) {
  const [fromText, setFromText] = useState(MY_POSITION);
  const [toText, setToText] = useState(destination?.label ?? "");
  const [from, setFrom] = useState<Spot | null>(null);
  const [to, setTo] = useState<Spot | null>(destination);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [timeMode, setTimeMode] = useState<"now" | "depart" | "arrive">("now");
  const [when, setWhen] = useState(() => localInput(new Date()));
  const [modes, setModes] = useState<string[]>(MODES.map((m) => m.id));
  const [lessWalk, setLessWalk] = useState(false);
  const [wheelchair, setWheelchair] = useState(false);

  const show = useCallback(
    (it: Itinerary | undefined, a: Spot | null, b: Spot | null) => {
      onRoute(it ? it.legs.map((l) => ({ coords: l.geometry, color: l.line?.color ?? "#e2e8f0", dashed: !l.line })) : null, a, b);
    },
    [onRoute],
  );

  const resolve = async (text: string, current: Spot | null): Promise<Spot | null> => {
    if (text.trim() === MY_POSITION) {
      const pos = user ?? (await onLocate());
      return pos ? { label: MY_POSITION, ...pos } : null;
    }
    if (current && current.label === text && Number.isFinite(current.lat)) return current;
    const r = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(text)}${user ? `&lat=${user.lat}&lon=${user.lon}` : ""}`)
      .then((x) => x.json() as Promise<{ suggestions: Suggestion[] }>)
      .catch(() => null);
    const s = r?.suggestions[0];
    return s ? { label: s.label, lat: s.lat, lon: s.lon } : null;
  };

  const compute = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!fromText.trim() || !toText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const [a, b] = await Promise.all([resolve(fromText, from), resolve(toText, to)]);
    if (!a || !b) {
      setLoading(false);
      setError(!a ? "Départ introuvable." : "Arrivée introuvable.");
      return;
    }
    setFrom(a);
    setTo(b);
    const params = new URLSearchParams({ from: `${a.lat},${a.lon}`, to: `${b.lat},${b.lon}`, fromName: a.label, toName: b.label });
    if (timeMode !== "now") {
      params.set("time", new Date(when).toISOString());
      if (timeMode === "arrive") params.set("arriveBy", "1");
    }
    if (modes.length < MODES.length) params.set("modes", modes.join(","));
    if (lessWalk) params.set("lessWalk", "1");
    if (wheelchair) params.set("wheelchair", "1");
    const res = await fetch(`/api/route?${params}`).then((x) => x.json() as Promise<PlanResult & { error?: string }>).catch(() => null);
    setLoading(false);
    if (!res || res.error || !res.itineraries?.length) {
      setError(res?.error ?? "Aucun itinéraire en transports en commun trouvé.");
      show(undefined, a, b);
      return;
    }
    setResult(res);
    setSelected(0);
    show(res.itineraries[0], a, b);
  };

  useEffect(() => {
    onRoute(null, null, destination);
  }, []);

  // départ et arrivée choisis (suggestion, "Ma position" ou destination déjà remplie) :
  // l'itinéraire se calcule tout seul, et se recalcule après une inversion ou un changement de filtre
  const ready = (text: string, spot: Spot | null) => text.trim() === MY_POSITION || (!!spot && spot.label === text && Number.isFinite(spot.lat));
  const spotKey = (text: string, spot: Spot | null) => (text.trim() === MY_POSITION ? "moi" : `${spot?.lat},${spot?.lon}`);
  const autoKey =
    ready(fromText, from) && ready(toText, to)
      ? [spotKey(fromText, from), spotKey(toText, to), timeMode, timeMode === "now" ? "" : when, modes.join(), lessWalk, wheelchair].join("|")
      : "";
  const lastAuto = useRef("");
  useEffect(() => {
    if (!autoKey || autoKey === lastAuto.current) return;
    const t = setTimeout(() => {
      lastAuto.current = autoKey;
      void compute();
    }, 250);
    return () => clearTimeout(t);
  }, [autoKey]);

  const swap = () => {
    setFromText(toText);
    setToText(fromText);
    setFrom(to);
    setTo(from);
  };

  const pick = (i: number) => {
    setSelected(i);
    show(result?.itineraries[i], from, to);
  };

  const toggleMode = (id: string) => setModes((m) => (m.includes(id) ? (m.length > 1 ? m.filter((x) => x !== id) : m) : [...m, id]));
  const activeFilters = (timeMode !== "now" ? 1 : 0) + (modes.length < MODES.length ? 1 : 0) + (lessWalk ? 1 : 0) + (wheelchair ? 1 : 0);

  return (
    <div className="dir">
      <div className="dir-head">
        <button
          type="button"
          className="maps-back"
          onClick={() => {
            onRoute(null, null, null);
            onClose();
          }}
        >
          <ChevronLeftIcon /> Itinéraire
        </button>
        <a className="dir-engine" href="https://www.grelines.fr" target="_blank" rel="noopener" title="Itinéraires calculés avec le moteur de GreLines">
          grelines.fr
        </a>
      </div>

      <form className="dir-form" onSubmit={compute}>
        <div className="dir-dots" aria-hidden>
          <i />
          <span />
          <b />
        </div>
        <div className="dir-inputs">
          <PlaceField value={fromText} onText={setFromText} onPick={setFrom} placeholder="Départ" near={user} allowMine />
          <PlaceField value={toText} onText={setToText} onPick={setTo} placeholder="Arrivée" near={user} allowMine />
        </div>
        <button type="button" className="dir-swap" onClick={swap} aria-label="Inverser départ et arrivée">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7 4v16M7 4 3.5 7.5M7 4l3.5 3.5M17 20V4M17 20l-3.5-3.5M17 20l3.5-3.5" />
          </svg>
        </button>
        <div className="dir-actions">
          <button type="submit" className="pill pill-primary pill-sm" disabled={loading}>
            {loading ? "Calcul…" : "Itinéraires"}
          </button>
          <button type="button" className="pill pill-outlined pill-sm" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
            Filtres{activeFilters ? ` · ${activeFilters}` : ""}
          </button>
        </div>
      </form>

      {showFilters && (
        <div className="dir-filters">
          <div className="segmented" role="group" aria-label="Horaire">
            {(
              [
                ["now", "Maintenant"],
                ["depart", "Partir à"],
                ["arrive", "Arriver à"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={timeMode === id} onClick={() => setTimeMode(id)}>
                {label}
              </button>
            ))}
          </div>
          {timeMode !== "now" && <input type="datetime-local" className="input dir-when" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Date et heure" />}
          <div className="dir-chips" role="group" aria-label="Modes de transport">
            {MODES.map((m) => (
              <button key={m.id} type="button" className="dir-chip" aria-pressed={modes.includes(m.id)} onClick={() => toggleMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="dir-chips">
            <button type="button" className="dir-chip" aria-pressed={lessWalk} onClick={() => setLessWalk((v) => !v)}>
              Moins de marche
            </button>
            <button type="button" className="dir-chip" aria-pressed={wheelchair} onClick={() => setWheelchair((v) => !v)}>
              Accessible fauteuil
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="local-skeleton">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <div className="skeleton-line" style={{ width: "50%", height: 14, marginBottom: 8 }} />
              <div className="skeleton-line" style={{ width: "75%", height: 10 }} />
            </div>
          ))}
        </div>
      )}
      {error && <p className="maps-hint dir-error">{error}</p>}

      {result && (
        <ol className="dir-list">
          {result.itineraries.map((it, i) => (
            <li key={i} data-active={i === selected ? "1" : undefined}>
              <button type="button" className="dir-card" onClick={() => pick(i)}>
                <span className="dir-times">
                  <b>
                    {hhmm(it.start)} → {hhmm(it.end)}
                  </b>
                  <span>{minutes(it.duration)}</span>
                </span>
                <span className="dir-chain">
                  {it.legs.map((l, j) =>
                    l.line ? (
                      <Badge key={j} leg={l} />
                    ) : l.duration >= 60 ? (
                      <span key={j} className="dir-walk">
                        <Walk />
                        {Math.round(l.duration / 60)}
                      </span>
                    ) : null,
                  )}
                </span>
                <span className="dir-meta">
                  {minutes(it.walk)} de marche · {it.transfers === 0 ? "direct" : `${it.transfers} correspondance${it.transfers > 1 ? "s" : ""}`}
                </span>
              </button>

              {i === selected && (
                <ol className="dir-steps">
                  {it.legs.map((l, j) => (
                    <li key={j} className={l.line ? "is-transit" : "is-walk"} style={{ "--c": l.line?.color ?? "#94a3b8" } as CSSProperties}>
                      <span className="dir-step-time">{hhmm(l.start)}</span>
                      <div className="dir-step-body">
                        <b>{l.from.name}</b>
                        {l.line ? (
                          <span className="dir-step-line">
                            <Badge leg={l} /> {MODE_LABEL[l.mode] ?? l.mode}
                            {l.line.headsign ? ` vers ${l.line.headsign}` : ""} · {l.stops} arrêt{l.stops > 1 ? "s" : ""} · {minutes(l.duration)}
                          </span>
                        ) : (
                          <span className="dir-step-line">
                            <Walk /> Marcher {minutes(l.duration)}
                            {l.distance ? ` (${l.distance >= 1000 ? `${(l.distance / 1000).toFixed(1)} km` : `${l.distance} m`})` : ""}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                  <li className="is-end">
                    <span className="dir-step-time">{hhmm(it.end)}</span>
                    <div className="dir-step-body">
                      <b>{it.legs[it.legs.length - 1]?.to.name}</b>
                    </div>
                  </li>
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
