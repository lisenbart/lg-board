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
    "new": "Ready to Start",
    "wip": "WIP",
    "check": "Check",
    "revision": "Need Fixing",
    "clientart": "Sent · Art",
    "artready": "to DEV",
    "done": "Done",
    "approve": "Sent · HTML",
    "closed": "Closed",
    "paused": "On Pause",
    "cancelled": "Cancelled",
}

PLAY_OPS_STATUSES = (
    "new",
    "wip",
    "check",
    "clientart",
    "revision",
    "artready",
    "done",
    "approve",
    "closed",
    "paused",
    "cancelled",
)

PLAY_STATUS_BY_ROLE = {
    "art_director": {"wip", "check"},
    "programmer": {"wip", "check"},
    "designer": {"wip", "check"},
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
    "finalart": "artready",
    "tlcheck": "check",
}


def playable_norm_status(st) -> str:
    """Map leftover chips onto the two-loop Playables pipeline."""
    key = str(st or "new")
    if key in PLAY_STATUS:
        return key
    return _LEGACY_PLAYABLE.get(key, "new")


def playable_status_receipt_label(task: dict | None, st) -> str:
    """Card status log label: Art / MD / HTML flavours so the receipt matches the chip."""
    key = playable_norm_status(st)
    # Stamp runs after studioStatus write — evaluate flags as if the card sits on `key`.
    snap = {**(task or {}), "studioStatus": key}
    html = playable_in_html(snap)
    if key == "wip":
        if playable_md_pending(snap):
            return "WIP · MD"
        return "WIP · HTML" if html else "WIP · Art"
    if key == "check":
        return "Check · HTML" if html else "Check · Art"
    if key == "revision":
        return "Need Fixing · HTML" if html else "Need Fixing · Art"
    return PLAY_STATUS.get(key) or str(st or "")


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


ART_LOOP = {"new", "clientart"}
HTML_HANDOFF = {"artready", "done", "approve"}


def _same_playable_link(a, b) -> bool:
    one = str(a or "").strip().rstrip("/")
    two = str(b or "").strip().rstrip("/")
    return bool(one) and one == two


def playable_storyboard_url(task: dict | None) -> str:
    return str((task or {}).get("storyboardUrl") or "").strip()


def playable_html_url(task: dict | None) -> str:
    task = task or {}
    board = playable_storyboard_url(task)
    draft = str(task.get("htmlUrl") or "").strip()
    if not playable_in_html(task):
        return "" if _same_playable_link(draft, board) else draft
    result = str(task.get("resultUrl") or "").strip()
    if result and not _same_playable_link(result, board):
        return result
    if draft and not _same_playable_link(draft, board):
        return draft
    # Shared pack folder: art and HTML point at the same URL — still expose HTML.
    if result or draft:
        return result or draft
    return ""


def playable_art_url(task: dict | None) -> str:
    task = task or {}
    board = playable_storyboard_url(task)
    if board:
        return board
    result = str(task.get("resultUrl") or "").strip()
    if not playable_in_html(task):
        return result
    html = str(task.get("htmlUrl") or "").strip()
    if result and not _same_playable_link(result, html):
        return result
    return ""


def playable_sequence_url(task: dict | None) -> str:
    return str((task or {}).get("sequenceUrl") or "").strip()


def playable_sequence_ready(task: dict | None) -> bool:
    return bool((task or {}).get("sequenceReady"))


def playable_motion_id(task: dict | None) -> str:
    return str((task or {}).get("motionId") or "").strip()


def playable_md_pending(task: dict | None) -> bool:
    """HTML fix waits on MD sequence before DEV owns the card."""
    task = task or {}
    if not is_playables(task) or not playable_in_html(task):
        return False
    if not playable_motion_id(task):
        return False
    if playable_sequence_ready(task):
        return False
    st = playable_norm_status(task.get("studioStatus"))
    return st in {"revision", "wip", "new"}


def clear_playable_sequence_ready(task: dict | None) -> None:
    if task is not None:
        task["sequenceReady"] = False


def mark_playable_sequence_ready(task: dict | None) -> None:
    if task is not None:
        task["sequenceReady"] = True


