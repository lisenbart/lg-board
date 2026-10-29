#!/bin/bash
# Run on the VPS (ssh board-update). Pull studio, then re-exec this file so
# the restart/wait logic is the copy we just fetched — not the one already in memory.
set -euo pipefail
ROOT="${HOME}/lg-board"
cd "$ROOT"

LIVE_FILES=(
  data/db.json
  data/db.json.bak
  data/SP_MGX_check.xlsx
  data/SP_PLBL_check.xlsx
  data/mirror/SP_MGX_check.xlsx
  data/finance/SUPERPLAY_MGX_Calculator.xlsx
  data/finance/SUPERPLAY_Playable_Calculator.xlsx
  data/drive_packs.json
  data/drive_index.json
  data/drive_cache.json
  data/mirror/live_folders.json
  data/push_subs.json
  data/secrets/vapid.json
)
PRESERVE_FLAG="/tmp/lg-board-preserved"

preserve_live() {
  local stash="/tmp/lg-board-preserve-$$"
  rm -rf "$stash"
  mkdir -p "$stash"
  local copied=0
  for f in "${LIVE_FILES[@]}"; do
    if [[ -f "$ROOT/$f" ]]; then
      mkdir -p "$stash/$(dirname "$f")"
      cp -a "$ROOT/$f" "$stash/$f"
      copied=1
    fi
  done
  if [[ "$copied" == "1" ]]; then
    printf '%s\n' "$stash" > "$PRESERVE_FLAG"
  else
    rm -rf "$stash"
    rm -f "$PRESERVE_FLAG"
  fi
}

restore_preserved() {
  if [[ ! -f "$PRESERVE_FLAG" ]]; then
    return 0
  fi
  local stash
  stash="$(cat "$PRESERVE_FLAG")"
  if [[ -d "$stash" ]]; then
    for f in "${LIVE_FILES[@]}"; do
      if [[ -f "$stash/$f" ]]; then
        mkdir -p "$ROOT/$(dirname "$f")"
        cp -a "$stash/$f" "$ROOT/$f"
      fi
    done
    rm -rf "$stash"
  fi
}

ensure_pdf() {
  if command -v soffice >/dev/null 2>&1 || command -v libreoffice >/dev/null 2>&1; then
    return 0
  fi
  echo "Installing LibreOffice for invoice PDF…"
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y libreoffice-writer-nogui
}

if [[ "${1:-}" != "--restart-only" ]]; then
  bash "$ROOT/deploy/backup.sh" || true
  preserve_live
  git fetch origin
  git reset --hard origin/studio
  restore_preserved
  exec bash "$ROOT/deploy/update.sh" --restart-only
fi

PY="${ROOT}/.venv/bin/python"
if [[ ! -x "$PY" ]]; then
  PY="$(command -v python3)"
fi
if [[ ! -f "$PRESERVE_FLAG" ]]; then
  "$PY" "$ROOT/deploy/restore_workbooks.py" || true
fi
rm -f "$PRESERVE_FLAG"
"$PY" - <<'PY' || true
import json
from pathlib import Path
import excel_io
import finance_io
db = json.loads(Path("data/db.json").read_text(encoding="utf-8"))
ym = str((db.get("meta") or {}).get("month") or "2026-10")
excel_io.write_month(db, ym)
print("[update] MGX check seats rewritten", flush=True)
try:
    finance_io.write_month(db, ym)
    print("[update] MGX calculator seats rewritten", flush=True)
except Exception as e:
    print(f"[update] calculator seats: {e}", flush=True)
PY

"$PY" -m pip install -q -r "$ROOT/requirements.txt" || true

ensure_pdf
sudo systemctl restart lg-board
ok=""
for _ in $(seq 1 20); do
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
