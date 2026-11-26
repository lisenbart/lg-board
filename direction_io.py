"""SUPERPLAY directions: MGX videos and Playables HTML ads on one desk."""
from __future__ import annotations

import re

import client_io

MGX = "mgx"
PLAYABLES = "playables"
DIRECTIONS = (MGX, PLAYABLES)

LABELS = {MGX: "SUPERPLAY MGX", PLAYABLES: "SUPERPLAY Playables"}
SLOTOMANIA_LABEL = "SLOTOMANIA Playables"
SHORT = {MGX: "MGX", PLAYABLES: "Playables"}
DEPT = {MGX: "MGX", PLAYABLES: "Playables"}
CLIENT_RATE = {MGX: 35.0, PLAYABLES: 40.0}
MGX_LINES = ("DX", "DD")
PLAYABLE_LINES = ("DX", "DD", "DS", "DM")
KNOWN_LINES = ("DX", "DD", "DS", "DM")
LINE_PREFIX_RE = re.compile(r"^\s*([A-Za-z]{2})-", re.I)
PLAYABLE_NAME_RE = re.compile(r"^\s*[A-Za-z]{2}-P-", re.I)

# Positions are seats. People sit in them and can change.
POSITIONS = (
    "finance",
    "manager",
    "teamlead",
    "designer",
    "art_director",
    "programmer",
    "client",
)
PERFORMERS = {"designer", "teamlead", "art_director", "programmer"}
PLAY_CREW = {"art_director", "programmer", "designer"}

PLAY_STATUS = {
    "new": "Ready",
    "wip": "WIP",
    "check": "Check",
    "revision": "Need Fixing",
    "clientart": "Client art",
    "finalart": "Final art",
    "artready": "Art ready",
    "done": "Done",
    "approve": "Send",
    "closed": "Closed",
}

PLAY_OPS_STATUSES = (
    "new",
    "wip",
    "check",
    "clientart",
    "revision",
    "finalart",
    "artready",
    "done",
    "closed",
)

PLAY_STATUS_BY_ROLE = {
    "art_director": {"wip", "check"},
    "programmer": {"wip"},
    "designer": set(),
    "teamlead": set(),
    "manager": set(PLAY_OPS_STATUSES),
    "finance": set(PLAY_OPS_STATUSES),
    "client": set(),
}
HANDOFF_NOTIFY = "notify"

PLAYABLE_CREW = [
    {
        "id": "artdir1",
        "name": "Анна",
        "role": "art_director",
        "color": "#C9A0DC",
        "payOrder": 7,
        "jobTitle": "Art Director",
        "rateUsd": 15,
        "directions": [PLAYABLES],
        "rates": {PLAYABLES: 15},
        "legalName": "Жук Анна",
        "bank": "Monobank",
        "iban": "UA213052990000026207670923067",
        "taxId": "3316114867",
        "aliases": ["Anna", "Анна Жук", "Жук"],
    },
    {
        "id": "artdir2",
        "name": "Юля",
        "role": "art_director",
        "color": "#7ED4C2",
        "payOrder": 8,
        "jobTitle": "Art Director",
        "rateUsd": 15,
        "directions": [PLAYABLES],
        "rates": {PLAYABLES: 15},
        "legalName": "Yuliia Pakhomova",
        "bank": "RaiffeisenBANK",
        "bankCard": "4149510046874766",
        "aliases": ["Yulia", "Yuliia", "Юлия", "Пахомова"],
    },
    {
        "id": "programmer1",
        "name": "Богдан",
        "role": "programmer",
        "color": "#8AA2FF",
        "payOrder": 9,
        "jobTitle": "Programmer",
        "rateUsd": 15,
        "directions": [PLAYABLES],
        "rates": {PLAYABLES: 15},
        "legalName": "Льопа Богдан Вікторович",
        "phone": "+380 97 252 2512",
        "email": "bogdanlyopa@gmail.com",
        "bank": "PrivatBank",
        "bankCard": "5169360018206510",
        "aliases": ["Bogdan", "Bohdan", "Lyopa", "Льопа"],
    },
]