def touch_link_stamps(task: dict | None, before: dict | None = None, *, handed: bool = False, now: str = "") -> None:
    """Quiet Updated time on Storyboard / HTML. Same URL still stamps on Send to LP."""
    task = task or {}
    before = before or {}
    now = str(now or "").strip()
    if not now:
        return
    if not is_playables(task):
        result_now = str(task.get("resultUrl") or "").strip()
        result_was = str(before.get("resultUrl") or "").strip()
        if not result_now:
            task.pop("resultUpdatedAt", None)
        elif result_now != result_was or handed:
            task["resultUpdatedAt"] = now
        return
    was = dict(task)
    for key in ("resultUrl", "htmlUrl", "storyboardUrl", "sequenceUrl", "studioStatus", "playableHtml"):
        if key in before:
            was[key] = before[key]
    html_now = playable_html_url(task)
    html_was = playable_html_url(was)
    if not html_now:
        task.pop("htmlUpdatedAt", None)
    elif html_now != html_was or (handed and playable_in_html(task)):
        task["htmlUpdatedAt"] = now
    art_now = playable_art_url(task)
    art_was = playable_art_url(was)
    if not art_now:
        task.pop("storyboardUpdatedAt", None)
    elif art_now != art_was or (handed and not playable_in_html(task)):
        task["storyboardUpdatedAt"] = now
    seq_now = playable_sequence_url(task)
    seq_was = playable_sequence_url(was)
    if not seq_now:
        task.pop("sequenceUpdatedAt", None)
    elif seq_now != seq_was:
        task["sequenceUpdatedAt"] = now


def _status_before(task: dict, st: str) -> str:
    for item in reversed(task.get("statusLog") or []):
        if not isinstance(item, dict):
            continue
        if playable_norm_status(item.get("to")) == st:
            return playable_norm_status(item.get("from"))
    return ""


def playable_work_ids(task: dict | None) -> list[str]:
    """Who works this loop: MD while sequence pending, else AD on art / DEV on HTML."""
    task = task or {}
    if playable_md_pending(task):
        mid = playable_motion_id(task)
        return [mid] if mid else []
    if playable_in_html(task):
        pid = str(task.get("programmerId") or "").strip()
        return [pid] if pid else []
    if playable_has_ad(task):
        aid = str(task.get("assigneeId") or "").strip()
        return [aid] if aid else []
    pid = str(task.get("programmerId") or "").strip()
    return [pid] if pid else []


def playable_crew_ids(task: dict | None) -> list[str]:
    """AD, DEV, and MD seated on the card."""
    task = task or {}
    ids: list[str] = []
    if playable_has_ad(task):
        aid = str(task.get("assigneeId") or "").strip()
        if aid:
            ids.append(aid)
    pid = str(task.get("programmerId") or "").strip()
    if pid and pid not in ids:
        ids.append(pid)
    mid = playable_motion_id(task)
    if mid and mid not in ids:
        ids.append(mid)
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
    if st in {"closed", "approve", "clientart", "paused", "cancelled"}:
        return ""
    if html:
        if playable_md_pending(task):
            return "designer"
        if st == "done":
            return "manager"
        if st == "revision":
            return "programmer" if dev else "manager"
        if st == "check":
            if playable_dev_delivered(task):
                return "manager"
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
    if st in {"new", "wip", "revision"}:
        return "art_director" if has_ad else "manager"
    if st == "check":
        if has_ad and not playable_ad_delivered(task):
            return "art_director"
        return "manager"
    return ""


