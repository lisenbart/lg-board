#!/bin/bash
# Run on the VPS (ssh board-update). Drops local file edits so git actually updates, then restarts the desk.
set -euo pipefail
ROOT="${HOME}/lg-board"
cd "$ROOT"
git fetch origin
git reset --hard origin/studio
sudo systemctl restart lg-board
ok=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if out="$(curl -fsS --max-time 2 http://127.0.0.1:43141/api/version 2>/dev/null)"; then
    printf '%s\n' "$out"
    ok=1
    break
  fi
  sleep 1
done
if [[ -z "$ok" ]]; then
  echo "lg-board did not answer on :43141" >&2
  sudo systemctl --no-pager --full status lg-board >&2 || true
  sudo journalctl -u lg-board -n 40 --no-pager >&2 || true
  exit 1
fi
echo
echo "Hard-refresh the browser (Cmd+Shift+R)."
