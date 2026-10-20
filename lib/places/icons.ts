/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Icône Lucide d'un type de lieu ("Boulangerie", "Pharmacie"...), pour les catégories,
 * les suggestions et les pins de Googlant Maps.
 */

export type PlaceIcon =
  | "Utensils" | "Coffee" | "Croissant" | "ShoppingCart" | "Pill" | "BedDouble" | "Wine" | "Landmark" | "Fuel" | "Banknote"
  | "Shirt" | "Scissors" | "Stethoscope" | "Clapperboard" | "BookOpen" | "Dumbbell" | "Flower2" | "Beef" | "Mail" | "Church"
  | "Trees" | "Store" | "MapPin" | "GraduationCap" | "Hospital" | "Car" | "Beer" | "Pizza" | "IceCreamCone" | "Sandwich"
  | "Smartphone" | "Bike" | "Wrench" | "Sofa" | "Gem" | "Glasses" | "PawPrint" | "Plane" | "Cake" | "Fish" | "Building2" | "Home";

// mots du type de lieu (en minuscules, sans accents) -> icône ; le premier qui correspond gagne
const RULES: [RegExp, PlaceIcon][] = [
  [/pizz/, "Pizza"],
  [/boulang|pain/, "Croissant"],
  [/patiss|chocolat|confis/, "Cake"],
  [/glac/, "IceCreamCone"],
  [/restauration rapide|fast|sandwich|kebab|burger/, "Sandwich"],
  [/restau|brasserie|creperie|traiteur|cuisine/, "Utensils"],
  [/cafe|coffee|salon de the/, "Coffee"],
  [/pub|biere/, "Beer"],
  [/bar|cave|caviste|vin/, "Wine"],
  [/supermarch|hypermarch|epicerie|primeur|superette|alimentation|fromager/, "ShoppingCart"],
  [/boucher|charcut/, "Beef"],
  [/poisson/, "Fish"],
  [/pharmac/, "Pill"],
  [/hopital|clinique|urgence/, "Hospital"],
  [/medecin|dentiste|kine|sante|infirm|laboratoire|veterinaire/, "Stethoscope"],
  [/animal/, "PawPrint"],
  [/hotel|chambre|auberge|gite|camping|hebergement/, "BedDouble"],
  [/musee|galerie|monument|chateau|patrimoine|mairie|banque/, "Landmark"],
  [/station|carburant|essence/, "Fuel"],
  [/distributeur|bureau de change/, "Banknote"],
  [/vetement|mode|chaussure|habill/, "Shirt"],
  [/coiff|beaute|barbier|esthetique|onglerie/, "Scissors"],
  [/cinema|theatre|spectacle/, "Clapperboard"],
  [/librair|bibliotheque|presse|tabac/, "BookOpen"],
  [/sport|fitness|salle de|piscine|gym/, "Dumbbell"],
  [/fleur|jardin/, "Flower2"],
  [/poste|courrier/, "Mail"],
  [/eglise|cathedrale|chapelle|culte|mosquee|synagogue|temple/, "Church"],
  [/parc|square|foret|nature/, "Trees"],
  [/ecole|college|lycee|universite|formation/, "GraduationCap"],
  [/garage|auto|voiture|parking|location de voiture/, "Car"],
  [/velo|cycle/, "Bike"],
  [/telephon|informatique|electronique/, "Smartphone"],
  [/bricolage|quincaillerie|reparation|artisan|plomb|electricien/, "Wrench"],
  [/meuble|ameublement|decoration/, "Sofa"],
  [/bijou|horloger/, "Gem"],
  [/opticien|lunettes/, "Glasses"],
  [/voyage|aeroport/, "Plane"],
  [/bureau|entreprise|agence|immobilier|police|gendarm|pompier|tribunal|administration|prefecture/, "Building2"],
  [/adresse|maison/, "Home"],
  [/commerce|magasin|boutique|centre commercial|bazar|cadeau|jouet/, "Store"],
];

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function placeIcon(kind: string | undefined | null): PlaceIcon {
  const k = fold(kind ?? "");
  for (const [re, icon] of RULES) if (re.test(k)) return icon;
  return "MapPin";
}

/** Suggestions dont le nom commence par ce qu'on a tapé d'abord (gare, musée...), puis les autres dans leur ordre */
export function byTypedPrefix<T extends { label: string }>(list: T[], typed: string): T[] {
  const t = fold(typed.trim());
  const rank = (s: T) => (fold(s.label).startsWith(t) ? 0 : 1);
  return list.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map((x) => x.s);
}