def playable_part_open(task: dict | None, role: str, person_id: str = "") -> bool:
    """Active while seated and this seat's work is not yet accepted. Send to LP does not grey the row — LP still has to check. Need Fixing reopens the person who must fix it."""
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
        return st in {"new", "wip", "revision", "check"}
    if role == "designer":
        if playable_motion_id(task) != actor:
            return False
        return playable_md_pending(task)
    if role == "programmer":
        if str(task.get("programmerId") or "") != actor:
            return False
        if st in {"approve", "closed", "clientart", "done"}:
            return False
        if playable_md_pending(task):
            return False
        if playable_in_html(task):
            return st in {"new", "wip", "revision", "artready", "check"}
        return False
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
    if st == "closed" or st == "cancelled":
        return False
    if st == "paused":
        return bool(task.get("playableHtml"))
    dev_only = not playable_has_ad(task) and bool(str(task.get("programmerId") or "").strip())
    if st == "check":
        if bool(task.get("playableHtml")) or dev_only:
            return True
        handed = str(task.get("handedBy") or "").strip()
        dev = str(task.get("programmerId") or "").strip()
        return bool(handed and dev and handed == dev)
    if dev_only and st not in {"clientart"}:
        return True
    if st in ART_LOOP:
        return False
    if st in HTML_HANDOFF:
        return True
    if st in {"wip", "revision"}:
        prev = _status_before(task, st)
        if prev == "check":
            return bool(task.get("playableHtml")) or dev_only
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
    if force_art and st in {"wip", "revision", "check"}:
        board = str(task.get("storyboardUrl") or "").strip()
        if board:
            task["resultUrl"] = board
        task["playableHtml"] = False
        task["htmlUrl"] = ""
        task["handedToLp"] = False
        task["handedBy"] = ""
        return
    if st == "check":
        prev_st = playable_norm_status(prev) if prev else _status_before(task, st)
        if (
            bool(task.get("playableHtml"))
            or prev_st in HTML_HANDOFF
            or (not playable_has_ad(task) and bool(str(task.get("programmerId") or "").strip()))
        ):
            task["playableHtml"] = True
        return
    if st == "paused":
        return
    if st in ART_LOOP or st in {"closed", "cancelled"}:
        if task.get("playableHtml"):
            task["playableHtml"] = False
        return
    if st == "artready":
        task["playableHtml"] = True
        result = str(task.get("resultUrl") or "").strip()
        story = str(task.get("storyboardUrl") or "").strip()
        html = str(task.get("htmlUrl") or "").strip()
        if result and not story:
            task["storyboardUrl"] = result
            story = result
        if html and _same_playable_link(html, story):
            task["htmlUrl"] = ""
            html = ""
        if html and (not result or _same_playable_link(result, story)):
            task["resultUrl"] = html
        elif story and (not result or _same_playable_link(result, story)):
            task["resultUrl"] = ""
        return
    if st in {"done", "approve"}:
        task["playableHtml"] = True
        # Lock art into storyboardUrl when HTML takes over resultUrl.
        # Code-only cards have no art — do not invent storyboard from the HTML link
        # (that would make Done look unsendable: result == storyboard).
        result = str(task.get("resultUrl") or "").strip()
        story = str(task.get("storyboardUrl") or "").strip()
        html = str(task.get("htmlUrl") or "").strip()
        if not story and result and html and not _same_playable_link(result, html):
            task["storyboardUrl"] = result
            story = result
            task["resultUrl"] = html
        elif not story and result and html and _same_playable_link(result, html) and st == "approve":
            task["storyboardUrl"] = result
        return
    if st in {"wip", "revision"}:
        prev_st = playable_norm_status(prev) if prev else _status_before(task, st)
        if prev_st == "check":
            if task.get("playableHtml") or (
                not playable_has_ad(task) and bool(str(task.get("programmerId") or "").strip())
            ):
                task["playableHtml"] = True
            else:
                task["playableHtml"] = False
            return
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


def comment_loop_key(raw, task: dict | None = None) -> str:
    """Playables client notes are Art or HTML so AD / DEV can see whose fix it is."""
    key = str(raw or "").strip().lower()
    if key in {"html", "dev", "programmer"}:
        return "html"
    if key in {"art", "ad", "art_director"}:
        return "art"
    if task and is_playables(task):
        return "html" if playable_in_html(task) else "art"
    return ""


def apply_client_note_bounce(task: dict | None, role: str, force_art: bool = False) -> bool:
    """LP/DL client note is a bounce. Art loop → Need Fixing · Art. HTML loop → Need Fixing · HTML. Closed stays closed."""
    if role not in {"manager", "finance"}:
        return False
    task = task or {}
    if is_playables(task):
        st = playable_norm_status(task.get("studioStatus"))
        if st in {"closed", "cancelled", "paused", "revision"}:
            return False
        prev = st
        task["studioStatus"] = "revision"
        task["mondayStatus"] = PLAY_STATUS["revision"]
        touch_playable_html(task, prev=prev, force_art=bool(force_art))
        if playable_in_html(task):
            clear_playable_sequence_ready(task)
            task["sequenceUrl"] = ""
        return True
    st = str(task.get("studioStatus") or "new")
    if st in {"closed", "cancelled", "paused", "revision"}:
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
        "paused": "On Pause",
        "cancelled": "Cancelled",
    }
    if is_playables(task):
        st = playable_norm_status(task.get("studioStatus"))
        if st != "revision":
            return False
        html = playable_in_html(task)
        prev = _status_before(task, "revision")
        if not prev or prev == "revision":
            prev = "artready" if html else "new"
        if prev == "clientart":
            prev = "check"
        elif prev == "approve":
            prev = "done"
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
    """AD/DEV/MD may start WIP. Done, Need Fixing, Art ready and the rest are LP."""
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
    if role == "designer":
        if not playable_md_pending(task):
            return []
        if st in {"revision", "new"}:
            return ["wip"]
        return []
    if role == "programmer":
        if playable_md_pending(task):
            return []
        if st == "artready":
            return ["wip"]
        if st == "check" and (html or not has_ad or playable_dev_delivered(task)):
            return ["wip"]
        if not has_ad and st == "new":
            return ["wip"]
        if st == "revision" and (html or not has_ad):
            return ["wip"]
        return []
    return []


