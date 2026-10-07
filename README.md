# LG Board — Lisenbart studio desk

Internal studio board. Superplay stays on Monday (`External Weekly`). Designers work here and are never added to Monday.

MGX is the live board. Playables is next. The desk is a studio tool first — even if MGX volume drops, this is how Lisenbart runs intake, load, and handoff.

The board is one month at a time. Hours and load follow the selected month — same idea as a tab in `SP_MGX_check.xlsx`.

One list, not Monday groups. Sorted by studio status:

**Ready to Start → WIP → Need Fixing → Done → Senior Approval**

## Access (sandbox)

Three mailboxes. No Google password in the sandbox — click the account.

| Mailbox | Seat | Sees |
| --- | --- | --- |
| `dmytro@lisenbart.games` | Dmytro · Finance | Everything, including money and Team names |
| `anastasiia@lisenbart.games` | Anastasiia · Manager | Everything except Finance |
| `lisenbart.games@gmail.com` | Shared Drive mailbox | After login, pick **team lead** or a **designer** |

Then:

- **Team lead** — own work plus every designer. Assigns people. No Monday send, no Finance.
- **Designer** — only their queue, plus a read-only Excel picture of the whole month.
- **Client** — later, a separate login and view. Today that is the GitHub Pages demo (job titles, no Finance, no studio names).

The shared Gmail cannot tell Настя from Маша, so the seat picker after that mailbox is required.

## Client preview (what Matan should see)

Share **https://lisenbart.github.io/lg-board/** — not the Cursor Preview URL.

That link hides Finance, invoice rates, and real studio names. Roles in the picker: Manager, Team lead, Designer.

Do **not** put this on glowl.direct. Prefer a Lisenbart name. Later: `board.lisenbart.games` with the same three-mailbox login.

Studio money never unlocks on the hosted link. Localhost is the studio sandbox.

## What the sandbox does

- **Pull from Monday** — demo import until Superplay grants board access.
- **Shift email** — Orit format: `NAME | 0.3 shifts`. Hours = shift × 9.
- Manager / team lead can paste the brief and Drive / Doc links.
- Designer sets WIP or Done and pastes the result link.
- **Send to client** copies `check it please` + the result link for External Weekly. Status becomes Senior Approval.
- **Copy Telegram** — designer name + project, for the studio chat.
- **Excel** tab is the `SP_MGX_check.xlsx` **calculator**, not a CSV dump. Hours stay `= shifts × 9`. **Update calculator** writes the open month in place and leaves other months alone. Sandbox copy lives in Drive `_PORTAL_TEST`. The live studio workbook is not touched. Designers see the grid read-only.
- Test folders only in Drive [`_PORTAL_TEST`](https://drive.google.com/drive/folders/1HY7vcxR5Tmot5RNJyQ2ZeImD9J4BOuX8). Live `Projects / 10_October` is untouched.

Not in this slice: live Monday API, real Drive folder create, invoice PDFs, Playables board, client OAuth.

## Run locally

Python 3 only. No npm.

```bash
python3 server.py
```

Open [http://127.0.0.1:43141](http://127.0.0.1:43141) and sign in with one of the three mailboxes.

Data: `data/db.json` (copied from `data/seed.json` on first start). **Reset demo** restores the October pack.

## Try it

1. **Dmytro** — Finance + pipeline.
2. **Anastasiia** — full pipeline, no Finance tab.
3. **lisenbart.games@gmail.com** → Team lead — assign a designer.
4. Same mailbox → a designer — own queue, Excel is the month picture.
5. Back to Anastasiia: pick Done rows → **Send to client**.
