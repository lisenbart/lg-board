#!/bin/bash
# Run on the Mac after deploy/mac-login.sh. Thin wrapper around ssh board.
set -euo pipefail
HOST="${LG_BOARD_SSH_HOST:-board}"

usage() {
  echo "Usage: deploy/vps.sh [shell|update|status|command…]" >&2
  echo "  shell    ssh board" >&2
  echo "  update   ssh board-update" >&2
  echo "  status   ssh board-status" >&2
  echo "  …        ssh board -- that command" >&2
}

cmd="${1:-shell}"
shift || true
case "$cmd" in
  -h|--help) usage; exit 0 ;;
  shell|ssh|"") exec ssh "$HOST" "$@" ;;
  update) exec ssh board-update ;;
  status) exec ssh board-status ;;
  *) exec ssh "$HOST" -- "$cmd" "$@" ;;
esac