def playable_handoff_status(role: str, task: dict | None) -> str:
    """AD/DEV hand work to LP. MD hands sequence to DEV. Check is the inbox after Send — art and HTML. notify does not change status."""
    task = task or {}
    st = playable_norm_status(task.get("studioStatus"))
    html = playable_in_html(task)
    if role == "art_director":
        if html:
            return ""
        if st in {"new", "wip", "revision"}:
            return "check"
        if playable_ad_delivered(task):
            return ""
        return ""
    if role == "designer":
        if playable_md_pending(task) and st in {"new", "wip", "revision"}:
            return "check"
        return ""
    if role == "programmer":
        if playable_md_pending(task):
            return ""
        if st in {"artready", "wip", "revision"} and html:
            return "check"
        if not playable_has_ad(task) and st in {"new", "wip", "revision"}:
            return "check"
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
    if nxt == "approve" and role not in {"manager", "finance"}:
        return False, "Send is set only when you Send to client"
    if nxt in {"closed", "paused", "cancelled"}:
        if role in {"manager", "finance"}:
            return True, ""
        return False, "Only LP / DL can set Closed, On Pause, or Cancelled"
    if role in {"manager", "finance"}:
        if nxt in PLAY_OPS_STATUSES:
            return True, ""
        return False, f"{role} cannot set {nxt}"
    if role == "art_director" and actor_id and str(task.get("assigneeId") or "") != str(actor_id):
        return False, "Only the AD on the card sets art status"
    if role == "programmer" and actor_id and str(task.get("programmerId") or "") != str(actor_id):
        return False, "Only the DEV on the card sets HTML status"
    if role == "designer" and actor_id and playable_motion_id(task) != str(actor_id):
        return False, "Only the MD on the card sets sequence status"
    if nxt in {"done", "revision", "artready", "clientart"} and role not in {"manager", "finance"}:
        return False, "Only LP sets Done, Need Fixing, and the next step"
    if role == "designer" and nxt == "check" and not playable_sequence_url(task):
        return False, "Paste the sequence link before Send to DEV"
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
        wanted = PLAY_STATUS.get(nxt)
        if wanted and str(task.get("mondayStatus") or "") in {"Art ready", "Art OK", "Build"}:
            task["mondayStatus"] = wanted
            dirty = True
        before_html = bool(task.get("playableHtml"))
        touch_playable_html(task)
        if bool(task.get("playableHtml")) != before_html:
            dirty = True
        # Heal: HTML already on the card but stuck on Sent · Art (Send from HTML Check).
        if nxt == "clientart" and playable_html_url(task):
            story = playable_storyboard_url(task)
            result = str(task.get("resultUrl") or "").strip()
            if result and not story:
                task["storyboardUrl"] = result
            task["studioStatus"] = "approve"
            task["mondayStatus"] = PLAY_STATUS["approve"]
            task["playableHtml"] = True
            touch_playable_html(task)
            dirty = True
            nxt = "approve"
        if nxt == "approve":
            wanted_html = PLAY_STATUS["approve"]
            if str(task.get("mondayStatus") or "") in {"Send", "Client art", "Sent", "Sent · Art"}:
                task["mondayStatus"] = wanted_html
                dirty = True
            if not task.get("playableHtml"):
                task["playableHtml"] = True
                dirty = True
            # Backfill storyboard if art only lived in resultUrl before HTML mode.
            story = playable_storyboard_url(task)
            result = str(task.get("resultUrl") or "").strip()
            html = str(task.get("htmlUrl") or "").strip()
            if not story and result:
                task["storyboardUrl"] = result
                dirty = True
            elif not story and html:
                task["storyboardUrl"] = html
                dirty = True
        elif nxt == "clientart":
            wanted_art = PLAY_STATUS["clientart"]
            if str(task.get("mondayStatus") or "") in {"Client art", "Sent", "Send"}:
                task["mondayStatus"] = wanted_art
                dirty = True
    return dirty
