/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface Campaign {
  id: string;
  advertiser: string;
  url: string;
  displayUrl: string;
  favicon: string;
  citySlug: string | null;
  cityName: string;
  lat: number;
  lon: number;
  network: string;
  headline: string;
  description: string;
  sitelinks: string[];
  keywords: string[];
  lines: [string, string][];
  cover: { paper: string; ink: string };
}

const TRANSIT = [
  "horaire", "horaires", "bus", "tram", "tramway", "metro", "transport", "transports", "ligne", "lignes", "arret", "arrets",
  "itineraire", "trajet", "passage", "passages", "prochain", "temps reel", "ter", "train", "gare", "trafic", "info trafic",
  "perturbation", "velo", "trottinette", "autopartage", "citiz", "plan", "reseau", "navette", "correspondance", "grelines",
];

const ref = (url: string) => `${url}?ref=googlant`;

export const CAMPAIGNS: Campaign[] = [
  {
    id: "grelines-grenoble",
    advertiser: "GreLines",
    url: ref("https://www.grelines.fr/"),
    displayUrl: "grelines.fr",
    favicon: "https://www.grelines.fr/flavicon.png",
    citySlug: "grenoble",
    cityName: "Grenoble",
    lat: 45.1885,
    lon: 5.7245,
    network: "Tag · TER · Citiz",
    headline: "GreLines Grenoble — Prochains passages Tag en temps réel",
    description:
      "Trams A à E, Chrono, Proximo, Flexo, TER et bus Tag : horaires en temps réel à chaque arrêt, itinéraires, info-trafic et plan interactif. Gratuit, sans compte et sans publicité.",
    sitelinks: ["Prochains passages", "Itinéraires", "Info-trafic", "Plan interactif"],
    keywords: [...TRANSIT, "tag", "chrono", "proximo", "flexo", "smmag", "m reso", "mreso"],
    lines: [["A", "#3376B8"], ["B", "#479A45"], ["C", "#C20078"], ["D", "#DE9917"], ["E", "#533786"]],
    cover: { paper: "#0f1b33", ink: "#e9edf5" },
  },
  {
    id: "grelines-lyon",
    advertiser: "GreLines",
    url: ref("https://lyon.grelines.fr/"),
    displayUrl: "lyon.grelines.fr",
    favicon: "https://lyon.grelines.fr/flavicon.png",
    citySlug: "lyon",
    cityName: "Lyon",
    lat: 45.764,
    lon: 4.8357,
    network: "TCL · TER",
    headline: "GreLines Lyon — Métro, tram et bus TCL en temps réel",
    description:
      "Métros A, B, C, D, tramways et bus TCL : prochains passages en direct, itinéraires et perturbations. Les transports lyonnais en temps réel, gratuit et sans compte.",
    sitelinks: ["Métro TCL", "Tramways", "Itinéraires", "Info-trafic"],
    keywords: [...TRANSIT, "tcl", "sytral", "part-dieu", "perrache", "bellecour", "funiculaire", "rhonexpress"],
    lines: [["A", "#E2001A"], ["B", "#0072BC"], ["C", "#F39200"], ["D", "#009B3A"], ["T1", "#7F3F98"]],
    cover: { paper: "#2a0d12", ink: "#f6e9e6" },
  },
  {
    id: "grelines-saint-etienne",
    advertiser: "GreLines",
    url: ref("https://saintetienne.grelines.fr/"),
    displayUrl: "saintetienne.grelines.fr",
    favicon: "https://saintetienne.grelines.fr/flavicon.png",
    citySlug: "saint-etienne",
    cityName: "Saint-Étienne",
    lat: 45.4397,
    lon: 4.3872,
    network: "STAS · TER",
    headline: "GreLines Saint-Étienne — Horaires STAS en temps réel",
    description:
      "Tramways T1, T2, T3 et bus STAS : prochains passages à chaque arrêt, itinéraires et info-trafic en direct pour Saint-Étienne Métropole. Gratuit et sans compte.",
    sitelinks: ["Tramways STAS", "Bus", "Itinéraires", "Info-trafic"],
    keywords: [...TRANSIT, "stas", "chateaucreux", "bellevue", "geoffroy guichard"],
    lines: [["T1", "#00965E"], ["T2", "#E4007C"], ["T3", "#F7A600"], ["M1", "#009FE3"]],
    cover: { paper: "#0c2a22", ink: "#e6f2ec" },
  },
  {
    id: "grelines-clermont",
    advertiser: "GreLines",
    url: ref("https://clermontferrand.grelines.fr/"),
    displayUrl: "clermontferrand.grelines.fr",
    favicon: "https://clermontferrand.grelines.fr/flavicon.png",
    citySlug: "clermont-ferrand",
    cityName: "Clermont-Ferrand",
    lat: 45.7772,
    lon: 3.087,
    network: "T2C · TER",
    headline: "GreLines Clermont-Ferrand — Tram A et bus T2C en direct",
    description:
      "Ligne A du tram, lignes B et C et tout le réseau T2C : horaires en temps réel, itinéraires et perturbations à Clermont Auvergne Métropole. Gratuit, sans compte.",
    sitelinks: ["Tram A", "Lignes B et C", "Itinéraires", "Info-trafic"],
    keywords: [...TRANSIT, "t2c", "jaude", "inspire", "michelin"],
    lines: [["A", "#E2001A"], ["B", "#0090D4"], ["C", "#F29400"]],
    cover: { paper: "#2b1708", ink: "#f7ece1" },
  },
  {
    id: "grelines-nancy",
    advertiser: "GreLines",
    url: ref("https://nancy.grelines.fr/"),
    displayUrl: "nancy.grelines.fr",
    favicon: "https://nancy.grelines.fr/flavicon.png",
    citySlug: "nancy",
    cityName: "Nancy",
    lat: 48.6921,
    lon: 6.1844,
    network: "Stan · vélOstan'lib · Citiz",
    headline: "GreLines Nancy — Bus Stan et vélOstan'lib en temps réel",
    description:
      "Lignes Tempo et bus Stan, stations vélOstan'lib et Citiz : prochains passages, itinéraires et disponibilité en direct dans la Métropole du Grand Nancy.",
    sitelinks: ["Lignes Tempo", "vélOstan'lib", "Itinéraires", "Info-trafic"],
    keywords: [...TRANSIT, "stan", "tempo", "velostan", "velostanlib", "stanislas"],
    lines: [["T1", "#E3051B"], ["T2", "#0069B4"], ["T3", "#95C11F"], ["T4", "#F39200"], ["T5", "#8E4A97"]],
    cover: { paper: "#1d1433", ink: "#eee9f7" },
  },
];

export const NATIONAL = CAMPAIGNS[0];
