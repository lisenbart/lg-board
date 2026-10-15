# lisenbart.games

Public visiting card for **Lisenbart Games** — the games division of **Lisenbart Film**. Visuals come 1:1 from the Figma Make file (Archivo Black + Manrope, lime CTAs, yellow contact slab). Copy stays the studio brief: reel, what we make, write to `info@lisenbart.games`.

The Python board in the repo root (`board.lisenbart.games`) is a different product. PIN, hours Excel, Drive, rates and invoices stay off this site.

## Stack

Vite + React 19 + the Figma CSS. Fonts (Archivo Black, Manrope) are self-hosted `woff2`. Local form opens mailto; Netlify Forms on production.

## Run locally

```bash
cd site
npm install
npm run dev
```

Opens on [http://127.0.0.1:43221](http://127.0.0.1:43221).

Sandbox (GitHub Pages, not production): [https://lisenbart.github.io/lisenbart-games/](https://lisenbart.github.io/lisenbart-games/). Repo: [github.com/lisenbart/lisenbart-games](https://github.com/lisenbart/lisenbart-games). Apex `lisenbart.games` stays off until you say to publish.

## Netlify (lisenbart.games only)

Attach **this** repo as its own Netlify site for the `.games` domain. Do **not** reuse the **lisenbart.com** site.

| Setting | Value |
| --- | --- |
| Base directory | `site` |
| Build | `npm run build` |
| Publish | `dist` |
| Node | 20 (`netlify.toml`) |

Production deploy only after you say so. Do not push GitHub branch `studio` until agreed.
