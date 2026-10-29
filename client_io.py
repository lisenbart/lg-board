"""Studio clients: SuperPlay and Slotomania. Login is the client name, not a person's name."""
from __future__ import annotations

import copy
import re
import unicodedata

SUPERPLAY = "superplay"
SLOTOMANIA = "slotomania"
CLIENTS = (SUPERPLAY, SLOTOMANIA)
LABELS = {SUPERPLAY: "SuperPlay", SLOTOMANIA: "Slotomania"}
EMAILS = {
    SUPERPLAY: "superplay@lg-board",
    SLOTOMANIA: "slotomania@lg-board",
}
PATHS = {SUPERPLAY: "/superplay", SLOTOMANIA: "/slotomania"}
DEFAULT_PINS = {SUPERPLAY: "3500", SLOTOMANIA: "4182"}
RATE_USD = {SUPERPLAY: 40.0, SLOTOMANIA: 40.0}

# Fold spaces / hyphens. Keep letters so "SuperPlay" and "слотоманія" both match.
_LOGIN_KEEP = re.compile(r"[^\w]+", re.UNICODE)
_ALIASES = {
    "superplay": SUPERPLAY,
    "sp": SUPERPLAY,
    "суперплей": SUPERPLAY,
    "slotomania": SLOTOMANIA,
    "sloto": SLOTOMANIA,
    "slm": SLOTOMANIA,
    "слотоманія": SLOTOMANIA,
    "слотомания": SLOTOMANIA,
}

SLOTOMANIA_PERSON = {
    "id": "client-slotomania",
    "name": "Slotomania",
    "role": "client",
    "email": EMAILS[SLOTOMANIA],
    "color": "#323338",
    "jobTitle": "Client",
    "directions": ["playables"],
    "rates": {},
}

# October 2026 board hours vs quoted hours. Quote is the Playtika money number.
OCTOBER_TASKS = (
    {
        "id": "t-sl-1",
        "name": "Snakes and Ladders",
        "line": "PL",
        "department": "Playables",
        "clientId": SLOTOMANIA,
        "game": "Snakes and Ladders",
        "shifts": 0,
        "hours": 32.0,
        "assigneeHours": 12.0,
        "producerHours": 32.0,
        "programmerId": "programmer1",
        "programmerHours": 20.0,
        "motionId": "",
        "motionHours": 0,
        "deadline": "",
        "urgent": False,
        "month": "2026-10",
        "excelStatus": "wip",
        "studioStatus": "wip",
        "mondayStatus": "WIP",
        "assigneeId": "artdir2",
        "help": [],
        "programmerHelp": [],
        "studioBuffer": 0,
        "brief": "",
        "folderUrl": "https://drive.google.com/drive/folders/17zmquJV3TXXvnKC7YHdxewTAH3UfTOr6",
        "docUrl": "",
        "resultUrl": "",
        "source": "portal",
        "quoteHours": 37.0,
        "quoteAmount": 1480.0,
        "quoteNumber": "46296",
        "quoteDate": "2026-10-01",
        "quoteStatus": "sent",
        "hoursApproved": True,
        "poNumber": "",
        "invoiceStatus": "",
        "activity": [{"at": "2026-10-01T09:00:00Z", "text": "Quote 46296 sent · 37 h × $40 = $1480. Board hours 32."}],
    },
    {
        "id": "t-sl-2",
        "name": "Battle Ship",
        "line": "PL",
        "department": "Playables",
        "clientId": SLOTOMANIA,
        "game": "Battle Ship",
        "shifts": 0,
        "hours": 44.0,
        "assigneeHours": 10.0,
        "producerHours": 44.0,
        "programmerId": "programmer1",
        "programmerHours": 24.0,
        "motionId": "designer3",
        "motionHours": 10.0,
        "deadline": "",
        "urgent": False,
        "month": "2026-10",
        "excelStatus": "wip",
        "studioStatus": "wip",
        "mondayStatus": "WIP",
        "assigneeId": "artdir1",
        "help": [],
        "programmerHelp": [],
        "studioBuffer": 0,
        "brief": "",
        "folderUrl": "https://drive.google.com/drive/folders/1GlNzpKdsT7rB-g_NW3m8VRaP5heoPARp",
        "docUrl": "",
        "resultUrl": "",
        "source": "portal",
        "quoteHours": 49.0,
        "quoteAmount": 1960.0,
        "quoteNumber": "46324",
        "quoteDate": "2026-09-29",
        "quoteStatus": "sent",
        "hoursApproved": True,
        "poNumber": "",
        "invoiceStatus": "",
        "activity": [{"at": "2026-09-29T09:00:00Z", "text": "Quote 46324 sent · 49 h × $40 = $1960. Board hours 44."}],
    },
    {
        "id": "t-sl-3",
        "name": "Coin Cruiser",
        "line": "PL",
        "department": "Playables",
        "clientId": SLOTOMANIA,
        "game": "Coin Cruiser",
        "shifts": 0,
        "hours": 43.0,
        "assigneeHours": 10.0,
        "producerHours": 43.0,
        "programmerId": "programmer1",
        "programmerHours": 18.0,
        "motionId": "designer3",
        "motionHours": 15.0,
        "deadline": "",
        "urgent": False,
        "month": "2026-10",
        "excelStatus": "wip",
        "studioStatus": "wip",
        "mondayStatus": "WIP",
        "assigneeId": "artdir2",
        "help": [],
        "programmerHelp": [],
        "studioBuffer": 0,
        "brief": "",
        "folderUrl": "https://drive.google.com/drive/folders/1z8zpDjMnysSaft_pKjjtunAMxPxx6c_x",
        "docUrl": "",
        "resultUrl": "",
        "source": "portal",
        "quoteHours": 43.0,
        "quoteAmount": 1720.0,
        "quoteNumber": "46324",
        "quoteDate": "2026-10-29",
        "quoteStatus": "sent",
        "hoursApproved": True,
        "poNumber": "",
        "invoiceStatus": "",
        "activity": [{"at": "2026-10-29T09:00:00Z", "text": "Quote 46324 sent · 43 h × $40 = $1720."}],
    },
    {
        "id": "t-sl-4",
        "name": "Characters Playable",
        "line": "PL",
        "department": "Playables",
        "clientId": SLOTOMANIA,
        "game": "Characters",
        "shifts": 0,
        "hours": 44.0,
        "assigneeHours": 19.0,
        "producerHours": 44.0,
        "programmerId": "programmer1",
        "programmerHours": 20.0,
        "motionId": "designer3",
        "motionHours": 5.0,
        "deadline": "",
        "urgent": False,
        "month": "2026-10",
        "excelStatus": "wip",
        "studioStatus": "new",
        "mondayStatus": "Ready",
        "assigneeId": "artdir1",
        "help": [],
        "programmerHelp": [],
        "studioBuffer": 0,
        "brief": "",
        "folderUrl": "",
        "docUrl": "",
        "resultUrl": "",
        "source": "portal",
        "quoteHours": 44.0,
        "quoteAmount": 1760.0,
        "quoteNumber": "46324",
        "quoteDate": "2026-10-29",
        "quoteStatus": "sent",
        "hoursApproved": False,
        "poNumber": "",
        "invoiceStatus": "",
        "activity": [{"at": "2026-10-29T09:05:00Z", "text": "Quote 46324 sent · 44 h × $40 = $1760. Hours not yet approved."}],
    },
)


