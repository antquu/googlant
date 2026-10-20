/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CITIES, type City } from "../geo/cities";
import { fold } from "../search/tokenizer";

export interface PlaceCategory {
  id: string;
  label: string;
  words: string[];
  osm: string[];
}

export const CATEGORIES: PlaceCategory[] = [
  { id: "boulangerie", label: "Boulangeries", words: ["boulangerie", "boulangeries", "boulanger", "patisserie", "patisseries", "viennoiserie"], osm: ['["shop"="bakery"]', '["shop"="pastry"]'] },
  { id: "pizzeria", label: "Pizzerias", words: ["pizza", "pizzas", "pizzeria", "pizzerias"], osm: ['["amenity"="restaurant"]["cuisine"~"pizza"]', '["amenity"="fast_food"]["cuisine"~"pizza"]'] },
  { id: "fastfood", label: "Restauration rapide", words: ["fast food", "fast-food", "kebab", "kebabs", "burger", "burgers", "tacos", "snack", "mcdonald", "mcdo", "sandwich"], osm: ['["amenity"="fast_food"]'] },
  { id: "sushi", label: "Restaurants japonais", words: ["sushi", "sushis", "japonais", "ramen"], osm: ['["amenity"="restaurant"]["cuisine"~"sushi|japanese|ramen"]'] },
  { id: "restaurant", label: "Restaurants", words: ["restaurant", "restaurants", "resto", "restos", "manger", "diner", "dejeuner", "brasserie", "bistrot", "creperie"], osm: ['["amenity"="restaurant"]'] },
  { id: "cafe", label: "Cafés", words: ["cafe", "cafes", "coffee", "salon de the"], osm: ['["amenity"="cafe"]'] },
  { id: "bar", label: "Bars", words: ["bar", "bars", "pub", "pubs", "biere", "cocktail", "cocktails"], osm: ['["amenity"="bar"]', '["amenity"="pub"]'] },
  { id: "supermarche", label: "Supermarchés", words: ["supermarche", "supermarches", "supermarket", "courses", "epicerie", "superette", "hypermarche", "carrefour", "leclerc", "lidl", "intermarche", "auchan", "monoprix", "franprix"], osm: ['["shop"="supermarket"]', '["shop"="convenience"]'] },
  { id: "pharmacie", label: "Pharmacies", words: ["pharmacie", "pharmacies", "pharmacien", "pharmacy"], osm: ['["amenity"="pharmacy"]'] },
  { id: "medecin", label: "Médecins", words: ["medecin", "medecins", "docteur", "generaliste", "cabinet medical"], osm: ['["amenity"="doctors"]', '["healthcare"="doctor"]'] },
  { id: "dentiste", label: "Dentistes", words: ["dentiste", "dentistes", "dentaire"], osm: ['["amenity"="dentist"]'] },
  { id: "hopital", label: "Hôpitaux", words: ["hopital", "hopitaux", "urgences", "clinique"], osm: ['["amenity"="hospital"]', '["amenity"="clinic"]'] },
  { id: "coiffeur", label: "Coiffeurs", words: ["coiffeur", "coiffeurs", "coiffure", "barbier", "barber"], osm: ['["shop"="hairdresser"]'] },
  { id: "banque", label: "Banques", words: ["banque", "banques", "agence bancaire"], osm: ['["amenity"="bank"]'] },
  { id: "dab", label: "Distributeurs", words: ["distributeur", "distributeurs", "dab", "retrait", "atm"], osm: ['["amenity"="atm"]', '["amenity"="bank"]["atm"="yes"]'] },
  { id: "hotel", label: "Hôtels", words: ["hotel", "hotels", "hebergement", "auberge", "chambre d'hote"], osm: ['["tourism"="hotel"]', '["tourism"="guest_house"]', '["tourism"="hostel"]'] },
  { id: "boucherie", label: "Boucheries", words: ["boucherie", "boucheries", "boucher", "charcuterie"], osm: ['["shop"="butcher"]'] },
  { id: "fleuriste", label: "Fleuristes", words: ["fleuriste", "fleuristes", "fleurs"], osm: ['["shop"="florist"]'] },
  { id: "librairie", label: "Librairies", words: ["librairie", "librairies", "livres", "bd"], osm: ['["shop"="books"]'] },
  { id: "garage", label: "Garages", words: ["garage", "garages", "mecanicien", "garagiste", "controle technique"], osm: ['["shop"="car_repair"]'] },
  { id: "essence", label: "Stations-service", words: ["station essence", "station service", "carburant", "essence", "gasoil"], osm: ['["amenity"="fuel"]'] },
  { id: "recharge", label: "Bornes de recharge", words: ["borne de recharge", "bornes de recharge", "recharge electrique", "borne electrique"], osm: ['["amenity"="charging_station"]'] },
  { id: "cinema", label: "Cinémas", words: ["cinema", "cinemas", "cine", "film"], osm: ['["amenity"="cinema"]'] },
  { id: "poste", label: "Bureaux de poste", words: ["la poste", "bureau de poste", "poste"], osm: ['["amenity"="post_office"]'] },
  { id: "tabac", label: "Bureaux de tabac", words: ["tabac", "tabacs", "buraliste"], osm: ['["shop"="tobacco"]'] },
  { id: "opticien", label: "Opticiens", words: ["opticien", "opticiens", "lunettes"], osm: ['["shop"="optician"]'] },
  { id: "vetements", label: "Magasins de vêtements", words: ["vetements", "vetement", "habits", "pret-a-porter", "mode"], osm: ['["shop"="clothes"]'] },
  { id: "sport", label: "Salles de sport", words: ["salle de sport", "fitness", "musculation", "gym", "crossfit"], osm: ['["leisure"="fitness_centre"]'] },
  { id: "musee", label: "Musées", words: ["musee", "musees", "exposition"], osm: ['["tourism"="museum"]'] },
  { id: "bibliotheque", label: "Bibliothèques", words: ["bibliotheque", "bibliotheques", "mediatheque"], osm: ['["amenity"="library"]'] },
  { id: "laverie", label: "Laveries", words: ["laverie", "laveries", "pressing"], osm: ['["shop"="laundry"]', '["shop"="dry_cleaning"]'] },
  { id: "veterinaire", label: "Vétérinaires", words: ["veterinaire", "veterinaires", "veto"], osm: ['["amenity"="veterinary"]'] },
  { id: "commerces", label: "Commerces", words: ["commerce", "commerces", "magasin", "magasins", "boutique", "boutiques", "shopping"], osm: ['["shop"]'] },
];

