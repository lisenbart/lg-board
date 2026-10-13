# Source of truth — VPS and studio URLs

## Board (live desk)

- URL: **https://board.lisenbart.games**
- Machine: OVH VPS `ubuntu@15.235.127.163` (`vps-1f923dde`)
- Repo on disk: `~/lg-board`, branch `studio`
- Process: systemd `lg-board` → `127.0.0.1:43141`

## Login from Dmytro’s Mac

Key file: `~/.ssh/lg_board_ovh`  
Public: `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPyqI/It38ySpokUwldQtW0yxrYARJFbmtmjF3El9AGr lg-board`

One-time (already done): `bash deploy/mac-login.sh` or the Host block in `deploy/ssh-config`.

Every time after that:

```bash
ssh board           # shell
ssh board-update    # git reset --hard origin/studio + restart
ssh board-status    # live build JSON
```

Do **not** use a password. Do **not** paste `lg-board-deploy` or any other key. That key is not on the VPS.

## Studio site (public door)

See `site/README.md`. Public face is **https://lisenbart.games** on Netlify. The board stays on this VPS. Do not serve the homepage from nginx on the desk machine.