def norm_dir(raw) -> str:
    text = str(raw or "").strip().lower()
    if text in {PLAYABLES, "playable", "plads", "plbl", "html"}:
        return PLAYABLES
    return MGX


def board_label(direction: str, client_id: str = "") -> str:
    if client_io.norm(client_id) == client_io.SLOTOMANIA:
        return SLOTOMANIA_LABEL
    return LABELS.get(norm_dir(direction), LABELS[MGX])


def line_from_name(name: str, default: str = "DD") -> str:
    """First two letters before a hyphen: DM-P-004 → DM, DD-AIV-202 → DD."""
    m = LINE_PREFIX_RE.match(name or "")
    return m.group(1).upper() if m else default


def of_name(name: str) -> str:
    """Playables codes are LINE-P-… (DD-P, DS-P, DX-P, DM-P). Anything else is MGX."""
    text = str(name or "").strip()
    if PLAYABLE_NAME_RE.match(text):
        return PLAYABLES
    return MGX


def repair_task_lines(db: dict) -> bool:
    """Keep the board line in sync with the project code. DM-P- must not sit as DD."""
    changed = False
    for task in db.get("tasks") or []:
        if client_io.is_slotomania(task):
            continue
        derived = line_from_name(str(task.get("name") or ""), default="")
        if derived and str(task.get("line") or "").upper() != derived:
            task["line"] = derived
            changed = True
    return changed


def of_task(task: dict | None) -> str:
    if not task:
        return MGX
    raw = task.get("department") or task.get("direction") or ""
    return norm_dir(raw)


def is_playables(task: dict | None) -> bool:
    return of_task(task) == PLAYABLES


def pack_direction(task: dict | None = None, name: str = "") -> str:
    """Drive tree follows the board the card sits on. The name is only a fallback."""
    if task and (task.get("department") or task.get("direction")):
        return of_task(task)
    if name:
        return of_name(name)
    return of_task(task)


PLAY_STATUS_KEYS = set(PLAY_STATUS)
_LEGACY_PLAYABLE = {
    "quote": "new",
    "storyboard": "check",
    "htmlready": "done",
    "build": "artready",
    "tlcheck": "check",
}


def playable_norm_status(st) -> str:
    """Map leftover chips onto the two-loop Playables pipeline."""
    key = str(st or "new")
    if key in PLAY_STATUS:
        return key
    return _LEGACY_PLAYABLE.get(key, "new")


def playable_has_ad(task: dict | None) -> bool:
    aid = str((task or {}).get("assigneeId") or "").strip()
    pid = str((task or {}).get("programmerId") or "").strip()
    return bool(aid and aid != pid)


def on_playable_seat(task: dict | None, actor_id: str) -> bool:
    actor = str(actor_id or "")
    if not actor or not task:
        return False
    if actor in {
        str(task.get("assigneeId") or ""),
        str(task.get("programmerId") or ""),
        str(task.get("motionId") or ""),
    }:
        return True
    for key in ("help", "programmerHelp"):
        for row in task.get(key) or []:
            if str((row or {}).get("id") or "") == actor:
                return True
    return False


ART_LOOP = {"new", "check", "clientart", "finalart"}
HTML_HANDOFF = {"artready", "done", "approve"}


def _status_before(task: dict, st: str) -> str:
    for item in reversed(task.get("statusLog") or []):
        if not isinstance(item, dict):
            continue
        if playable_norm_status(item.get("to")) == st:
            return playable_norm_status(item.get("from"))
    return ""


