# lisenbart.games

Public visiting card for **Lisenbart Games** — the games division of **LISENBART FILM**. One English page: reel, what we make, how we think, write. Trust sits on [lisenbart.com](https://lisenbart.com). Contact is `info@lisenbart.games` plus a Netlify form (locally the form opens mailto).

The Python board in the repo root (`board.lisenbart.games`) is a different product. PIN, hours Excel, Drive, rates and invoices stay off this site.

## Stack

Static HTML + CSS + a little vanilla JS. No framework. Fonts (Archivo, Figtree) are self-hosted `woff2`.

## Run locally

```bash
cd site
python3 -m http.server 43221 --bind 0.0.0.0
```

Opens on [http://127.0.0.1:43221](http://127.0.0.1:43221).

Sandbox (GitHub Pages, not production): [https://lisenbart.github.io/lisenbart-games/](https://lisenbart.github.io/lisenbart-games/). Repo: [github.com/lisenbart/lisenbart-games](https://github.com/lisenbart/lisenbart-games). This is for looking at the page from any browser. Apex `lisenbart.games` stays off until you say to publish.

## Netlify (lisenbart.games only)

Attach **this** repo as its own Netlify site for the `.games` domain. Do **not** reuse the **lisenbart.com** site.

| Setting | Value |
| --- | --- |
| Base directory | `site` |
| Build | none (`true`) |
| Publish | `.` |
| Node | 20 (`netlify.toml`) |

Production deploy only after you say so. Do not push GitHub branch `studio` until agreed.