const NEARBY = ["pres de moi", "autour de moi", "a proximite", "a cote", "ouvert maintenant", "proche", "le plus proche"];

export interface LocalIntent {
  category: PlaceCategory | null;
  city: City | null;
  nearby: boolean;
  rest: string;
}

export function detectLocal(query: string): LocalIntent {
  let q = ` ${fold(query).replace(/[^a-z0-9' -]+/g, " ").replace(/\s+/g, " ").trim()} `;
  const nearby = NEARBY.some((n) => q.includes(` ${n} `));
  for (const n of NEARBY) q = q.replace(` ${n} `, " ");

  let city: City | null = null;
  for (const c of CITIES) {
    const names = [fold(c.name), ...(c.aliases ?? [])];
    const hit = names.find((a) => q.includes(` ${a} `));
    if (hit) {
      city = c;
      q = q.replace(` ${hit} `, " ");
      break;
    }
  }

  let category: PlaceCategory | null = null;
  let best = 0;
  for (const cat of CATEGORIES)
    for (const w of cat.words)
      if (q.includes(` ${w} `) && w.length > best) {
        best = w.length;
        category = cat;
      }
  if (category) for (const w of category.words) q = q.replace(` ${w} `, " ");

  const rest = q.replace(/\b(a|au|aux|de|des|du|la|le|les|en|dans|sur|pour|ouvert|ouverte|ouverts)\b/g, " ").replace(/\s+/g, " ").trim();
  return { category, city, nearby, rest };
}
