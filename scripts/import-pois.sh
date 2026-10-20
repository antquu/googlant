#!/usr/bin/env bash
# Googlant by antquu (github.com/antquu)
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Index des commerces OpenStreetMap pour les suggestions de Googlant Maps.
# Usage : scripts/import-pois.sh [région Geofabrik, ex. europe/france]
# Peu de mémoire nécessaire (osmium lit le fichier en flux), compter ~5 Go de disque pour la France.
set -euo pipefail

REGION=${1:-europe/france}
APP_DIR=$(cd "$(dirname "$0")/.." && pwd)
WORK=${OSM_DIR:-$APP_DIR/../osm}
NAME=$(basename "$REGION")
mkdir -p "$WORK"
cd "$WORK"

if [ ! -f "$NAME-latest.osm.pbf" ] || [ -n "$(find "$NAME-latest.osm.pbf" -mtime +6)" ]; then
  echo "téléchargement de $REGION…"
  curl -sSL -o "$NAME-latest.osm.pbf.part" "https://download.geofabrik.de/$REGION-latest.osm.pbf"
  mv "$NAME-latest.osm.pbf.part" "$NAME-latest.osm.pbf"
fi

echo "filtrage des commerces et lieux…"
osmium tags-filter "$NAME-latest.osm.pbf" \
  nwr/shop nwr/amenity nwr/tourism nwr/leisure nwr/healthcare nwr/craft nwr/office \
  --overwrite -o pois.osm.pbf

echo "import dans data/pois.db…"
osmium export pois.osm.pbf -f geojsonseq --geometry-types=point,polygon -a type,id -i sparse_file_array -O -o - \
  | node --disable-warning=ExperimentalWarning "$APP_DIR/node_modules/tsx/dist/cli.mjs" "$APP_DIR/crawler/import-pois.ts" "$APP_DIR/data/pois.db"

rm -f pois.osm.pbf
