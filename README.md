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
- **Client** — later, a separate login. Until then, share the GitHub Pages link with the crew for mechanics only.

The shared Gmail cannot tell Настя from Маша, so the seat picker after that mailbox is required.

## Team demo on GitHub Pages

Share **https://lisenbart.github.io/lg-board/** — not the Cursor Preview URL.

That pack is for walking the crew through queues, assign, Excel, and send-to-client. First names and LP / TL / MD badges are on. **Finance is off** — no invoices, rates, tax, or cards.

Do **not** put this on glowl.direct. Prefer a Lisenbart name. Later: `board.lisenbart.games` with the same three-mailbox login.

Studio money never unlocks on the hosted link. Localhost is the studio sandbox.

## What the sandbox does

- **Pull from Monday** — demo import until Superplay grants board access.
- **Shift email** — Orit format: `NAME | 0.3 shifts`. Hours = shift × 9.
- **Pull from Monday** / shift email on a **new** task creates a Drive pack in sandbox `_PORTAL_TEST / {mm}_{Month} / DD|DX / {task name}`: project folder + Google Doc with the brief. Live `Projects / 10_October` is not touched. LP does not create this by hand. If a landed task still has no pack, opening the card in the studio sandbox fills it. **Open Drive** opens the sandbox month folder.
- The task card is role-first. Brief text stays on the card; **Open brief** / **Open folder** open Drive — raw Doc/folder URL fields are not on the default card. **TL** sees assign first. **MD** sees paste-result then Done. **LP** sees hours and Send to client. Designer pastes the result link, then sets Done. Done is locked until that link is in the card — the work folder is not used as a stand-in. Assignment lives on the board; there is no Telegram copy step.
- **Notices** — a catalog of kinds (`task.landed`, `task.assigned`, `task.revision`, `task.ready`, `task.sent`) with audience rules. Each seat sees only their unread items (bell + **New / On you / Fix / Send** on the row). Opening the card marks it read. New kinds go in `notice_io.py` + `public/assets/notices.js`; Telegram can subscribe to the same `channels` later.
- **Send to client** copies `check it please` + the result link for External Weekly. Status becomes Senior Approval. Superplay is not on this board, so this step stays until Monday API is connected.
- **Finance** (Dmytro only) — two inner tabs, same idea as the Excel tab mirroring `SP_MGX_check.xlsx`:
  - **Client** — totals by direction (DD / DX, and DS if that line has hours), not per task. One **Create DD / DX** writes Word + PDF only in the sandbox: `/workspace/data/invoices/10_October`. **Open folder** reveals that folder when the portal runs on your Mac; in this Preview it downloads `10_October.zip` instead (the sandbox disk is not Finder).
  - **Studio** — the calculator block from the bottom-right of the month sheet: CLIENT IN → STUDIO (TAX) → EMPL → STUDIO. Tax % sits on the STUDIO (TAX) row (now 6%). Changing it rewrites `SUPERPLAY_MGX_Calculator.xlsx` so the TAX cell and formulas match. Studio take is STUDIO (TAX) minus people pay. Same hours as `SP_MGX_check`.
  - **Employeers** — same split as the MGX calculator. Line Producer Анастасія Верлинська (LP) is $5 × every task hour this month. Team Lead Настя (TL) is a performer at $15/h on her tasks, not a second finance line. Motion design (MD) $15/h on assigned hours. UAH = USD × NBU. Tax and NBU writes update `SUPERPLAY_MGX_Calculator.xlsx` immediately.
- **Disk is the core.** `data/SP_MGX_check.xlsx` holds hours and assignees. Pull from Monday (demo pack until Superplay grants API) and a team-lead assign both write that file immediately, then the portal reads it back. Invoices and Employeers pay are calculated from that sheet, not from a second set of numbers. Assign / tax / NBU also update `SUPERPLAY_MGX_Calculator.xlsx` for the same month. Sandbox only — live Drive `Projects / 10_October` is not overwritten. **Refresh from file** if someone edited the xlsx by hand.
- **People identity.** Names can change; role / посада cannot. EMPL columns are bound to a stable person id (header comment `lg-id:…`). Rename updates the visible header on the same column — hours stay. Add a designer or team lead → a new EMPL column. Remove someone → the column stays empty so neighbouring hours do not shift. The calculator month sheet is rebuilt from the current crew (manager $5 on every hour, then performers).
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
