#!/bin/bash
# Run on the studio VPS after: git clone -b studio https://github.com/lisenbart/lg-board.git ~/lg-board
set -euo pipefail
ROOT="${HOME}/lg-board"
cd "$ROOT"
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y libreoffice-writer-nogui
sudo cp deploy/lg-board.service /etc/systemd/system/lg-board.service
sudo systemctl daemon-reload
sudo systemctl enable --now lg-board
sudo systemctl --no-pager --full status lg-board
echo
echo "LG Board: http://$(hostname -I | awk '{print $1}'):43141"
