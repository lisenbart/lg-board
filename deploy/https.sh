#!/bin/bash
# Reverse-proxy board.lisenbart.games → local LG Board (port 43141).
set -euo pipefail
ROOT="${HOME}/lg-board"
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nginx certbot python3-certbot-nginx
sudo cp "$ROOT/deploy/nginx-board.conf" /etc/nginx/sites-available/board.lisenbart.games
sudo ln -sfn /etc/nginx/sites-available/board.lisenbart.games /etc/nginx/sites-enabled/board.lisenbart.games
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
if command -v ufw >/dev/null && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow 'Nginx Full'
fi
sudo certbot --nginx -d board.lisenbart.games --non-interactive --agree-tos -m dmytro@lisenbart.games --redirect
echo
echo "LG Board: https://board.lisenbart.games"
