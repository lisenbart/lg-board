# LG Board — Lisenbart studio desk

Internal studio board. Superplay stays on Monday (`External Weekly`). Designers work here and are never added to Monday.

MGX is the live board. Playables is next. The desk is a studio tool first — even if MGX volume drops, this is how Lisenbart runs intake, load, and handoff.

The board is one month at a time. Hours and load follow the selected month — same idea as a tab in `SP_MGX_check.xlsx`.

One list, not Monday groups. Sorted by studio status:

**Ready to Start → WIP → Need Fixing → Done → Senior Approval → Closed**

## Access

Source of truth for login and URLs: **[deploy/README.md](deploy/README.md)**. Public studio site: **[site/](site/)** (`lisenbart.games`). Internal desk: **https://board.lisenbart.games**.

```bash
ssh board           # VPS shell
ssh board-update    # deploy the desk
ssh board-status    # live build
```

Google Drive is always the live disk ([LLC/docs](https://drive.google.com/drive/folders/191q3zTumkNi-2tc9LCB1SG2lZwtu0pVs)). The VPS stays signed in with a service account file at `data/secrets/google_service.json` (share October DD/DX with that account). **Create task** then makes the folder + brief Doc; **Save** on the card writes the brief into the Doc. To update the live desk: `bash deploy/update.sh` on the VPS, then hard-refresh the browser.

Home: **Client** or **Studio**. Five logins, one PIN each (`data/secrets/pins.json`): Finance, LP, TL, MD, Client. LP PIN opens every seat except DL (LP, TL, MD). TL PIN also opens MD seats. After a PIN that matches more than one person, pick who is at the desk.

Then:

- **Team lead** — own work plus every designer. Assigns people. No Monday send, no Finance. TL PIN also sits as MD.
- **Designer** — only their queue, plus a read-only Excel picture of the whole month.
- **Line producer / Finance** — full pipeline. **Create task** sits left of **Shift email**. The **Done** KPI filters the board to Done cards (same toggle as MD / Unassigned load cards).
- **Client (SuperPlay)** — **Hours**: PROJECT NAME / SHIFTS / HOURS, sections MGX DX and MGX DD, TOTAL. Same list the invoices are based on. A green **Download Excel** under the table builds a fresh file at click time (no studio people or rates), stamped with the viewer’s local date, time, and city. No studio queue, no money.

Studio no longer uses a shared team mailbox. The name on the door is the seat.

Do **not** put this on glowl.direct. Live desk only: **https://board.lisenbart.games**. There is no GitHub Pages demo.

## What the desk does

- **Shift email** — paste the shift list as it arrives (`NAME 0.3 shift`, `NAME- 0.3 SHFT`, or `NAME | 0.3 shifts`). Each new line is the same chain as Create task: card + live Drive folder + empty brief Doc + hours (shift × 9) on the card and in Excel. Names already on the board only get hours updated (and a folder if they still lack one). Monday API is not required.
- **Files on disk.** The portal is the source of truth. **Studio** login seats paint instantly (no wait on `/api/roster`). **Create task**, Shift email, assign, hours, Due, split, Save, **delete**, team edits, Excel save, and Finance snapshot stay on the board lock only for `db.json`; Drive folders, trash, invoices, and xlsx copy run off that lock so opening a card or the Finance tab cannot freeze login. New Excel rows no longer create tasks.
- **Briefs on the card** come from the live Google Docs in `Projects / 10_October / DD|DX` (read-only) where we already had the text. **Open folder** is the live October project folder. Naming is the four filenames from those Docs, not invented sizes.
- The task card is role-first. Brief text stays on the card; **Open brief** / **Open folder** open Drive — raw Doc/folder URL fields are not on the default card. **TL** sees assign first. **MD** sees paste-result then Done. **LP** sees hours and Send to client. Designer pastes the result link, then sets Done. Done is locked until that link is in the card — the work folder is not used as a stand-in. Assignment lives on the board; there is no Telegram copy step.
- **Hours split** is studio pay only. SuperPlay still sees one SHIFTS / HOURS number. If someone renders because a PC cannot, TL or LP puts 0.5h (or whatever is fair) on the helper. Who stays the owner of Done. Heavy AE cleanup / lost sources is still inside the original hours — that does not add client time.
- **Board scan** — the whole row is tinted by studio status (Ready / WIP / Fix / Done / Appr. / Closed). A matching chip sits on the name. **Send to client** is the LP button on Done rows, not a status chip. **Closed** is the last state: client accepted, hours stay, no more work. The bell still lists unread notices; opening a card marks those read. New kinds go in `notice_io.py` + `public/assets/notices.js`.
- **Send to client** copies `check it please` + the result link for External Weekly. Status becomes Senior Approval. LP marks **Closed** after the client accepts — not from Done, and not instead of Send. Superplay is not on this board, so Send stays until Monday API is connected.
- **Finance** (Dmytro only) — two inner tabs, same idea as the Excel tab mirroring `SP_MGX_check.xlsx`:
  - **Client** — totals by direction (DD / DX, and DS if that line has hours), not per task. **Create DD / DX** clones the Superplay Word, exports PDF, and writes both into `LLC/docs/_clients/SUPERPLAY/invoice/MGX / 10_October` on Drive. **Open folder** opens that Drive month folder. ZIP download is gone.
  - **Studio** — the calculator block from the bottom-right of the month sheet: CLIENT IN → STUDIO (TAX) → EMPL → STUDIO. Tax % sits on the STUDIO (TAX) row (now 6%). Changing it rewrites `SUPERPLAY_MGX_Calculator.xlsx` so the TAX cell and formulas match. Studio take is STUDIO (TAX) minus people pay. Same hours as `SP_MGX_check`.
  - **Employeers** — same split as the MGX calculator. Line Producer Анастасія Верлинська (LP) is $5 × every task hour this month. Team Lead Настя (TL) is a performer at $15/h on her tasks, not a second finance line. Motion design (MD) $15/h on assigned hours. UAH = USD × NBU. Tax and NBU writes update `SUPERPLAY_MGX_Calculator.xlsx` immediately.
- **Deadlines** share the Excel `DEADLINE` column (file is the source of truth). Pipeline shows a **Due** cell with the date and a short urgency bar (ok / soon / late). LP edits Due — that writes the xlsx. Closed tasks keep the date, no alarm.
- **Disk is the core.** `data/SP_MGX_check.xlsx` holds hours, deadlines, and assignees. Portal writes (create / assign / hours / Due / delete) go into that sheet and then up to the live Drive file. A new Excel row is enough — no Create task click. Hours in the file still win on Refresh / watch. Invoices and Employeers pay are calculated from that sheet, not from a second set of numbers. Assign / tax / NBU also update `SUPERPLAY_MGX_Calculator.xlsx` for the same month.
- **People identity.** Names can change; role / посада cannot. EMPL columns are bound to a stable person id (header comment `lg-id:…`). Rename updates the visible header on the same column — hours stay. Add a designer or team lead → a new EMPL column. Remove someone → the column stays empty so neighbouring hours do not shift. The calculator month sheet is rebuilt from the current crew (manager $5 on every hour, then performers).
Not in this slice: live Monday API, Playables board, client OAuth. Invoices clone the live PE Lisenbart / SuperPlay Ltd Word; the PDF is that same Word, not an HTML rebuild. If NBU is unreachable, type today's USD/UAH rate.

## Run locally

Python 3. Needs `openpyxl`. PDF is the cloned Word exported by LibreOffice (`soffice --headless --convert-to pdf`) so the table matches the `.docx`. On a Mac with Microsoft Word, that export is used first.

```bash
pip install -r requirements.txt
python3 server.py
```

Open [http://127.0.0.1:43141](http://127.0.0.1:43141) and sign in with one of the three mailboxes.

Data: `data/db.json` (copied from `data/seed.json` on first start). Live Excel is `data/SP_MGX_check.xlsx`; `ssh board-update` snapshots it under `~/lg-board-backups` before git reset.

Crash tests (Excel ingest, login, roster speed, delete-before-Drive, bad JSON, concurrent `/api/me`):

```bash
python3 tools/test_portal.py
```

## Try it

1. **Dmytro** — Finance → Client (Word invoices) and Employeers (UAH + copy card).
2. **Anastasiia** — full pipeline, no Finance tab.
3. **lisenbart.games@gmail.com** → Team lead — assign a designer.
4. Same mailbox → a designer — own queue, Excel is the month picture.
5. Back to Anastasiia: pick Done rows → **Send to client**.
6. **SuperPlay** — Hours report for the month. Switch months with the arrows.
