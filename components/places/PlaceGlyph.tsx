/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// icônes Lucide des types de lieux, en composants React (catégories, suggestions, fiches)
import {
  Banknote, BedDouble, Beef, Beer, Bike, BookOpen, Building2, Cake, Car, Church, Clapperboard, Coffee, Croissant, Dumbbell, Fish,
  Flower2, Fuel, Gem, Glasses, GraduationCap, Home, Hospital, IceCreamCone, Landmark, Mail, MapPin, PawPrint, Pill, Pizza, Plane,
  Sandwich, Scissors, Shirt, ShoppingCart, Smartphone, Sofa, Stethoscope, Store, Trees, Utensils, Wine, Wrench, type LucideIcon,
} from "lucide-react";
import { placeIcon, type PlaceIcon } from "@/lib/places/icons";

export const GLYPHS: Record<PlaceIcon, LucideIcon> = {
  Banknote, BedDouble, Beef, Beer, Bike, BookOpen, Building2, Cake, Car, Church, Clapperboard, Coffee, Croissant, Dumbbell, Fish,
  Flower2, Fuel, Gem, Glasses, GraduationCap, Home, Hospital, IceCreamCone, Landmark, Mail, MapPin, PawPrint, Pill, Pizza, Plane,
  Sandwich, Scissors, Shirt, ShoppingCart, Smartphone, Sofa, Stethoscope, Store, Trees, Utensils, Wine, Wrench,
};

export function PlaceGlyph({ kind, icon, size = 16, className }: { kind?: string; icon?: PlaceIcon; size?: number; className?: string }) {
  const Icon = GLYPHS[icon ?? placeIcon(kind)];
  return <Icon size={size} strokeWidth={1.9} className={className} aria-hidden />;
}
