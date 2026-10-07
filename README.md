# LG Board — Lisenbart studio desk

Online portal for **SUPERPLAY MGX**. The client stays on Monday (`External Weekly`). Designers work here and are never added to Monday.

The board is one month at a time. The header shows **October 2026** (arrows change month; click the name to jump to today). Hours and load follow the selected month — same idea as a tab in the Excel file.

One list, not Monday groups. Projects stay in a single table and are sorted by studio status so the same mark sits together:

**Ready to Start → WIP → Need Fixing → Done → Senior Approval**

Same names and colors as Superplay’s Monday `External Weekly`. Each role has its own set:

- **Designer** — WIP, Done. Cannot send Senior Approval to Monday.
- **Team lead** — Ready to Start, WIP, Need Fixing, Done. Assigns people. No Monday send.
- **Manager** — full set, including Senior Approval via **Send to client**. Edits **shifts**; hours always = shifts × 9.

The **Excel** tab is a live mirror of `SP_MGX_check.xlsx` for the month in the header: DX/DD rows, people columns, hours in the coloured cell. **Pull from Excel** reads the workbook, **Save Excel** writes the same file (other month sheets stay). Assigning on the grid updates both the portal and the xlsx.

## Client preview (what Matan should see)

The shareable demo hides:

- **Slotomania** (another client — do not show Superplay)
- **Finance** — no invoice draft, no $ rates, no Team names

Roles in the picker: Manager, Team lead, Designer. Default is Manager.

Studio money stays on this machine only: open [http://127.0.0.1:43141/?studio=1](http://127.0.0.1:43141/?studio=1). Hosted links never unlock Finance.

## Share a test URL

Do **not** send the Cursor Preview URL. It only opens for the Lisenbart login.

Do **not** put this on glowl.direct. Superplay should only see a Lisenbart name.

Best test host: **GitHub Pages** on the `lisenbart@gmail.com` GitHub account. Publish **only** the `public/` folder (not this whole repo — the studio README has internal rates).

1. On GitHub, signed in as `lisenbart@gmail.com`, create a public repo (example: `lg-board`).
2. Upload everything inside `public/` to the repo root (`index.html` must sit at the root).
3. Settings → Pages → Deploy from branch `main` / root.
4. Send Matan: `https://<github-username>.github.io/lg-board/`

Later, the same files can sit on `board.lisenbart.games` or `board.lisenbart.com` if you add a Pages custom domain. `lisenbart.com` is the personal site — prefer a **subdomain**, not the homepage.

The `public/` folder is a static site. No Python on the host. Each visitor gets their own sandbox in the browser (Reset demo restores the pack).

## What v1 does (sandbox)

Roles in the demo are job titles, not names:

- **Designer** — only their assigned projects. Hours, brief, paste the result. No money. Other designers’ queues stay hidden.
- **Team lead** — assigns designers. No Monday buttons.
- **Manager** — pull from Monday and send finished work to the client. Does not assign people.
- **Finance** — local studio only (`?studio=1`). Invoice draft and Team names. Not on the client link.

Also:

- **Pull from Monday** — demo import until Superplay grants board access.
- **Shift email** — Orit format: `NAME | 0.3 shifts`. Hours = shift × 9.
- Manager / team lead can paste the brief and Drive / Doc links while Monday is still manual.
- Designer sets status and pastes the result link.
- **Send to client** copies `check it please` + the result link to paste into External Weekly. Studio status becomes Senior Approval.
- **Copy Telegram** — designer name + project, for the studio chat.
- **Excel CSV** — month hours for `SP_MGX_check.xlsx`.
- Test folders only in Drive [`_PORTAL_TEST`](https://drive.google.com/drive/folders/1HY7vcxR5Tmot5RNJyQ2ZeImD9J4BOuX8). Live `Projects / 10_October` is untouched.

Not in v1: live Monday API, real Drive folder create, invoice PDFs, Playables.

## Run locally

Python 3 only. No npm.

```bash
python3 server.py
```

Open [http://127.0.0.1:43141](http://127.0.0.1:43141) (client preview) or [http://127.0.0.1:43141/?studio=1](http://127.0.0.1:43141/?studio=1) (Finance).

Data: `data/db.json` (copied from `data/seed.json` on first start). **Reset demo** restores the October pack.

## Try it

1. **Manager** — full pipeline, import/export.
2. **Team lead** — open a project, assign a designer.
3. **Designer / Designer 2 / Designer 3** — each sees only their own queue. Paste a result link, set **Done**.
4. Back to Manager: pick two Done rows → **Send to client**.
5. Paste a test Orit email to see the shift parser.
