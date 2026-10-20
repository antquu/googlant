/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// icônes Lucide en SVG brut, pour les pins MapLibre (éléments DOM, pas de React)
import {
  Banknote, BedDouble, Beef, Beer, Bike, BookOpen, Building2, Cake, Car, Church, Clapperboard, Coffee, Croissant, Dumbbell, Fish,
  Flower2, Fuel, Gem, Glasses, GraduationCap, Home, Hospital, IceCreamCone, Landmark, Mail, MapPin, PawPrint, Pill, Pizza, Plane,
  Sandwich, Scissors, Shirt, ShoppingCart, Smartphone, Sofa, Stethoscope, Store, Trees, Utensils, Wine, Wrench, createElement, type IconNode,
} from "lucide";
import { placeIcon, type PlaceIcon } from "@/lib/places/icons";

const NODES: Record<PlaceIcon, IconNode> = {
  Banknote, BedDouble, Beef, Beer, Bike, BookOpen, Building2, Cake, Car, Church, Clapperboard, Coffee, Croissant, Dumbbell, Fish,
  Flower2, Fuel, Gem, Glasses, GraduationCap, Home, Hospital, IceCreamCone, Landmark, Mail, MapPin, PawPrint, Pill, Pizza, Plane,
  Sandwich, Scissors, Shirt, ShoppingCart, Smartphone, Sofa, Stethoscope, Store, Trees, Utensils, Wine, Wrench,
};

export function pinIcon(kind: string | undefined, size = 15): SVGElement {
  const el = createElement(NODES[placeIcon(kind)]);
  el.setAttribute("width", String(size));
  el.setAttribute("height", String(size));
  el.setAttribute("stroke-width", "2");
  el.setAttribute("aria-hidden", "true");
  return el;
}

// couleur du pin selon la famille de lieu, comme sur Google Maps
export function pinTone(kind: string | undefined): string {
  const i = placeIcon(kind);
  if (["Utensils", "Coffee", "Croissant", "Pizza", "Sandwich", "Cake", "IceCreamCone", "Beer", "Wine"].includes(i)) return "food";
  if (["ShoppingCart", "Store", "Shirt", "Beef", "Fish", "Smartphone", "Sofa", "Gem", "Glasses", "BookOpen", "Flower2"].includes(i)) return "shop";
  if (["Pill", "Hospital", "Stethoscope", "PawPrint"].includes(i)) return "health";
  if (["Landmark", "Church", "Clapperboard", "Trees", "GraduationCap"].includes(i)) return "culture";
  if (["BedDouble", "Plane"].includes(i)) return "stay";
  if (["Fuel", "Car", "Bike", "Banknote", "Mail", "Wrench", "Building2"].includes(i)) return "service";
  return "other";
}
