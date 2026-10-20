/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface City {
  slug: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  aliases?: string[];
}

export const CITIES: City[] = [
  { slug: "grenoble", name: "Grenoble", region: "Auvergne-Rhône-Alpes", lat: 45.1885, lon: 5.7245, aliases: ["grenoble", "grenoblois", "isere", "echirolles", "saint-martin-d'heres", "meylan", "fontaine"] },
  { slug: "lyon", name: "Lyon", region: "Auvergne-Rhône-Alpes", lat: 45.764, lon: 4.8357, aliases: ["lyon", "lyonnais", "villeurbanne", "venissieux", "part-dieu", "bron", "caluire"] },
  { slug: "saint-etienne", name: "Saint-Étienne", region: "Auvergne-Rhône-Alpes", lat: 45.4397, lon: 4.3872, aliases: ["saint-etienne", "saint etienne", "st etienne", "st-etienne", "stephanois", "loire", "firminy"] },
  { slug: "clermont-ferrand", name: "Clermont-Ferrand", region: "Auvergne-Rhône-Alpes", lat: 45.7772, lon: 3.087, aliases: ["clermont-ferrand", "clermont ferrand", "clermont", "clermontois", "auvergne", "aubiere", "cournon"] },
  { slug: "nancy", name: "Nancy", region: "Grand Est", lat: 48.6921, lon: 6.1844, aliases: ["nancy", "nanceien", "vandoeuvre", "lorraine", "laxou", "villers-les-nancy"] },
  { slug: "paris", name: "Paris", region: "Île-de-France", lat: 48.8566, lon: 2.3522 },
  { slug: "marseille", name: "Marseille", region: "Provence-Alpes-Côte d'Azur", lat: 43.2965, lon: 5.3698 },
  { slug: "toulouse", name: "Toulouse", region: "Occitanie", lat: 43.6047, lon: 1.4442 },
  { slug: "nice", name: "Nice", region: "Provence-Alpes-Côte d'Azur", lat: 43.7102, lon: 7.262 },
  { slug: "nantes", name: "Nantes", region: "Pays de la Loire", lat: 47.2184, lon: -1.5536 },
  { slug: "montpellier", name: "Montpellier", region: "Occitanie", lat: 43.6108, lon: 3.8767 },
  { slug: "strasbourg", name: "Strasbourg", region: "Grand Est", lat: 48.5734, lon: 7.7521 },
  { slug: "bordeaux", name: "Bordeaux", region: "Nouvelle-Aquitaine", lat: 44.8378, lon: -0.5792 },
  { slug: "lille", name: "Lille", region: "Hauts-de-France", lat: 50.6292, lon: 3.0573 },
  { slug: "rennes", name: "Rennes", region: "Bretagne", lat: 48.1173, lon: -1.6778 },
  { slug: "reims", name: "Reims", region: "Grand Est", lat: 49.2583, lon: 4.0317 },
  { slug: "toulon", name: "Toulon", region: "Provence-Alpes-Côte d'Azur", lat: 43.1242, lon: 5.928 },
  { slug: "le-havre", name: "Le Havre", region: "Normandie", lat: 49.4944, lon: 0.1079 },
  { slug: "dijon", name: "Dijon", region: "Bourgogne-Franche-Comté", lat: 47.322, lon: 5.0415 },
  { slug: "angers", name: "Angers", region: "Pays de la Loire", lat: 47.4784, lon: -0.5632 },
  { slug: "nimes", name: "Nîmes", region: "Occitanie", lat: 43.8367, lon: 4.3601 },
  { slug: "villeurbanne", name: "Villeurbanne", region: "Auvergne-Rhône-Alpes", lat: 45.7719, lon: 4.8902 },
  { slug: "le-mans", name: "Le Mans", region: "Pays de la Loire", lat: 48.0061, lon: 0.1996 },
  { slug: "aix-en-provence", name: "Aix-en-Provence", region: "Provence-Alpes-Côte d'Azur", lat: 43.5297, lon: 5.4474 },
  { slug: "brest", name: "Brest", region: "Bretagne", lat: 48.3904, lon: -4.4861 },
  { slug: "tours", name: "Tours", region: "Centre-Val de Loire", lat: 47.3941, lon: 0.6848 },
  { slug: "amiens", name: "Amiens", region: "Hauts-de-France", lat: 49.8941, lon: 2.2958 },
  { slug: "limoges", name: "Limoges", region: "Nouvelle-Aquitaine", lat: 45.8336, lon: 1.2611 },
  { slug: "annecy", name: "Annecy", region: "Auvergne-Rhône-Alpes", lat: 45.8992, lon: 6.1294 },
  { slug: "chambery", name: "Chambéry", region: "Auvergne-Rhône-Alpes", lat: 45.5646, lon: 5.9178 },
  { slug: "valence", name: "Valence", region: "Auvergne-Rhône-Alpes", lat: 44.9334, lon: 4.8924 },
  { slug: "metz", name: "Metz", region: "Grand Est", lat: 49.1193, lon: 6.1757 },
  { slug: "besancon", name: "Besançon", region: "Bourgogne-Franche-Comté", lat: 47.2378, lon: 6.0241 },
  { slug: "orleans", name: "Orléans", region: "Centre-Val de Loire", lat: 47.9029, lon: 1.9093 },
  { slug: "rouen", name: "Rouen", region: "Normandie", lat: 49.4432, lon: 1.0999 },
  { slug: "caen", name: "Caen", region: "Normandie", lat: 49.1829, lon: -0.3707 },
  { slug: "perpignan", name: "Perpignan", region: "Occitanie", lat: 42.6887, lon: 2.8948 },
  { slug: "mulhouse", name: "Mulhouse", region: "Grand Est", lat: 47.7508, lon: 7.3359 },
  { slug: "vichy", name: "Vichy", region: "Auvergne-Rhône-Alpes", lat: 46.1278, lon: 3.4258 },
  { slug: "roanne", name: "Roanne", region: "Auvergne-Rhône-Alpes", lat: 46.0347, lon: 4.0723 },
  { slug: "epinal", name: "Épinal", region: "Grand Est", lat: 48.1724, lon: 6.4495 },
  { slug: "le-puy-en-velay", name: "Le Puy-en-Velay", region: "Auvergne-Rhône-Alpes", lat: 45.0434, lon: 3.885 },
  { slug: "bourgoin-jallieu", name: "Bourgoin-Jallieu", region: "Auvergne-Rhône-Alpes", lat: 45.586, lon: 5.2736 },
  { slug: "voiron", name: "Voiron", region: "Auvergne-Rhône-Alpes", lat: 45.3646, lon: 5.5895 },
];

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestCity(pos: { lat: number; lon: number }): { city: City; km: number } {
  let best = { city: CITIES[0], km: Infinity };
  for (const city of CITIES) {
    const km = distanceKm(pos, city);
    if (km < best.km) best = { city, km };
  }
  return best;
}

export function cityBySlug(slug: string | undefined): City | undefined {
  return CITIES.find((c) => c.slug === slug);
}