def _fold_login(raw: str) -> str:
    text = unicodedata.normalize("NFKC", str(raw or "")).strip().lower()
    text = _LOGIN_KEEP.sub("", text)
    return text.replace("_", "")


def parse_login(raw: str) -> str:
    """Return superplay / slotomania, or empty if the Login field is not a client name."""
    return _ALIASES.get(_fold_login(raw), "")


def label(client_id: str) -> str:
    return LABELS.get(norm(client_id), LABELS[SUPERPLAY])


def email_of(client_id: str) -> str:
    return EMAILS.get(norm(client_id), EMAILS[SUPERPLAY])


def path_of(client_id: str) -> str:
    return PATHS.get(norm(client_id), PATHS[SUPERPLAY])


def pin_default(client_id: str) -> str:
    return DEFAULT_PINS.get(norm(client_id), "")


def norm(client_id: str) -> str:
    raw = str(client_id or "").strip().lower()
    if raw in CLIENTS:
        return raw
    parsed = parse_login(raw)
    return parsed or SUPERPLAY


def of_email(email: str) -> str:
    want = str(email or "").strip().lower()
    for cid, addr in EMAILS.items():
        if addr == want:
            return cid
    return ""


def is_client_email(email: str) -> bool:
    return of_email(email) in CLIENTS


def of_task(task: dict | None) -> str:
    if not task:
        return SUPERPLAY
    raw = str(task.get("clientId") or "").strip().lower()
    if raw in CLIENTS:
        return raw
    return SUPERPLAY


def is_slotomania(task: dict | None) -> bool:
    return of_task(task) == SLOTOMANIA


def is_superplay(task: dict | None) -> bool:
    return of_task(task) == SUPERPLAY


def tasks_for(db: dict, client_id: str, ym: str = "") -> list[dict]:
    want = norm(client_id)
    month = str(ym or "").strip()
    out = []
    for task in db.get("tasks") or []:
        if of_task(task) != want:
            continue
        if month and str(task.get("month") or month) != month:
            continue
        out.append(task)
    return out