def playable_work_ids(task: dict | None) -> list[str]:
    """Who works this loop: AD on art, DEV on HTML."""
    task = task or {}
    if playable_in_html(task):
        pid = str(task.get("programmerId") or "").strip()
        return [pid] if pid else []
    if playable_has_ad(task):
        aid = str(task.get("assigneeId") or "").strip()
        return [aid] if aid else []
    pid = str(task.get("programmerId") or "").strip()
    return [pid] if pid else []


def playable_crew_ids(task: dict | None) -> list[str]:
    """AD and DEV seated on the card."""
    task = task or {}
    ids: list[str] = []
    if playable_has_ad(task):
        aid = str(task.get("assigneeId") or "").strip()
        if aid:
            ids.append(aid)
    pid = str(task.get("programmerId") or "").strip()
    if pid and pid not in ids:
        ids.append(pid)
    return ids


def playable_ad_delivered(task: dict | None) -> bool:
    """True only after the AD seated on the card Send to LP. Check from LP/another AD is still her job."""
    task = task or {}
    if not bool(task.get("handedToLp")):
        return False
    ad = str(task.get("assigneeId") or "").strip()
    if not playable_has_ad(task) or not ad:
        return True
    return str(task.get("handedBy") or "").strip() == ad


def playable_dev_delivered(task: dict | None) -> bool:
    """True only after the programmer seated on the card Send to LP."""
    task = task or {}
    if not bool(task.get("handedToLp")):
        return False
    dev = str(task.get("programmerId") or "").strip()
    if not dev:
        return True
    return str(task.get("handedBy") or "").strip() == dev


def playable_turn_role(task: dict | None) -> str:
    """Whose move: art_director, programmer, manager, or empty (waiting on the client)."""
    task = task or {}
    st = playable_norm_status(task.get("studioStatus"))
    html = playable_in_html(task)
    has_ad = playable_has_ad(task)
    dev = str(task.get("programmerId") or "").strip()
    if st in {"closed", "approve", "clientart"}:
        return ""
    if html:
        if st == "done":
            return "manager"
        if st == "revision":
            return "programmer" if dev else "manager"
        if st in {"artready", "wip", "new"}:
            if playable_dev_delivered(task):
                return "manager"
            return "programmer" if dev else "manager"
        return ""
    if not has_ad and dev:
        if st == "revision":
            return "programmer"
        if st in {"new", "wip"}:
            return "manager" if playable_dev_delivered(task) else "programmer"
        if st in {"done", "check"}:
            return "manager"
        return ""
    if st == "finalart":
        return "manager" if playable_ad_delivered(task) or not has_ad else "art_director"
    if st in {"new", "wip", "revision"}:
        return "art_director" if has_ad else "manager"
    if st == "check":
        if has_ad and not playable_ad_delivered(task):
            return "art_director"
        return "manager"
    return ""


def playable_part_open(task: dict | None, role: str, person_id: str = "") -> bool:
    """Active while seated and this seat still owns the work. Inactive only if not seated, or the part is in and they do not need to come back. Need Fixing always reopens the person who must fix it."""
    task = task or {}
    st = playable_norm_status(task.get("studioStatus"))
    if st == "closed":
        return False
    if role in {"manager", "finance"}:
        return True
    actor = str(person_id or "")
    if role == "art_director":
        if not playable_has_ad(task) or str(task.get("assigneeId") or "") != actor:
            return False
        if playable_in_html(task) or st in {"approve", "clientart", "artready", "done"}:
            return False
        return st in {"new", "wip", "revision", "check", "finalart"}
    if role == "programmer":
        return playable_turn_role(task) == "programmer" and str(task.get("programmerId") or "") == actor
    return False


def task_part_open(task: dict | None, role: str, person_id: str = "") -> bool:
    """Board-wide active row: seated + part not delivered. Helpers never. LP/DL until Closed."""
    task = task or {}
    if is_playables(task):
        return playable_part_open(task, role, person_id)
    st = str(task.get("studioStatus") or "new")
    if st == "closed":
        return False
    if role in {"manager", "finance"}:
        return True
    actor = str(person_id or "")
    mine = str(task.get("assigneeId") or "") == actor
    if st == "approve":
        return False
    if role == "designer":
        return mine and st in {"new", "wip", "revision"}
    if role == "teamlead":
        if st == "tlcheck":
            return True
        return mine and st in {"new", "wip", "revision"}
    return False


