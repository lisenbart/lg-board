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
- Manager / team lead can paste the brief and Drive / Doc links. **Open Drive** opens the sandbox month folder — the board does not create Drive folders.
- Designer sets WIP or Done and pastes the result link. Assignment lives on the board; there is no Telegram copy step.
- **Send to client** copies `check it please` + the result link for External Weekly. Status becomes Senior Approval. Superplay is not on this board, so this step stays until Monday API is connected.
- **Finance** (Dmytro only) — two inner tabs, same idea as the Excel tab mirroring `SP_MGX_check.xlsx`:
  - **Client** — totals by direction (DD / DX, and DS if that line has hours), not per task. One **Create DD / DX** writes Word + PDF only in the sandbox: `/workspace/data/invoices/10_October`. **Open folder** reveals that folder when the portal runs on your Mac; in this Preview it downloads `10_October.zip` instead (the sandbox disk is not Finder).
  - **Employeers** — same split as the MGX calculator. Manager (Анастасія) is $5 × every task hour this month. Team lead Настя is a performer at $15/h on her tasks, not a second finance line. Designers $15/h on assigned hours. UAH = USD × NBU. **Write into calculator** updates `SUPERPLAY_MGX_Calculator.xlsx`.
- **Disk is the core.** `data/SP_MGX_check.xlsx` holds hours and assignees. Pull from Monday (demo pack until Superplay grants API) and a team-lead assign both write that file immediately, then the portal reads it back. Invoices and Employeers pay are calculated from that sheet, not from a second set of numbers. **Write into calculator** / assign also updates `SUPERPLAY_MGX_Calculator.xlsx` for the same month. Sandbox only — live Drive `Projects / 10_October` is not overwritten. **Refresh from file** if someone edited the xlsx by hand.
- Test folders only in Drive [`_PORTAL_TEST`](https://drive.google.com/drive/folders/1HY7vcxR5Tmot5RNJyQ2ZeImD9J4BOuX8). Live `Projects / 10_October` is untouched.

Not in this slice: live Monday API, Playables board, client OAuth. Invoices clone the live PE Lisenbart / SuperPlay Ltd Word; the PDF is that same Word, not an HTML rebuild. If NBU is unreachable, type today's USD/UAH rate.

## Run locally

Python 3. Needs `openpyxl`. PDF is the cloned Word exported by LibreOffice (`soffice --headless --convert-to pdf`) so the table matches the `.docx`. On a Mac with Microsoft Word, that export is used first.

```bash
pip install -r requirements.txt
python3 server.py
```

Open [http://127.0.0.1:43141](http://127.0.0.1:43141) and sign in with one of the three mailboxes.

Data: `data/db.json` (copied from `data/seed.json` on first start). **Reset demo** restores the October pack.

## Try it

1. **Dmytro** — Finance → Client (Word invoices) and Employeers (UAH + copy card).
2. **Anastasiia** — full pipeline, no Finance tab.
3. **lisenbart.games@gmail.com** → Team lead — assign a designer.
4. Same mailbox → a designer — own queue, Excel is the month picture.
5. Back to Anastasiia: pick Done rows → **Send to client**.
