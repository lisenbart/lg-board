# lisenbart.games

Public studio site for **Lisenbart Games Animation** — a production motion team for games. One English page, one argument: here is the work, this is how we assemble it, write.

This folder is the public face. The Python board in the repo root (`board.lisenbart.games`) is a different product. PIN, hours Excel, Drive, rates and invoices stay off this site.

## Stack

Vite + React + TypeScript + Tailwind v4. Node 20.

**Type:** Montserrat (display, 300–600) and DM Sans (body), on white. The page is one argument: show the gaming reel, name the four offers, give the email. No separate hero, about, and gallery chapters.

## What is on the page

- **Work** — gaming reel (Vimeo `944158555`) with stills `02`–`05` attached under it as one film. Frame `01` is the reel poster. `06` (logo wall) and `07` (wordmark) are not used. Not labelled as a playable.
- **Caption** — “Your game. Our next move.” Kyiv · Warsaw. Clients named beside the line, not as a separate chapter.
- **Clients named in text** — Playtika, Voodoo, Moon Active, Plarium. No other names, no SuperPlay / MGX.
- **Services** — Playable Ads, Game Animation, Video Creatives (UA/ASO), Creative Direction & Storytelling. Playable Ads is a service with no fake interactive case on this page.
- **Contact** — `mailto:dmytro@lisenbart.games`. No form, no PIN.
- **Footer (tiny)** — Studio → `board.lisenbart.games/?door=studio` · Hours → `board.lisenbart.games/hours`.

Wordmark: existing RGB mark on a white plate, used small in the header on the light ground. Do not punch the white LISENBART / ANIMATION letters.

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
