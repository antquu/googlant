/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const KIND: Record<string, string> = {
  bakery: "Boulangerie", pastry: "Pâtisserie", restaurant: "Restaurant", fast_food: "Restauration rapide", cafe: "Café", bar: "Bar", pub: "Pub",
  supermarket: "Supermarché", convenience: "Épicerie", pharmacy: "Pharmacie", doctors: "Médecin", doctor: "Médecin", dentist: "Dentiste",
  hospital: "Hôpital", clinic: "Clinique", hairdresser: "Coiffeur", bank: "Banque", atm: "Distributeur", hotel: "Hôtel", guest_house: "Chambre d'hôtes",
  hostel: "Auberge", butcher: "Boucherie", florist: "Fleuriste", books: "Librairie", car_repair: "Garage", fuel: "Station-service",
  charging_station: "Borne de recharge", cinema: "Cinéma", post_office: "Bureau de poste", tobacco: "Tabac", optician: "Opticien",
  clothes: "Vêtements", fitness_centre: "Salle de sport", museum: "Musée", library: "Bibliothèque", laundry: "Laverie", dry_cleaning: "Pressing",
  veterinary: "Vétérinaire", shoes: "Chaussures", mobile_phone: "Téléphonie", electronics: "Électronique", beauty: "Institut de beauté",
  jewelry: "Bijouterie", hardware: "Quincaillerie", furniture: "Ameublement", greengrocer: "Primeur", cheese: "Fromagerie", wine: "Caviste",
  chocolate: "Chocolatier", deli: "Traiteur", gift: "Cadeaux", toys: "Jouets", sports: "Sport", bicycle: "Vélos", car: "Concession auto",
  department_store: "Grand magasin", variety_store: "Bazar", pet: "Animalerie", photo: "Photo", travel_agency: "Agence de voyage",
};
const CUISINE: Record<string, string> = {
  pizza: "pizzeria", italian: "italien", french: "français", japanese: "japonais", sushi: "sushis", chinese: "chinois", indian: "indien",
  burger: "burgers", kebab: "kebab", thai: "thaï", vietnamese: "vietnamien", mexican: "mexicain", lebanese: "libanais", regional: "cuisine régionale",
  asian: "asiatique", crepe: "crêperie", korean: "coréen", turkish: "turc", moroccan: "marocain", vegan: "vegan", vegetarian: "végétarien",
  sandwich: "sandwichs", coffee_shop: "coffee shop", ramen: "ramen", greek: "grec", spanish: "espagnol", african: "africain", steak_house: "grill",
};

// types OpenStreetMap moins courants, pour ne jamais afficher « Townhall » ou « Place of worship »
const MORE: Record<string, string> = {
  townhall: "Mairie", police: "Police", social_facility: "Établissement social", place_of_worship: "Lieu de culte", school: "École",
  kindergarten: "École maternelle", college: "Lycée", university: "Université", community_centre: "Salle municipale", theatre: "Théâtre",
  arts_centre: "Centre culturel", nightclub: "Boîte de nuit", ice_cream: "Glacier", marketplace: "Marché", car_wash: "Lavage auto",
  bicycle_rental: "Location de vélos", car_rental: "Location de voitures", taxi: "Taxi", bus_station: "Gare routière", fire_station: "Pompiers",
  courthouse: "Tribunal", prison: "Prison", childcare: "Crèche", nursing_home: "Maison de retraite", driving_school: "Auto-école",
  attraction: "Attraction", viewpoint: "Point de vue", artwork: "Œuvre d'art", information: "Office de tourisme", camp_site: "Camping",
  apartment: "Appartement", chalet: "Chalet", motel: "Motel", gallery: "Galerie", zoo: "Zoo", theme_park: "Parc d'attractions",
  park: "Parc", playground: "Aire de jeux", sports_centre: "Centre sportif", swimming_pool: "Piscine", stadium: "Stade", golf_course: "Golf",
  garden: "Jardin", estate_agent: "Agence immobilière", company: "Entreprise", government: "Administration", insurance: "Assurance",
  lawyer: "Avocat", accountant: "Expert-comptable", architect: "Architecte", association: "Association", ngo: "Association",
  employment_agency: "Agence pour l'emploi", hairdresser: "Coiffeur", kiosk: "Kiosque", newsagent: "Presse", alcohol: "Cave à vins",
  beverages: "Boissons", seafood: "Poissonnerie", frozen_food: "Surgelés", farm: "Ferme", organic: "Bio", health_food: "Diététique",
  cosmetics: "Cosmétiques", perfumery: "Parfumerie", hairdresser_supply: "Coiffure", tailor: "Retouches", shoe_repair: "Cordonnier",
  locksmith: "Serrurier", computer: "Informatique", copyshop: "Reprographie", stationery: "Papeterie", art: "Galerie d'art",
  music: "Musique", musical_instrument: "Instruments de musique", video_games: "Jeux vidéo", second_hand: "Dépôt-vente", charity: "Boutique solidaire",
  funeral_directors: "Pompes funèbres", garden_centre: "Jardinerie", houseware: "Arts de la table", interior_decoration: "Décoration",
  kitchen: "Cuisines", bed: "Literie", carpet: "Tapis", paint: "Peinture", tiles: "Carrelage", trade: "Négoce", wholesale: "Grossiste",
  car_parts: "Pièces auto", tyres: "Pneus", motorcycle: "Motos", dentist: "Dentiste", physiotherapist: "Kinésithérapeute",
  psychotherapist: "Psychologue", nurse: "Infirmier", midwife: "Sage-femme", alternative: "Médecine douce", optometrist: "Opticien",
  hearing_aids: "Audioprothésiste", medical_supply: "Matériel médical", bureau_de_change: "Bureau de change", money_lender: "Crédit",
  post_box: "Boîte aux lettres", library: "Bibliothèque", internet_cafe: "Cybercafé", food_court: "Aire de restauration",
  biergarten: "Brasserie", bicycle_repair_station: "Réparation de vélos", car_sharing: "Autopartage", compressed_air: "Gonflage", dog_toilet: "Canisite",
  railway_station: "Gare", station: "Gare", tram_stop: "Arrêt de tram", bus_stop: "Arrêt de bus", public_bookcase: "Boîte à livres",
  shelter: "Abri", water_point: "Point d'eau", charging_station: "Borne de recharge", recycling: "Point de recyclage", toilets: "Toilettes", vending_machine: "Distributeur automatique", parking: "Parking", fuel: "Station-service",
};

/** Libellé déjà calculé (ex. « Place of worship » d'un ancien import) → français si on le connaît */
export function frenchKind(label: string): string {
  const key = label.toLowerCase().replace(/ /g, "_");
  return MORE[key] ?? KIND[key] ?? label;
}

export function categoryOf(tags: Record<string, string>): string {
  const kind = tags.amenity ?? tags.shop ?? tags.tourism ?? tags.leisure ?? tags.healthcare ?? tags.craft ?? "";
  const base = KIND[kind] ?? MORE[kind] ?? (kind ? kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Commerce");
  const cuisine = tags.cuisine?.split(";")[0];
  return cuisine && CUISINE[cuisine] && base.startsWith("Rest") ? `${base} · ${CUISINE[cuisine]}` : base;
}
