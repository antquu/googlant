/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Noms affichés à la main pour certains lieux : le nom OpenStreetMap n'est pas celui que les gens
// utilisent (ex. une pharmacie connue par le nom du village, pas par celui du pharmacien).

interface NameOverride {
  osm: string; // identifiant OpenStreetMap, ex. "way/198949118"
  from: string; // nom d'origine (pour les sources sans identifiant OSM)
  name: string; // nom affiché
  city?: string;
}

const OVERRIDES: NameOverride[] = [{ osm: "way/198949118", from: "Pharmacie Reymermier", name: "Pharmacie de Monestier", city: "Monestier-de-Clermont" }];

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

function find(name: string, osm?: string | null): NameOverride | undefined {
  return OVERRIDES.find((o) => (osm && o.osm === osm) || fold(o.from) === fold(name));
}

/** Nom et ville à afficher pour un lieu (inchangés s'il n'y a pas de renommage). */
export function renamed<T extends { name: string; city?: string | null }>(place: T, osm?: string | null): T {
  const o = find(place.name, osm);
  return o ? { ...place, name: o.name, city: place.city || o.city || place.city } : place;
}

/** Noms d'origine à chercher aussi quand on tape le nom affiché ("pharmacie de mon" -> "Pharmacie Reymermier"). */
export function originalNamesFor(query: string): string[] {
  const q = fold(query);
  if (q.length < 3) return [];
  return OVERRIDES.filter((o) => fold(o.name).startsWith(q) || fold(o.name).includes(q)).map((o) => o.from);
}
