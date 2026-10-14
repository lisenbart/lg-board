# lisenbart.games

Public studio site for **Lisenbart Games Animation** — a production motion team for games. One English page: work, services, studio, contact.

This folder is the public face. The Python board in the repo root (`board.lisenbart.games`) is a different product. PIN, hours Excel, Drive, rates and invoices stay off this site.

## Stack

Vite + React + TypeScript + Tailwind v4. Node 20.

**Type:** Syne (display) and DM Sans (body). Syne is tight and slightly industrial — closer to a title card than a SaaS landing. DM Sans stays readable on the service copy. Not Figtree (board) and not the .com serif pairing.

## What is on the page

- **Hero** — “Your game. Our next move.” Kyiv · Warsaw.
- **Gaming reel** — Vimeo `944158555` from the existing lisenbart.com gaming reel. Native player controls. It is not labelled as a playable.
- **Frames** — stills `01`–`05` from that reel. `06` (logo wall with extra names) and `07` (wordmark only) are not used.
- **Clients named in text** — Playtika, Voodoo, Moon Active, Plarium. No other names, no SuperPlay / MGX.
- **Services** — Playable Ads, Game Animation, Video Creatives (UA/ASO), Creative Direction & Storytelling. Playable Ads is a service with no fake interactive case on this page.
- **Contact** — `mailto:dmytro@lisenbart.games`. No form, no PIN.
- **Footer (tiny)** — Studio → `board.lisenbart.games/?door=studio` · Hours → `board.lisenbart.games/hours`.

Wordmark: existing RGB mark. Exterior white was flood-filled to transparent so it sits on dark; the white LISENBART / ANIMATION letters stay opaque — do not `mix-blend` or punch those glyphs.

## Run locally

```bash
cd site
npm install
npm run dev
```

Opens on [http://127.0.0.1:43221](http://127.0.0.1:43221).

```bash
npm run build
npm run preview
```

## Netlify (lisenbart.games only)

Attach **this** repo (`lg-board`) as its own Netlify site for the `.games` domain. Do **not** reuse or clone the existing **lisenbart.com** site (`github.com/lisenbart/lisenbart`) — that site already owns `lisenbart.com` / `lisenbart.netlify.app`.

When you agree to publish:

| Setting | Value |
| --- | --- |
| Base directory | `site` |
| Build | `npm run build` |
| Publish | `dist` |
| Node | 20 (`netlify.toml`) |
| SPA fallback | `/*` → `/index.html` `200` (already in `netlify.toml`) |

Leave `board.lisenbart.games` as the A record to the VPS (`15.235.127.163`). Point apex `lisenbart.games` and `www` at this Netlify site — not at the board.

Do not force-redirect `/originals` → `/originals/` (that is a .com rule and loops). Do not copy .com WordPress 410s unless we decide they are needed here.

Production deploy only after you say so. Pushing GitHub branch `studio` is a publish path — do not use it until agreed.