def playable_in_html(task: dict | None) -> bool:
    """HTML loop starts at Art ready (or a DEV-only card). Seating DEV on Ready is still art when AD is on the card."""
    task = task or {}
    st = playable_norm_status(task.get("studioStatus"))
    if st == "closed":
        return False
    dev_only = not playable_has_ad(task) and bool(str(task.get("programmerId") or "").strip())
    if dev_only and st not in {"check", "clientart", "finalart"}:
        return True
    if st in ART_LOOP:
        return False
    if st in HTML_HANDOFF:
        return True
    if st in {"wip", "revision"}:
        prev = _status_before(task, st)
        if prev in ART_LOOP or prev == "closed":
            return False
        if task.get("playableHtml") is False:
            return False
        if prev in HTML_HANDOFF:
            return True
    if task.get("playableHtml"):
        return True
    return False


def touch_playable_html(task: dict | None, prev: str | None = None, force_art: bool = False) -> None:
    """Lock HTML after Art ready. Closed → Ready / WIP returns the card to AD."""
    if not task:
        return
    st = playable_norm_status(task.get("studioStatus"))
    if force_art and st in {"wip", "revision"}:
        board = str(task.get("storyboardUrl") or "").strip()
        if board:
            task["resultUrl"] = board
        task["playableHtml"] = False
        task["htmlUrl"] = ""
        task["handedToLp"] = False
        task["handedBy"] = ""
        return
    if st in ART_LOOP or st == "closed":
        if task.get("playableHtml"):
            task["playableHtml"] = False
        return
    if st == "artready":
        task["playableHtml"] = True
        board = str(task.get("resultUrl") or "").strip()
        if board and not str(task.get("storyboardUrl") or "").strip():
            task["storyboardUrl"] = board
        html = str(task.get("htmlUrl") or "").strip()
        if html:
            task["resultUrl"] = html
        return
    if st in {"done", "approve"}:
        task["playableHtml"] = True
        return
    if st in {"wip", "revision"}:
        prev_st = playable_norm_status(prev) if prev else _status_before(task, st)
        if prev_st in ART_LOOP or prev_st == "closed":
            task["playableHtml"] = False
            return
        if prev_st in HTML_HANDOFF:
            task["playableHtml"] = True
            return
        if playable_in_html(task):
            task["playableHtml"] = True
        return
    if playable_in_html(task):
        task["playableHtml"] = True


def apply_client_note_bounce(task: dict | None, role: str) -> bool:
    """LP/DL client note is a bounce. Art loop → Need Fixing · Art. HTML loop → Need Fixing · HTML. Closed stays closed."""
    if role not in {"manager", "finance"}:
        return False
    task = task or {}
    if is_playables(task):
        st = playable_norm_status(task.get("studioStatus"))
        if st in {"closed", "revision"}:
            return False
        prev = st
        task["studioStatus"] = "revision"
        task["mondayStatus"] = PLAY_STATUS["revision"]
        touch_playable_html(task, prev=prev, force_art=False)
        return True
    st = str(task.get("studioStatus") or "new")
    if st in {"closed", "revision"}:
        return False
    task["studioStatus"] = "revision"
    task["mondayStatus"] = "Need Fixing"
    return True


def _open_client_notes(task: dict | None) -> list[dict]:
    return [row for row in (task or {}).get("comments") or [] if isinstance(row, dict)]


