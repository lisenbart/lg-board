#!/bin/bash
# Run once on Dmytro's Mac. Wires ~/.ssh/config so login is always:
#   ssh board
#   ssh board-update
#   ssh board-status
set -euo pipefail

KEY="${HOME}/.ssh/lg_board_ovh"
PUB="${KEY}.pub"
CONFIG="${HOME}/.ssh/config"

if [[ ! -f "$KEY" ]]; then
  echo "Missing $KEY — the VPS key is not on this Mac." >&2
  exit 1
fi
chmod 600 "$KEY"

if [[ -f "$PUB" ]] && ! grep -q "IPyqI/It38ySpokUwldQtW0yxrYARJFbmtmjF3El9AGr" "$PUB"; then
  echo "$PUB is not the VPS key (lg-board). Refusing to overwrite ssh config." >&2
  cat "$PUB" >&2
  exit 1
fi

if [[ ! -f "$PUB" ]]; then
  ssh-keygen -y -f "$KEY" > "$PUB"
  chmod 644 "$PUB"
fi

mkdir -p "${HOME}/.ssh"
chmod 700 "${HOME}/.ssh"

MARKER="Host board lg-board vps"
if [[ -f "$CONFIG" ]] && grep -q "^Host board" "$CONFIG"; then
  echo "ssh config already has Host board"
else
  if [[ -f "$CONFIG" ]]; then
    cp "$CONFIG" "${CONFIG}.bak.$(date +%Y%m%d%H%M%S)"
  fi
  {
    echo
    echo "# LG Board VPS — added by deploy/mac-login.sh"
    echo "$MARKER"
    echo "  HostName 15.235.127.163"
    echo "  User ubuntu"
    echo "  IdentityFile ~/.ssh/lg_board_ovh"
    echo "  IdentitiesOnly yes"
    echo "  ServerAliveInterval 30"
    echo "  ServerAliveCountMax 4"
    echo
    echo "Host board-update"
    echo "  HostName 15.235.127.163"
    echo "  User ubuntu"
    echo "  IdentityFile ~/.ssh/lg_board_ovh"
    echo "  IdentitiesOnly yes"
    echo "  RemoteCommand bash ~/lg-board/deploy/update.sh"
    echo "  RequestTTY no"
    echo
    echo "Host board-status"
    echo "  HostName 15.235.127.163"
    echo "  User ubuntu"
    echo "  IdentityFile ~/.ssh/lg_board_ovh"
    echo "  IdentitiesOnly yes"
    echo "  RemoteCommand curl -sS http://127.0.0.1:43141/api/version && echo && sudo systemctl --no-pager --full status lg-board"
    echo "  RequestTTY no"
  } >> "$CONFIG"
  chmod 600 "$CONFIG"
  echo "Wrote Host board / board-update / board-status to $CONFIG"
fi

echo "Checking VPS…"
ssh -o BatchMode=yes -o ConnectTimeout=15 board 'echo OK; hostname; curl -sS http://127.0.0.1:43141/api/version; echo'
echo
echo "From now on:"
echo "  ssh board           # shell"
echo "  ssh board-update    # deploy studio + restart"
echo "  ssh board-status    # live build"
