#!/usr/bin/env bash
# Googlant by antquu (github.com/antquu)
# SPDX-License-Identifier: GPL-3.0-or-later
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER="${APP_USER:-${SUDO_USER:-$(whoami)}}"
# SITE=0 : machine du crawler seulement (le site tourne ailleurs et interroge ce serveur d'index)
SITE="${SITE:-1}"

MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 3000 ]; then
  CRAWLER_CONCURRENCY=${CRAWLER_CONCURRENCY:-24}; CRAWLER_HEAP=384; WEB_HEAP=384; DB_CACHE=16
else
  CRAWLER_CONCURRENCY=${CRAWLER_CONCURRENCY:-48}; CRAWLER_HEAP=2048; WEB_HEAP=1024; DB_CACHE=64
fi
echo "Mémoire : ${MEM_MB} Mo → crawler ${CRAWLER_CONCURRENCY} requêtes simultanées, tas ${CRAWLER_HEAP} Mo"

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancez ce script avec sudo." >&2
  exit 1
fi

echo "==> Node.js 24"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> Dépendances et build (utilisateur $APP_USER)"
cd "$APP_DIR"
sudo -u "$APP_USER" npm ci --no-fund --no-audit
[ "$SITE" = "1" ] && sudo -u "$APP_USER" env NODE_OPTIONS=--max-old-space-size=1024 npm run build

NODE_BIN="$(command -v node)"

echo "==> Services systemd"
cat >/etc/systemd/system/googlant-web.service <<EOF
[Unit]
Description=Googlant — site
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=GOOGLANT_DB_CACHE_MB=$DB_CACHE
Environment="NODE_OPTIONS=--disable-warning=ExperimentalWarning --max-old-space-size=$WEB_HEAP"
ExecStart=$NODE_BIN $APP_DIR/node_modules/next/dist/bin/next start -p 3000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/googlant-crawler.service <<EOF
[Unit]
Description=Googlant — crawler permanent
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=GOOGLANT_DB_CACHE_MB=$DB_CACHE
Environment="NODE_OPTIONS=--disable-warning=ExperimentalWarning --max-old-space-size=$CRAWLER_HEAP"
ExecStart=$NODE_BIN $APP_DIR/node_modules/tsx/dist/cli.mjs crawler/cluster.ts --quiet --shards 1 --concurrency 40 --max-conns 40 --conn-rate 10 --night 00:30-05:45 --night-concurrency 150 --night-max-conns 150 --night-conn-rate 25
Restart=always
RestartSec=10
KillSignal=SIGINT
TimeoutStopSec=40
Nice=5

[Install]
WantedBy=multi-user.target
EOF

# index des commerces OpenStreetMap (suggestions de Googlant Maps), refait chaque dimanche
command -v osmium >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -qq osmium-tool
cat >/etc/systemd/system/googlant-pois.service <<EOF
[Unit]
Description=Googlant — index des commerces OpenStreetMap
After=network-online.target

[Service]
Type=oneshot
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=OSM_DIR=$APP_DIR/../osm
ExecStart=$APP_DIR/scripts/import-pois.sh europe/france
Nice=10
IOSchedulingClass=idle
EOF

cat >/etc/systemd/system/googlant-pois.timer <<EOF
[Unit]
Description=Googlant — mise à jour hebdomadaire des commerces

[Timer]
OnCalendar=Sun 04:00
Persistent=true
RandomizedDelaySec=30m

[Install]
WantedBy=timers.target
EOF

# serveur d'index autonome (API de recherche + chiffres en direct), sans Next.js
cat >/etc/systemd/system/googlant-index.service <<EOF
[Unit]
Description=Googlant — serveur d'index
After=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=PORT=3000
Environment=GOOGLANT_DB_CACHE_MB=$DB_CACHE
Environment="NODE_OPTIONS=--disable-warning=ExperimentalWarning --max-old-space-size=256"
ExecStart=$NODE_BIN $APP_DIR/node_modules/tsx/dist/cli.mjs --conditions=react-server crawler/index-server.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
if [ "$SITE" = "1" ]; then
  systemctl disable --now googlant-index 2>/dev/null || true
  systemctl enable --now googlant-web googlant-crawler googlant-pois.timer
else
  systemctl disable --now googlant-web 2>/dev/null || true
  systemctl enable --now googlant-index googlant-crawler googlant-pois.timer
fi

if [ "${TUNNEL:-0}" = "1" ]; then
  echo "==> Cloudflare Tunnel"
  if ! command -v cloudflared >/dev/null; then
    curl -fsSL -o /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    dpkg -i /tmp/cloudflared.deb
  fi
  cat >/etc/systemd/system/googlant-tunnel.service <<EOF
[Unit]
Description=Googlant — Cloudflare Tunnel (adresse publique temporaire *.trycloudflare.com)
After=googlant-web.service

[Service]
ExecStart=$(command -v cloudflared) tunnel --no-autoupdate --url http://localhost:3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now googlant-tunnel
  sleep 8
  echo "Adresse publique :"
  journalctl -u googlant-tunnel --no-pager | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1 || true
fi

echo
echo "Googlant tourne :"
echo "  site     : http://$(hostname -I | awk '{print $1}'):3000"
echo "  journaux : journalctl -fu googlant-crawler   ·   journalctl -fu googlant-web"
echo "  état     : sudo -u $APP_USER npm run db:stats"
echo "  commerces: systemctl start googlant-pois   (premier import, ~1 h pour la France)"