def undo_client_note_bounce(task: dict | None) -> bool:
    """Last client note gone while still Need Fixing → the status before that bounce. Monday notes still count."""
    task = task or {}
    if _open_client_notes(task):
        return False
    mgx_status = {
        "new": "Ready to Start",
        "wip": "WIP",
        "revision": "Need Fixing",
        "tlcheck": "TL Check",
        "done": "Done",
        "approve": "Senior Approval",
        "closed": "Closed",
    }
    if is_playables(task):
        st = playable_norm_status(task.get("studioStatus"))
        if st != "revision":
            return False
        html = playable_in_html(task)
        prev = _status_before(task, "revision")
        if not prev or prev == "revision":
            prev = "artready" if html else "new"
        task["studioStatus"] = prev
        task["mondayStatus"] = PLAY_STATUS.get(prev, task.get("mondayStatus"))
        touch_playable_html(task, prev="revision")
        if prev == "wip":
            task["playableHtml"] = True if html else False
        return True
    st = str(task.get("studioStatus") or "")
    if st != "revision":
        return False
    prev = ""
    for item in reversed(task.get("statusLog") or []):
        if isinstance(item, dict) and str(item.get("to") or "") == "revision":
            prev = str(item.get("from") or "")
            break
    if not prev or prev == "revision":
        prev = "new"
    task["studioStatus"] = prev
    task["mondayStatus"] = mgx_status.get(prev, task.get("mondayStatus"))
    return True


def playable_may_assign_dev(task: dict | None, role: str | None = None) -> bool:
    """LP/DL may seat DEV at any status. DEV work still waits for Art ready when AD is on the card."""
    if role in {"manager", "finance"}:
        return True
    task = task or {}
    st = playable_norm_status(task.get("studioStatus"))
    if not playable_has_ad(task):
        return True
    if str(task.get("programmerId") or "").strip():
        return True
    return st in {"artready", "done", "approve", "closed"}


def playable_next_statuses(role: str, task: dict | None) -> list[str]:
    """AD/DEV may start WIP. Done, Need Fixing, Art ready and the rest are LP."""
    task = task or {}
    st = playable_norm_status(task.get("studioStatus"))
    has_ad = playable_has_ad(task)
    html = playable_in_html(task)
    if role in {"manager", "finance"}:
        return list(PLAY_OPS_STATUSES)
    if role == "art_director":
        if html or not has_ad:
            return []
        if st == "check" and not playable_ad_delivered(task):
            return ["wip"]
        return {
            "new": ["wip"],
            "revision": ["wip"],
        }.get(st, [])
    if role == "programmer":
        if st == "artready":
            return ["wip"]
        if not has_ad and st == "new":
            return ["wip"]
        if st == "revision" and (html or not has_ad):
            return ["wip"]
        return []
    return []


def playable_handoff_status(role: str, task: dict | None) -> str:
    """AD/DEV hand work to LP. Check is the storyboard inbox. notify does not change status."""
    task = task or {}
    st = playable_norm_status(task.get("studioStatus"))
    html = playable_in_html(task)
    if role == "art_director":
        if html:
            return ""
        if playable_ad_delivered(task):
            return ""
        if st in {"new", "wip", "revision"}:
            return "check"
        if st == "finalart":
            return HANDOFF_NOTIFY
        return ""
    if role == "programmer":
        if playable_dev_delivered(task):
            return ""
        if st in {"artready", "wip", "revision"} and html:
            return HANDOFF_NOTIFY
        if not playable_has_ad(task) and st in {"new", "wip", "revision"}:
            return HANDOFF_NOTIFY
        return ""
    return ""


