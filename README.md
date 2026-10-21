# Googlant

Un moteur de recherche fait maison : mon propre crawler, mon propre index, mon propre classement, et un site Next.js en dark mode.

Je voulais comprendre comment marche un moteur de recherche "en vrai", pas juste appeler une API. Au final, il y a un crawler qui tourne 24h/24 sur une petite VM chez moi, un site hébergé sur Vercel qui l'interroge, une carte façon Google Maps avec itinéraires, et une fiche établissement quand on cherche un commerce.

> Projet perso d'étudiant, pas un produit. Ça marche bien pour un index de quelques dizaines de milliers de pages, mais ça ne remplace évidemment pas Google 🙂

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![React](https://img.shields.io/badge/React-19-149eca) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6) ![Go](https://img.shields.io/badge/Go-Colly-00add8) ![SQLite](https://img.shields.io/badge/SQLite-FTS5-003b57) ![Licence](https://img.shields.io/badge/licence-GPL--3.0-blue)

## Ce que ça fait

**Recherche**
- Index maison avec correction des fautes (pyhton devient python) et suggestions pendant la frappe.
- Les opérateurs de Google : `"phrase exacte"`, `-mot`, `site:` / `-site:`, `filetype:pdf`, `intitle:`, `inurl:`, `lang:en`, `after:2025-01`, `before:2024`. Le menu "Outils" les remplit pour toi.
- Onglets Tout, Images, Maps, Actualités. Un bandeau d'images au milieu des résultats, les PDF marqués comme tels, et un bouton "Charger plus" au lieu des pages.
- Un "Aperçu IA" en haut des résultats, comme sur Google : Gemini résume les meilleures pages de l'index en citant ses sources. Facultatif (clé gratuite `GEMINI_API_KEY`), et gardé en cache pour ne pas exploser le quota.
- Si tu cherches "google" ou "bing", Googlant te propose simplement d'y aller.

**Googlant Maps** (`/maps`)
- Carte plein écran avec deux onglets : Explorer et Itinéraire.
- Suggestions de commerces, adresses et villes pendant la frappe. Les commerces du quartier apparaissent en zoomant, avec une icône par type.
- Fiches avec horaires, téléphone et photos (Wikimedia, Wikidata, site du commerce), sans API payante.
- Itinéraires en transports en commun avec le moteur de [GreLines](https://www.grelines.fr), mon autre projet. Le calcul se lance tout seul dès que départ et arrivée sont choisis.

**Le reste**
- Chiffres en direct en bas de page (pages, sites, pages/minute), sans recharger.
- Pas de compte, pas de pistage. Un bandeau cookies, et si on refuse, la position n'est jamais gardée.
- Résultats sponsorisés pour GreLines, choisis selon la recherche et la ville, sans profilage, toujours marqués "Sponsorisé".
- Aperçu soigné quand on partage un lien (iMessage, Discord, X…), et installable sur le téléphone comme une appli (icône G).

Côté design, je me suis beaucoup inspiré de [Grokipedia](https://grokipedia.com) : fond quasi noir, titres en serif (Newsreader), livres en 3D qui flottent et font un tour sur eux-mêmes, étagère dont les livres sortent quand on passe dessus.

## Comment c'est organisé

```
navigateur ──► site Next.js (Vercel) ──► HTTPS + jeton ──► serveur d'index (ma VM, chez moi)
    │                                                         ├─ crawler (Go + Node)
    └──────────── chiffres en direct ───────────────────────►├─ index SQLite (pages)
                                                              └─ index des commerces (OpenStreetMap)
```

- **Sur Vercel** : seulement le site. Il n'a aucune base, il demande tout au serveur d'index.
- **Chez moi** (une VM Proxmox, 4 cœurs, 2,6 Go de RAM) : le crawler, les bases SQLite et un petit serveur d'index sans Next.js (`crawler/index-server.ts`).
- **Entre les deux** : Tailscale Funnel publie le serveur d'index sur une adresse HTTPS fixe en `*.ts.net`, sans ouvrir de port sur la box. C'est gratuit.

Limite évidente : si la VM ou la box s'éteint, les recherches ne marchent plus (le site affiche "index injoignable").

## Le crawler

C'est la partie qui m'a pris le plus de temps. Il garde sa file d'attente dans la base (table `frontier`), donc on peut le couper et le relancer sans rien perdre.

Il est en deux morceaux qui discutent par l'entrée/sortie standard, une ligne JSON par page :

- **le moteur Go** (`crawler-go/`, avec [Colly](https://github.com/gocolly/colly)) télécharge les pages, vérifie `robots.txt`, détecte l'encodage et lit le HTML ou les PDF ;
- **Node** (`crawler/daemon.ts`) choisit quoi visiter et écrit dans l'index. C'est lui qui découpe les mots, pour que ce soit exactement le même découpage qu'à la recherche.

Quelques règles :

- Il respecte `robots.txt` et `Crawl-delay`, et ne fait jamais deux requêtes en même temps sur un même site.
- Il pioche quelques pages sur des milliers de sites à la fois. Sinon il passe son temps à attendre la politesse d'un même site.
- Il repasse sur les pages déjà vues : plus souvent si elles changent, de moins en moins sinon (de 1 h à 30 jours).
- Les 404 sont supprimées, les doublons ignorés, et il ne garde que le français et l'anglais.
- Les logos, icônes et bandeaux ne sont pas gardés comme images.
- Quand quelqu'un propose un site ("Un site manque ?" sur l'accueil), il lit ses sitemaps et lance [Katana](https://github.com/projectdiscovery/katana) dessus pour trouver les pages cachées dans le JavaScript.

**Attention à la box.** J'ai appris à mes dépens qu'une Livebox ne supporte pas 1 500 connexions ouvertes en même temps : elle sature et plus rien ne marche dans la maison. Du coup :

- le moteur Go a des plafonds qu'il ne dépasse jamais : 150 connexions ouvertes et 25 nouvelles par seconde ;
- des mini speedtests (ping et petit téléchargement) tournent en continu, et si la connexion rame, le crawler ralentit tout seul ;
- en journée il reste raisonnable (40 à 140 connexions). De 00:30 à 05:45, quand tout le monde dort, il a le droit d'aller plus vite.

Résultat : entre 450 et 750 pages par minute en journée, sans gêner personne.

## Le classement

Chaque page est stockée dans une table FTS5 en 5 champs, déjà passés dans mon tokenizer (minuscules, sans accents, sans mots vides, racinisation très simple). Le score, en gros :

```
score = BM25 (titre ×3, URL ×2.2, intertitres ×1.7, description ×1.4, texte ×1)
      × (part des mots de la requête trouvés)²
      × (1 + 0.6 × PageRank)
      × quelques bonus : titre exact, la requête est le nom du site, page qui parle de ta ville
```

Ensuite, un peu de diversité : au-delà de 2 résultats d'un même site, les suivants sont pénalisés. Le PageRank est recalculé toutes les 15 minutes dans un processus à part.

## Lancer le projet en local

Il faut Node 22.13 ou plus récent.

```bash
npm install
cp .env.example .env.local
npm run dev        # le site sur http://localhost:3000
npm run crawler    # le crawler, dans un deuxième terminal
```

Sans serveur d'index, le site utilise une base locale remplie avec un échantillon (`data/seed.jsonl.gz`, ~3 800 pages), donc il marche tout de suite.

Le crawler est bien plus rapide avec son moteur Go (Go 1.22+). Le binaire arrive dans `bin/` et le crawler l'utilise tout seul :

```bash
npm run crawler:build                            # pour la machine courante
GOOS=linux GOARCH=amd64 npm run crawler:build    # pour un serveur Linux
```

Commandes utiles :

```bash
npm run db:stats                   # pages, sites, URLs en attente
npm run search -- "tramway lyon"   # tester le classement dans le terminal
```

## Installer le crawler sur un serveur

Testé sur Ubuntu 26.04 :

```bash
sudo APP_USER=googlant SITE=0 bash scripts/install-linux.sh
```

Le script installe Node, crée les services systemd (`googlant-index`, `googlant-crawler`, et l'import hebdomadaire des commerces `googlant-pois.timer`) et adapte les réglages à la RAM de la machine. Le premier import des commerces se lance avec `sudo systemctl start googlant-pois` (environ 1 h pour la France).

Pour publier le serveur d'index avec Tailscale :

```bash
curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up
sudo tailscale funnel --bg --set-path /api/index http://127.0.0.1:3000/api/index
sudo tailscale funnel --bg --set-path /api/live http://127.0.0.1:3000/api/live
```

Puis mettre un jeton secret dans `GOOGLANT_INDEX_TOKEN`, dans le `.env.local` du serveur.

## Déployer le site sur Vercel

1. Importer le dépôt GitHub dans Vercel (le framework Next.js est détecté tout seul).
2. Ajouter les variables d'environnement :

| Variable | Valeur |
| --- | --- |
| `GOOGLANT_INDEX_URL` | l'adresse Funnel, ex. `https://monserveur.ts.net` |
| `GOOGLANT_INDEX_TOKEN` | le même jeton que sur le serveur |
| `NEXT_PUBLIC_LIVE_URL` | la même adresse Funnel (chiffres en direct) |
| `NEXT_PUBLIC_MAP_STYLE_URL` | facultatif : style de carte MapTiler |
| `GOOGLE_SITE_VERIFICATION` | facultatif : jeton de la Google Search Console |
| `GEMINI_API_KEY` | facultatif : clé Google AI Studio pour l'aperçu IA |

3. Déployer. Le site est servi depuis Paris (`vercel.json`), au plus près du serveur d'index. Les chiffres en direct ne passent pas par Vercel, ça économise la bande passante gratuite.

Pour apparaître sur Google : `robots.txt` et `sitemap.xml` sont générés automatiquement. Il reste à ajouter le site dans la [Google Search Console](https://search.google.com/search-console) et à y envoyer le sitemap.

## Organisation du code

```
app/            pages Next.js (accueil, recherche, maps, préférences) et routes API
components/     interface : livres 3D, barre de recherche, résultats, cartes…
crawler/        crawler (file et indexation), serveur d'index, PDF, outils de la base
crawler-go/     moteur de crawl en Go (Colly) : téléchargement et lecture des pages
lib/            index SQLite, classement, commerces, itinéraires, annonces
scripts/        installation Linux (systemd), Windows (pm2), import des commerces, build Go
```

## Ce que j'aimerais ajouter

- un vrai stemmer français (le mien est très basique)
- découper l'index sur plusieurs machines quand il deviendra trop gros pour SQLite
- détecter le spam et les fermes de contenu
- un rendu JavaScript (navigateur headless) pour les sites 100 % JS, quand j'aurai une machine plus grosse

## Crédits

- Design inspiré de [Grokipedia](https://grokipedia.com)
- Polices [Inter](https://rsms.me/inter/) et [Newsreader](https://fonts.google.com/specimen/Newsreader), icônes [Lucide](https://lucide.dev)
- Données cartographiques © les contributeurs [OpenStreetMap](https://www.openstreetmap.org/copyright), adresses de l'[IGN](https://geoservices.ign.fr)
- Photos des lieux : [Wikimedia Commons](https://commons.wikimedia.org) et [Wikidata](https://www.wikidata.org)
- Les pages indexées appartiennent à leurs auteurs, le site n'en affiche que de courts extraits

## Licence

Googlant est distribué sous licence [GNU GPL v3](LICENSE) (ou toute version ultérieure). Vous pouvez le réutiliser et le modifier, à condition de publier vos modifications sous la même licence.
