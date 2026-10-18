# LG Board — Lisenbart studio desk

Internal studio board. Superplay stays on Monday (`External Weekly`). Designers work here and are never added to Monday.

One portal: **SUPERPLAY MGX** and **SUPERPLAY Playables** on the same desk (`board.lisenbart.games`). The sidebar switches boards. Finance and SuperPlay stay combined — no page hop.

The board is one month at a time. Hours and load follow the selected month — same idea as a tab in `SP_MGX_check.xlsx` / `SP_PLBL_check.xlsx`.

MGX pipeline:

**Ready to Start → WIP → Need Fixing → Done → Senior Approval → Closed**

Playables pipeline:

**Ready → WIP → Check → Sent → Final art → Art ready → WIP → Done → Send → Closed**

## Access

Source of truth for login and URLs: **[deploy/README.md](deploy/README.md)**. Public studio site: **[site/](site/)** (`lisenbart.games`). Internal desk: **https://board.lisenbart.games**.

```bash
ssh board           # VPS shell
ssh board-update    # deploy the desk
ssh board-status    # live build
```

After a studio push, the agent always puts `ssh board-update` in a copy box. Run that on the Mac to ship the live desk.

Google Drive is always the live disk ([LLC/docs](https://drive.google.com/drive/folders/191q3zTumkNi-2tc9LCB1SG2lZwtu0pVs)). The VPS stays signed in with a service account file at `data/secrets/google_service.json` (share October DD/DX with that account). **Create task** then makes the folder + brief Doc; **Save** on the card writes the brief into the Doc. To update the live desk: `bash deploy/update.sh` on the VPS, then hard-refresh the browser.

Home: **Client** or **Studio**. Seats: Finance, LP, TL, MD, AD, DEV, Client. PINs live in `data/secrets/pins.json`. The PIN is a key, not a home desk: you sit the tile you tapped if your PIN ranks high enough. **DL** opens every seat. **LP** opens LP and below (not DL). **TL** opens TL / MD / AD / DEV. Team PIN `4429` is MD / AD / DEV only — several people on that door still asks who is at the desk. A personal PIN on Team **replaces** the old one: the previous PIN no longer opens that seat, and it does not open other performer desks. Save on a Team row (and on a card) stays dim until there is something to write. One-direction people stay on their board; dual-seat people (LP, DL, Сергій, SuperPlay) see **MGX | Playables**.

Then:

- **Team lead** — MGX: own work plus every designer. Assigns people. No Monday send, no Finance.
- **Designer** — only their queue, plus a read-only Excel picture of the month. Сергій sits Playables as well as MGX.
- **Art Director / Programmer** — Playables queue only. Hours are agreed in Telegram before the card exists. AD: Ready→WIP, paste storyboard link, Check. LP sends the board (Sent). Bounce is Need Fixing; approve is Final art. AD sets Art ready, then DEV starts HTML. DEV WIP → paste HTML → Done. Code-only (no AD) starts DEV at Ready. MD on Playables has hours, not status.
- **Line producer / Finance** — both boards. **Create task** after the client approved hours. Assign AD and DEV on the new card, hours next to the person. DEV can sit on the card from Ready; they start HTML after Art ready. LP/DL can set any MGX or Playables work status if the performer is away (MGX: WIP, TL Check, Done…; Playables: WIP, Check, Art ready, Done…). Send to the client stays the footer button. Bounce after Send is Need Fixing. **DL** also has **Clients → SuperPlay** (same Hours tables as the SuperPlay login, without switching seat). More clients can sit in that Clients list later. If two people have the same card open, the card says who is on it; Save warns if the card changed while it was open.
- **Client (SuperPlay)** — page is **https://board.lisenbart.games/superplay** (`/hours` still redirects). MGX and Playable sit in two separate tables: name, **STATUS** (same chips as the pipeline), SHIFTS, HOURS. Tap the MGX or Playable hours KPI to show only that table (tap again, or **projects**, to show both). Fills are a pastel tone ladder — header light, section a step darker, totals darker still, final hours the darkest. A green **Download Excel** under the tables builds a fresh file at click time (no studio people or rates), stamped with the viewer’s local date, time, and city. `DS-P-` / `DD-P-` / `DX-P-` rows stay in the Playable block even if department is missing. No studio queue, no money. **DL** sees a Sign-ins list on the same SuperPlay tab: time (Kyiv), Login field, IP, browser — one row per SuperPlay PIN sign-in.

Studio no longer uses a shared team mailbox. The name on the door is the seat.

Do **not** put this on glowl.direct. Live desk only: **https://board.lisenbart.games**. There is no GitHub Pages demo.

## What the desk does

- **Shift email** — paste the shift list as it arrives (`NAME 0.3 shift`, `NAME- 0.3 SHFT`, or `NAME | 0.3 shifts`). Each new line is the same chain as Create task: card + live Drive folder + empty brief Doc + hours (shift × 9) on the card and in Excel. Names already on the board only get hours updated (and a folder if they still lack one). Monday API is not required.
- **Files on disk.** The portal is the source of truth. **Studio** login seats paint instantly (no wait on `/api/roster`). **Create task**, Shift email, assign, hours, Due, split, Save, **delete**, team edits, Excel save, and Finance snapshot stay on the board lock only for `db.json`; Drive folders, trash, invoices, and xlsx copy run off that lock so opening a card or the Finance tab cannot freeze login. New Excel rows no longer create tasks.
- **Briefs on the card** come from the live Google Docs in `Projects / 10_October / DD|DX` (read-only) where we already had the text. **Task folder** is the studio Drive pack for this card. **Working folder** is the client folder from the brief (`Working folder:` / `pls work here`); the button stays on the card and is disabled when that line is missing. Naming is the four filenames from those Docs, not invented sizes.
- The task card is role-first. Brief text stays on the card; **Open brief** / **Task folder** / **Working folder** open Drive — raw Doc/folder URL fields are not on the default card. **TL** sees assign first. **MD** sees paste-result then Done. **LP** sees hours, **URGENT**, and Send to client. Designer pastes the result link, then sets Done. Done is locked until that link is in the card — the work folder is not used as a stand-in. Assignment lives on the board; there is no Telegram copy step.
- **Hours split** is studio pay only. SuperPlay still sees one SHIFTS / HOURS number. If someone renders because a PC cannot, TL or LP puts 0.5h (or whatever is fair) on the helper. Who stays the owner of Done. Heavy AE cleanup / lost sources is still inside the original hours — that does not add client time.
- **Board scan** — the whole row is tinted by studio status (Ready / WIP / Fix / Done / Appr. / Closed). A matching chip sits on the name. **Send to client** is the LP button on Done rows, not a status chip. **Closed** is the last state: client accepted, hours stay, no more work. The bell still lists unread notices; opening a card marks those read. New kinds go in `notice_io.py` + `public/assets/notices.js`.
- **Send to client** copies `check it please` + the result link for External Weekly. Status becomes Senior Approval. LP can **Mark Closed** from Done without Send, when the client already accepted. Superplay is not on this board, so Send stays until Monday API is connected.
- **Finance** (Dmytro only) — one Client tab for every SUPERPLAY line. No direction switcher here.
  - **Client** — MGX $35/h and Playable $40/h on the same table (DD / DX / DS). **Create invoices** writes Word+PDF into the existing Drive month folders: `LLC/docs/_clients/SUPERPLAY/invoice/MGX/{month}` and `…/Playable/{month}`. Two **Open folder** buttons. Playable files are named `invoice_Playable_{LINE}_YYYY.MM.DD`.
  - **Studio** — CLIENT IN → STUDIO (TAX) → EMPL → STUDIO across both directions. Tax % sits on the STUDIO (TAX) row (now 6%). Changing it rewrites `SUPERPLAY_MGX_Calculator.xlsx` (MGX crew only).
  - **Employeers** — split **MGX** / **Playables** lists. LP is $5 × every MGX billed hour and $7 × Playables **producer** hours (art + DEV). Billed Playables hours may include a studio buffer; that leftover stays studio, not LP or AD. AD / DEV / MD $15/h on their hours. UAH = USD × NBU. Card + IBAN sit on one row with Copy.
- **Playables Excel** is `SP_PLBL_check.xlsx` (billed hours in C, LP 1 Анастасія `=SUM` of crew, then ARTD / DEV matching the live sheet). MOTION/Сергій stays on the board, not as an Excel column — inserting him used to shift Anna’s hours. Blue line fill (Google Sheets theme 8) is **WIP** on the board. AD is the first ARTD column with hours; DEV is the DEV column. A row can be DEV-only (Kraken ITR) — billed leftover is studio buffer, not a fake AD on the programmer. MGX stays `SP_MGX_check.xlsx` (shifts × 9). New playables land in the Drive month folder going forward. Playables card has two seats: **AD** and **DEV**. LP/DL pick the person and hours on the same row. Extra people during revisions are splits: **AD → AD**, **DEV → DEV**. Pipeline Time for LP is crew hours; billed hours stay **DL only**.
- **Deadlines** share the Excel `DEADLINE` column (file is the source of truth). Pipeline shows a **Dead Line** cell with the date and a short calendar bar (ok / soon / late). LP edits Dead Line — that writes the xlsx. Closed tasks keep the date, no alarm.
- **URGENT** is a studio flag, not a status and not a date. LP / DL toggle it on the card. The pipeline shows a red **!** on the project name (frozen column) so performers see it while scrolling; it does not replace Dead Line. **Closed** turns the flag off. Portal-only — the Excel sheet stays as it is.
- **Disk is the core.** `data/SP_MGX_check.xlsx` holds hours, deadlines, and assignees. Portal writes (create / assign / hours / Dead Line / delete) go into that sheet and then up to the live Drive file. A new Excel row is enough — no Create task click. Hours in the file still win on Refresh / watch. Invoices and Employeers pay are calculated from that sheet, not from a second set of numbers. Assign / tax / NBU also update `SUPERPLAY_MGX_Calculator.xlsx` for the same month.
- **People identity.** Names can change; role / посада cannot. Seat columns are bound to a stable person id (header comment `lg-id:…`). The visible header is the seat (`LP 1`, `TL 1`, `MD 1`… on MGX; `LP 1`, `ARTD 1`, `DEV 1` on Playables). Rename updates the name on the same column — hours stay. Add a designer or team lead → a new MD/TL column. Remove someone → the column stays empty so neighbouring hours do not shift. The calculator month sheet is rebuilt from the current crew (manager $5 on every hour, then performers).
Not in this slice: live Monday API, client OAuth. Invoices clone the live PE Lisenbart / SuperPlay Ltd Word; the PDF is that same Word, not an HTML rebuild. If NBU is unreachable, type today's USD/UAH rate. Positions are seats — people can change.

## Run locally

Python 3. Needs `openpyxl`. PDF is the cloned Word exported by LibreOffice (`soffice --headless --convert-to pdf`) so the table matches the `.docx`. On a Mac with Microsoft Word, that export is used first.

```bash
pip install -r requirements.txt
python3 server.py
```

Open [http://127.0.0.1:43141](http://127.0.0.1:43141) and sign in as Studio (DL / LP / TL / MD / AD / DEV) or Client.

Data: `data/db.json` (copied from `data/seed.json` on first start). Live Excel is `data/SP_MGX_check.xlsx`; `ssh board-update` snapshots it under `~/lg-board-backups` before git reset.

Crash tests (Excel ingest, login, roster speed, delete-before-Drive, bad JSON, concurrent `/api/me`):

```bash
python3 tools/test_portal.py
```

## Try it

1. **Dmytro** — Finance → Client (Word invoices) and Employeers (UAH, edit/copy card or IBAN).
2. **Anastasiia** — full pipeline, no Finance tab.
3. **lisenbart.games@gmail.com** → Team lead — assign a designer.
4. Same mailbox → a designer — own queue, Excel is the month picture.
5. Back to Anastasiia: pick Done rows → **Send to client**.
6. **SuperPlay** — `/superplay` for the month. Switch months with the arrows.