def playable_can_set(role: str, task: dict | None, nxt: str, *, actor_id: str = "") -> tuple[bool, str]:
    task = task or {}
    cur = playable_norm_status(task.get("studioStatus"))
    raw = str(nxt or "")
    if not raw:
        return True, ""
    nxt = playable_norm_status(raw)
    if nxt == cur:
        return True, ""
    if nxt == "approve":
        return False, "Send is set only when you Send to client"
    if nxt == "closed":
        if role in {"manager", "finance"}:
            return True, ""
        return False, "Only LP can mark Closed"
    if role in {"manager", "finance"}:
        if nxt in PLAY_OPS_STATUSES:
            return True, ""
        return False, f"{role} cannot set {nxt}"
    if role == "art_director" and actor_id and str(task.get("assigneeId") or "") != str(actor_id):
        return False, "Only the AD on the card sets art status"
    if role == "programmer" and actor_id and str(task.get("programmerId") or "") != str(actor_id):
        return False, "Only the DEV on the card sets HTML status"
    if nxt in {"done", "revision", "finalart", "artready", "clientart"} and role not in {"manager", "finance"}:
        return False, "Only LP sets Done, Need Fixing, and the next step"
    if nxt not in playable_next_statuses(role, task) and playable_handoff_status(role, task) != nxt:
        return False, f"{role} cannot set {nxt}"
    return True, ""


def is_mgx(task: dict | None) -> bool:
    return of_task(task) == MGX


def client_rate(direction: str, meta: dict | None = None) -> float:
    meta = meta or {}
    if norm_dir(direction) == PLAYABLES:
        raw = meta.get("playableClientRateUsd")
        fallback = CLIENT_RATE[PLAYABLES]
    else:
        raw = meta.get("clientRateUsd")
        fallback = CLIENT_RATE[MGX]
    try:
        n = float(raw)
        return n if n > 0 else fallback
    except (TypeError, ValueError):
        return fallback


def person_directions(person: dict | None) -> list[str]:
    if not person:
        return [MGX]
    raw = person.get("directions")
    if isinstance(raw, list) and raw:
        out = []
        for item in raw:
            d = norm_dir(item)
            if d not in out:
                out.append(d)
        return out or [MGX]
    role = str(person.get("role") or "")
    if role in {"art_director", "programmer"}:
        return [PLAYABLES]
    if role == "client":
        return [MGX, PLAYABLES]
    return [MGX]


def person_on(person: dict | None, direction: str) -> bool:
    want = norm_dir(direction)
    if str((person or {}).get("role") or "") in {"finance", "client"}:
        return True
    return want in person_directions(person)


def person_rate_for(person: dict | None, direction: str, fallback: float | None = None) -> float:
    if not person:
        return float(fallback or 0)
    rates = person.get("rates") if isinstance(person.get("rates"), dict) else {}
    raw = rates.get(norm_dir(direction))
    if raw in (None, ""):
        raw = person.get("rateUsd")
    try:
        n = float(raw)
        if n >= 0:
            return n
    except (TypeError, ValueError):
        pass
    if fallback is not None:
        return float(fallback)
    if person.get("role") == "manager":
        return 7.0 if norm_dir(direction) == PLAYABLES else 5.0
    return 15.0


def default_direction_for(person: dict | None) -> str:
    dirs = person_directions(person)
    if PLAYABLES in dirs and MGX not in dirs:
        return PLAYABLES
    return MGX


def crew_for(db: dict, direction: str) -> list[dict]:
    want = norm_dir(direction)
    people = db.get("people") or []
    if want == PLAYABLES:
        roles = {"manager", "art_director", "programmer", "designer"}
    else:
        roles = {"manager", "teamlead", "designer"}
    picked = [p for p in people if p.get("role") in roles and person_on(p, want)]
    return sorted(picked, key=lambda p: (p.get("payOrder") or 99, p.get("name") or ""))


def month_tasks(db: dict, ym: str, direction: str | None = None) -> list[dict]:
    rows = [t for t in db.get("tasks") or [] if (t.get("month") or ym) == ym]
    if direction:
        want = norm_dir(direction)
        rows = [t for t in rows if of_task(t) == want]
    return rows


