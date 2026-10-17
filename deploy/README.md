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
ssh board-update    # backup live Excel/db, keep those files across git reset, restart
ssh board-status    # live build + Drive + PDF engine + last backup
ssh board 'bash ~/lg-board/deploy/backup.sh'   # extra snapshot, no restart
```

Do **not** use a password. Do **not** paste `lg-board-deploy` or any other key. That key is not on the VPS.

Live files that must survive deploy: `data/db.json`, `data/SP_MGX_check.xlsx`, calculator, Drive pack cache. `board-update` copies them aside before `git reset` and puts them back. If this is the first run of that new script, it pulls Excel + calculator from Drive instead.

The board is the source of truth. Excel is written from the portal in the background after Save — it does not create tasks and does not block login. `ssh board-status` should show `"build": "2026-10-17q"` after update.

## Studio site (public door)

See `site/README.md`. Public face is **https://lisenbart.games** on Netlify: Studio door (`/?door=studio`) and Client door (`/hours`). The board stays on this VPS. Do not serve the homepage from nginx on the desk machine. `ssh board-status` should show `"build": "2026-10-17q"` after update.

## Invoices

**Create DD / DX** writes Word + PDF into Drive:

`LLC/docs/_clients/SUPERPLAY/invoice/MGX / 10_October`

PDF needs LibreOffice on the VPS. `board-update` installs `libreoffice-writer-nogui` if `soffice` is missing. `/api/version` shows `"pdf": {"ready": true, "soffice": "/usr/bin/soffice"}`. If `pdf.ready` is false, invoice Word still goes to Drive and PDF is skipped.

Backups land in `~/lg-board-backups/<UTC stamp>/` (last 20 kept).
