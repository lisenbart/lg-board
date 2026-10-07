# LG Board — Lisenbart studio desk

Online portal for **SUPERPLAY MGX**. The client stays on Monday (`External Weekly`). Designers work here and are never added to Monday.

One list, not Monday groups. Projects stay in a single table and are sorted by studio status so the same mark sits together:

**Ready to Start → WIP → Need Fixing → Done → Senior Approval**

Same names and colors as Superplay’s Monday `External Weekly`. Each role has its own set:

- **Designer** — WIP, Done. Cannot send Senior Approval to Monday.
- **Team lead** — Ready to Start, WIP, Need Fixing, Done. Assigns people. No Monday send.
- **Manager / Finance** — full set, including Senior Approval via **Send to client**.

## What v1 does (sandbox)

Roles in the demo are job titles, not names:

- **Designer** — only their assigned projects. Hours, brief, paste the result. No money. Other designers’ queues stay hidden.
- **Team lead** — assigns designers. No Monday buttons, no invoices.
- **Manager** — pull from Monday and send finished work to the client. Does not assign people.
- **Finance** — manager pipeline plus the money tab.

Also:

- **Pull from Monday** — demo import (no Monday token yet).
- **Shift email** — Orit format: `NAME | 0.3 shifts`. Hours = shift × 9.
- Designer sets status and pastes the result link.
- **Send to client** on selected projects (2 of 10 is fine) → `check it please` + **Senior Approval**.
- Month-close draft (finance only): DD/DX hours × $35 and people hours @ $15.
- Test folders only in Drive [`_PORTAL_TEST`](https://drive.google.com/drive/folders/1HY7vcxR5Tmot5RNJyQ2ZeImD9J4BOuX8). Live `Projects / 10_October` is untouched.

Not in v1: live Monday API, invoice PDFs, Telegram, Playables, Slotomania, calculator rewrite.

## Run

Python 3 only. No npm.

```bash
python3 server.py
```

Open [http://127.0.0.1:43141](http://127.0.0.1:43141).

Data: `data/db.json` (copied from `data/seed.json` on first start). **Reset demo** restores the October pack.

## Try it

1. **Finance** or **Manager** — full pipeline, import/export.
2. **Team lead** — open a project, assign a designer.
3. **Designer / Designer 2 / Designer 3** — each sees only their own queue. Paste a result link, set **Done**.
4. Back to Manager: pick two Done rows → **Send to client**.
5. Paste a test Orit email to see the shift parser.
