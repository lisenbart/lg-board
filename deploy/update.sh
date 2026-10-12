#!/bin/bash
# Run on the VPS. Drops local file edits so git actually updates, then restarts the desk.
set -euo pipefail
ROOT="${HOME}/lg-board"
cd "$ROOT"
git fetch origin
git reset --hard origin/main
sudo systemctl restart lg-board
sleep 2
curl -sS http://127.0.0.1:43141/api/version
echo
echo "Hard-refresh the browser (Cmd+Shift+R). Title should show · 12 Oct"
