"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useRef, useState } from "react";
import type { Suggestion as MapSuggestion } from "@/app/api/places/autocomplete/route";
import { byTypedPrefix, type PlaceIcon } from "@/lib/places/icons";
import { PlaceGlyph } from "../places/PlaceGlyph";

export type { MapSuggestion };

export interface CategoryChip {
  label: string;
  q: string;
  icon: PlaceIcon;
}

type Option = { type: "category"; chip: CategoryChip } | { type: "place"; s: MapSuggestion };

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

interface Props {
  value: string;
  onChange: (v: string) => void;
  near: () => { lat: number; lon: number };
  chips: CategoryChip[];
  onCategory: (chip: CategoryChip) => void;
  onPlace: (s: MapSuggestion) => void;
  /** ouverture de la liste (pour arrondir la barre comme sur l'accueil) */
  onOpenChange?: (open: boolean) => void;
  /** texte d'exemple qui défile quand le champ est vide */
  hints?: string[];
}

export function SearchSuggest({ value, onChange, near, chips, onCategory, onPlace, onOpenChange, hints = [] }: Props) {
  const [items, setItems] = useState<MapSuggestion[]>([]);
  const [pois, setPois] = useState<MapSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current || value.trim().length < 2) {
      setItems([]);
      setPois([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      const c = near();
      // arrondi à ~1 km : mêmes requêtes pour les voisins, donc servies par le cache CDN
      const params = new URLSearchParams({ q: value.trim().toLowerCase(), lat: c.lat.toFixed(2), lon: c.lon.toFixed(2) });
      fetch(`/api/places/autocomplete?${params}`, { signal: ctrl.signal })
        .then((x) => x.json() as Promise<{ suggestions: MapSuggestion[] }>)
        .then((r) => setItems(r.suggestions))
        .catch(() => {});
      params.set("kind", "poi");
      fetch(`/api/places/autocomplete?${params}`, { signal: ctrl.signal })
        .then((x) => x.json() as Promise<{ suggestions: MapSuggestion[] }>)
        .then((r) => setPois(r.suggestions))
        .catch(() => {});
    }, 160);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const typedText = plain(value);
  const categories = typedText.length >= 2 ? chips.filter((c) => plain(c.label).startsWith(typedText) || plain(c.q).startsWith(typedText)).slice(0, 2) : [];
  const places = byTypedPrefix([...pois, ...items].filter((s, i, all) => all.findIndex((o) => o.label === s.label && Math.abs(o.lat - s.lat) < 0.001) === i), value).slice(0, 8);
  const options: Option[] = [...categories.map((chip) => ({ type: "category" as const, chip })), ...places.map((s) => ({ type: "place" as const, s }))];
  const show = open && typed.current && options.length > 0;
  useEffect(() => onOpenChange?.(show), [show, onOpenChange]);

  // mots d'exemple qui défilent, comme la barre de l'accueil
  const [hint, setHint] = useState(0);
  const [exiting, setExiting] = useState<number | null>(null);
  useEffect(() => {
    if (hints.length < 2 || value) return;
    const id = setInterval(() => {
      setHint((h) => {
        setExiting(h);
        setTimeout(() => setExiting(null), 260);
        return (h + 1) % hints.length;
      });
    }, 2800);
    return () => clearInterval(id);
  }, [hints.length, value]);

  const pick = (o: Option) => {
    typed.current = false;
    setOpen(false);
    setCursor(-1);
    setItems([]);
    setPois([]);
    if (o.type === "category") {
      onChange(o.chip.q);
      onCategory(o.chip);
    } else {
      onChange(o.s.label);
      onPlace(o.s);
    }
  };

  return (
    <>
      <div className="maps-field">
      <input
        className="composer-input"
        value={value}
        onChange={(e) => {
          typed.current = true;
          setOpen(true);
          setCursor(-1);
          onChange(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(options.length - 1, c + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(-1, c - 1));
          } else if (e.key === "Enter" && cursor >= 0) {
            e.preventDefault();
            pick(options[cursor]);
          } else if (e.key === "Escape") {
            setOpen(false);
          } else if (e.key === "Enter") {
            typed.current = false;
            setOpen(false);
          }
        }}
        placeholder={hints.length ? "" : "Rechercher un lieu, un commerce, une adresse"}
        aria-label="Rechercher dans Googlant Maps"
        aria-autocomplete="list"
        aria-expanded={show}
        autoComplete="off"
        enterKeyHint="search"
      />
      {!value && hints.length > 0 && (
        <div className="composer-hints" aria-hidden>
          {hints.map((h, i) => (
            <span key={h} className={`hint-word ${i === hint ? "active" : ""} ${i === exiting ? "exiting" : ""}`}>
              {h}
            </span>
          ))}
        </div>
      )}
      </div>
      {show && (
        <ul className="dir-suggest maps-suggest" role="listbox">
          {options.map((o, i) => (
            <li key={o.type === "category" ? `c-${o.chip.q}` : `p-${o.s.label}-${o.s.lat}-${i}`}>
              <button type="button" role="option" aria-selected={i === cursor} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}>
                {o.type === "category" ? (
                  <>
                    <PlaceGlyph icon={o.chip.icon} size={16} />
                    <span>
                      <b>{o.chip.label}</b>
                      <small>À proximité</small>
                    </span>
                  </>
                ) : (
                  <>
                    <PlaceGlyph kind={o.s.kind} size={16} />
                    <span>
                      <b>{o.s.label}</b>
                      <small>{[o.s.kind, o.s.detail].filter(Boolean).join(" · ")}</small>
                    </span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
