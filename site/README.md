# lisenbart.games — studio door

Public landing for **https://lisenbart.games**. Two doors into the live desk:

- **Studio** → [board.lisenbart.games/?door=studio](https://board.lisenbart.games/?door=studio)
- **Client** → [board.lisenbart.games/hours](https://board.lisenbart.games/hours)

PIN seats stay on the board. This page never asks for a PIN.

This folder is the public studio site. The Python board in the repo root is a different product.

## Where it should run: Netlify, not the VPS

**lisenbart.com** already lives on Netlify. **lisenbart.games** should live there too.

| | Netlify (`lisenbart.games`) | Same OVH VPS as the board |
| --- | --- | --- |
| What it is | CDN + HTTPS for a static page | nginx next to the studio desk |
| If the VPS restarts | Homepage stays up | Homepage dies with the board |
| Looks like a studio | Public door on the same host as `.com` | Internal tool’s box pretending to be a website |
| Deploy | Git push / Netlify | `ssh board-update` mixes marketing with ops |

The board is an ops module (PIN seats, Drive, Excel). The homepage is a public face. Keep them on different machines so a desk restart, a Drive hang, or a bot hitting the board cannot take down `lisenbart.games`.

Use the VPS for **board.lisenbart.games** only.

## DNS (when attaching Netlify)

Leave `board.lisenbart.games` as the A record to `15.235.127.163`.

Point the apex and www at Netlify (Netlify DNS, or ALIAS/ANAME on the apex + CNAME `www`). Do not CNAME `lisenbart.games` at the board.

## Publish

Netlify site, this GitHub repo `lisenbart/lg-board`, branch `studio`:

- Base directory: `site`
- Publish directory: `site` (or `.` if base is `site`)

Local preview:

```bash
python3 -m http.server 43211 --bind 127.0.0.1 --directory site
```
