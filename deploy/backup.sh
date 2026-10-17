#!/bin/bash
# Snapshot live desk files. Safe to run anytime: ssh board 'bash ~/lg-board/deploy/backup.sh'
# Also runs at the start of board-update.
set -euo pipefail
ROOT="${HOME}/lg-board"
DEST_ROOT="${HOME}/lg-board-backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${DEST_ROOT}/${STAMP}"

mkdir -p "$DEST"
cd "$ROOT"

copy_if() {
  local src="$1"
  local rel="$2"
  if [[ -e "$src" ]]; then
    mkdir -p "$DEST/$(dirname "$rel")"
    cp -a "$src" "$DEST/$rel"
  fi
}

copy_if "data/db.json" "data/db.json"
copy_if "data/SP_MGX_check.xlsx" "data/SP_MGX_check.xlsx"
copy_if "data/SP_PLBL_check.xlsx" "data/SP_PLBL_check.xlsx"
copy_if "data/mirror/SP_MGX_check.xlsx" "data/mirror/SP_MGX_check.xlsx"
copy_if "data/finance/SUPERPLAY_MGX_Calculator.xlsx" "data/finance/SUPERPLAY_MGX_Calculator.xlsx"
copy_if "data/drive_packs.json" "data/drive_packs.json"
copy_if "data/drive_index.json" "data/drive_index.json"
copy_if "data/mirror/live_folders.json" "data/mirror/live_folders.json"

keep=20
if [[ -d "$DEST_ROOT" ]]; then
  mapfile -t old < <(ls -1dt "$DEST_ROOT"/20* 2>/dev/null | tail -n +$((keep + 1)) || true)
  if ((${#old[@]})); then
    rm -rf "${old[@]}"
  fi
fi

echo "backup $DEST"
ls -la "$DEST/data" 2>/dev/null || ls -la "$DEST"
