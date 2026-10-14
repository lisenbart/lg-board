# lisenbart.games — studio site

Public face of **https://lisenbart.games**. Next.js, static export. Two doors into the live desk:

- **Studio** → [board.lisenbart.games/?door=studio](https://board.lisenbart.games/?door=studio)
- **Client** → [board.lisenbart.games/hours](https://board.lisenbart.games/hours)

PIN seats stay on the board. This site never asks for a PIN.

The Python board in the repo root is a different product.

## Where it should run: Netlify, not the VPS

**lisenbart.com** already lives on Netlify. **lisenbart.games** should live there too.

| | Netlify (`lisenbart.games`) | Same OVH VPS as the board |
| --- | --- | --- |
| What it is | CDN + HTTPS for a static site | nginx next to the studio desk |
| If the VPS restarts | Homepage stays up | Homepage dies with the board |
| Deploy | Git push / Netlify | `ssh board-update` mixes marketing with ops |

Use the VPS for **board.lisenbart.games** only.

## DNS (when attaching Netlify)

Leave `board.lisenbart.games` as the A record to `15.235.127.163`.

Point the apex and www at Netlify (Netlify DNS, or ALIAS/ANAME on the apex + CNAME `www`). Do not CNAME `lisenbart.games` at the board.

## Publish

Netlify site, this GitHub repo `lisenbart/lg-board`, branch `studio`:

- Base directory: `site`
- Build: `npm run build`
- Publish directory: `out`

Local:

```bash
cd site
npm install
npm run dev
```

Open [http://127.0.0.1:43221](http://127.0.0.1:43221).