def quote_hours(task: dict | None) -> float:
    try:
        n = float((task or {}).get("quoteHours") or 0)
    except (TypeError, ValueError):
        n = 0.0
    return round(n, 1) if n else 0.0


def quote_amount(task: dict | None) -> float:
    try:
        n = float((task or {}).get("quoteAmount") or 0)
    except (TypeError, ValueError):
        n = 0.0
    if n:
        return round(n, 2)
    hours = quote_hours(task)
    return round(hours * RATE_USD[SLOTOMANIA], 2) if hours else 0.0


def po_number(task: dict | None) -> str:
    return str((task or {}).get("poNumber") or "").strip()


def hours_approved(task: dict | None) -> bool:
    raw = (task or {}).get("hoursApproved")
    if raw in (False, 0, "0", "false", "no"):
        return False
    return True


def money_status(task: dict | None) -> str:
    """Studio money chip for Slotomania. SuperPlay stays empty."""
    if not is_slotomania(task):
        return ""
    if str((task or {}).get("invoiceStatus") or "").strip().lower() in {"paid", "invoiced"}:
        status = str((task or {}).get("invoiceStatus") or "").strip().lower()
        return "paid" if status == "paid" else "invoiced"
    if po_number(task):
        return "has_po"
    if quote_hours(task) or str((task or {}).get("quoteStatus") or "").strip():
        if not hours_approved(task):
            return "quote_pending"
        return "waiting_po"
    return "no_quote"


MONEY_LABEL = {
    "no_quote": "No quote",
    "quote_pending": "Quote sent · hours pending",
    "waiting_po": "Waiting PO",
    "has_po": "PO in",
    "invoiced": "Invoiced",
    "paid": "Paid",
}


def money_label(task: dict | None) -> str:
    key = money_status(task)
    if key == "has_po":
        return po_number(task) or MONEY_LABEL[key]
    return MONEY_LABEL.get(key, "")


def ensure_people(db: dict) -> bool:
    people = db.setdefault("people", [])
    dirty = False
    if not any(str(p.get("email") or "") == EMAILS[SLOTOMANIA] for p in people):
        people.append(dict(SLOTOMANIA_PERSON))
        dirty = True
    for person in people:
        if person.get("role") != "client":
            continue
        email = str(person.get("email") or "").strip().lower()
        if not email:
            person["email"] = EMAILS[SUPERPLAY]
            dirty = True
            email = EMAILS[SUPERPLAY]
        cid = of_email(email) or SUPERPLAY
        if person.get("clientId") != cid:
            person["clientId"] = cid
            dirty = True
        if cid == SLOTOMANIA and person.get("name") != LABELS[SLOTOMANIA]:
            person["name"] = LABELS[SLOTOMANIA]
            dirty = True
        if cid == SLOTOMANIA and person.get("directions") != ["playables"]:
            person["directions"] = ["playables"]
            dirty = True
    return dirty


def ensure_tasks(db: dict) -> bool:
    """Put October Slotomania cards on the board if they are not there yet."""
    tasks = db.setdefault("tasks", [])
    used = {str(t.get("id") or "") for t in tasks}
    names = {
        str(t.get("name") or "").strip().lower()
        for t in tasks
        if of_task(t) == SLOTOMANIA
    }
    dirty = False
    sl_names = {
        str(t.get("name") or "").strip().lower()
        for t in tasks
        if of_task(t) == SLOTOMANIA
    }
    if sl_names:
        kept = []
        for task in tasks:
            name = str(task.get("name") or "").strip().lower()
            if (
                of_task(task) == SUPERPLAY
                and name in sl_names
                and str(task.get("source") or "") == "excel"
            ):
                dirty = True
                continue
            kept.append(task)
        if dirty:
            db["tasks"] = kept
            tasks = kept
    for task in tasks:
        if of_task(task) != SLOTOMANIA:
            continue
        if task.get("line") != "PL":
            task["line"] = "PL"
            dirty = True
        if task.get("clientId") != SLOTOMANIA:
            task["clientId"] = SLOTOMANIA
            dirty = True
        if task.get("department") != "Playables":
            task["department"] = "Playables"
            dirty = True
    for spec in OCTOBER_TASKS:
        name = str(spec.get("name") or "").strip().lower()
        if not name or name in names:
            continue
        row = copy.deepcopy(spec)
        tid = str(row.get("id") or "")
        if not tid or tid in used:
            n = 1
            while f"t-sl-{n}" in used:
                n += 1
            row["id"] = f"t-sl-{n}"
        tasks.append(row)
        used.add(str(row["id"]))
        names.add(name)
        dirty = True
    return dirty