def _ensure_person(db: dict, spec: dict) -> bool:
    people = db.setdefault("people", [])
    found = next((p for p in people if p.get("id") == spec["id"]), None)
    if found is None:
        people.append(dict(spec))
        return True
    dirty = False
    for key, val in spec.items():
        if key in {"id"}:
            continue
        if key == "directions":
            have = person_directions(found)
            for item in val:
                if item not in have:
                    have.append(item)
                    dirty = True
            if found.get("directions") != have:
                found["directions"] = have
                dirty = True
            continue
        if key == "rates":
            rates = dict(found.get("rates") or {})
            for d, n in val.items():
                if rates.get(d) != n:
                    rates[d] = n
                    dirty = True
            found["rates"] = rates
            continue
        if not found.get(key) and val:
            found[key] = val
            dirty = True
    return dirty


def ensure_crew(db: dict) -> bool:
    """Seats stay; people can change. Fill missing Playables crew and direction rates."""
    dirty = False
    if client_io.ensure_people(db):
        dirty = True
    if client_io.ensure_tasks(db):
        dirty = True
    meta = db.setdefault("meta", {})
    if meta.get("playableClientRateUsd") in (None, ""):
        meta["playableClientRateUsd"] = CLIENT_RATE[PLAYABLES]
        dirty = True
    for person in db.get("people") or []:
        role = str(person.get("role") or "")
        if "directions" not in person:
            if role == "client":
                cid = client_io.of_email(person.get("email") or "") or client_io.SUPERPLAY
                person["directions"] = [PLAYABLES] if cid == client_io.SLOTOMANIA else [MGX, PLAYABLES]
            elif role in {"finance", "manager"}:
                person["directions"] = [MGX, PLAYABLES]
            elif person.get("id") == "designer3":
                person["directions"] = [MGX, PLAYABLES]
            elif role in {"art_director", "programmer"}:
                person["directions"] = [PLAYABLES]
            else:
                person["directions"] = [MGX]
            dirty = True
        rates = person.setdefault("rates", {})
        if role == "manager":
            if rates.get(MGX) in (None, ""):
                rates[MGX] = float(person.get("rateUsd") or 5)
                dirty = True
            if rates.get(PLAYABLES) in (None, ""):
                rates[PLAYABLES] = 7.0
                dirty = True
            aliases = person.setdefault("aliases", [])
            for extra in ("Anastasia", "Anastasiia", "Анастасия"):
                if extra not in aliases:
                    aliases.append(extra)
                    dirty = True
            old_purple = str(person.get("color") or "").replace("#", "").lower()
            if old_purple in {"9d50dd", "7b2cbf", "a25ddc"}:
                person["color"] = "#FFD9A8"
                dirty = True
        elif role in PERFORMERS:
            if rates.get(MGX) in (None, "") and MGX in person_directions(person):
                rates[MGX] = float(person.get("rateUsd") or 15)
                dirty = True
            if rates.get(PLAYABLES) in (None, "") and PLAYABLES in person_directions(person):
                rates[PLAYABLES] = float(person.get("rateUsd") or 15)
                dirty = True
        if person.get("id") == "designer3" and PLAYABLES not in person_directions(person):
            person["directions"] = person_directions(person) + [PLAYABLES]
            rates.setdefault(PLAYABLES, 15)
            dirty = True
    for spec in PLAYABLE_CREW:
        if _ensure_person(db, spec):
            dirty = True
    for task in db.get("tasks") or []:
        if not is_playables(task):
            continue
        st = str(task.get("studioStatus") or "new")
        nxt = playable_norm_status(st)
        if nxt != st:
            if st == "quote" and playable_has_ad(task):
                task["programmerId"] = ""
            task["studioStatus"] = nxt
            task["mondayStatus"] = PLAY_STATUS.get(nxt, task.get("mondayStatus"))
            dirty = True
        before_html = bool(task.get("playableHtml"))
        touch_playable_html(task)
        if bool(task.get("playableHtml")) != before_html:
            dirty = True
    return dirty
