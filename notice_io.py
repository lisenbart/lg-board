"""In-portal notices: catalog + emit + receipts.

Add a kind in KINDS (and public/assets/notices.js). Call emit() from the
mutation. The inbox, row marks, and later channels (Telegram) read the catalog
— they do not grow a new if/else per event.
"""
from __future__ import annotations

from datetime import datetime, timezone

# channels: portal now. telegram is listed so a ping adapter can subscribe later
# without changing emit sites.
KINDS = {
    "task.landed": {
        "label": "New project",
        "title": "{name}",
        "detail": "Ready to start · needs a person",
        "mark": "new",
        "audience": {"roles": ["teamlead", "manager"]},
        "skip_actor": True,
        "channels": ["portal"],
    },
    "task.assigned": {
        "label": "On you",
        "title": "{name}",
        "detail": "Assigned to you",
        "mark": "mine",
        "audience": {"assignee": True},
        "skip_actor": True,
        "channels": ["portal"],
    },
    "task.revision": {
        "label": "Need fixing",
        "title": "{name}",
        "detail": "Need Fixing",
        "mark": "fix",
        "audience": {"assignee": True},
        "skip_actor": True,
        "channels": ["portal"],
    },
    "task.comment": {
        "label": "Client notes",
        "title": "{name}",
        "detail": "New note under the brief",
        "mark": "note",
        "audience": {"assignee": True},
        "skip_actor": True,
        "channels": ["portal"],
    },
    "task.tlcheck": {
        "label": "TL Check",
        "title": "{name}",
        "detail": "Result in · waiting for TL Check",
        "mark": "check",
        "audience": {"roles": ["teamlead"]},
        "skip_actor": True,
        "channels": ["portal"],
    },
    "task.check": {
        "label": "Check",
        "title": "{name}",
        "detail": "Check · send storyboard",
        "mark": "check",
        "audience": {"roles": ["manager"]},
        "skip_actor": True,
        "channels": ["portal"],
    },
    "task.artready": {
        "label": "Art ready",
        "title": "{name}",
        "detail": "Art ready · assign DEV",
        "mark": "done",
        "audience": {"roles": ["manager"]},
        "skip_actor": True,
        "channels": ["portal"],
    },
    "task.ready": {
        "label": "Ready to send",
        "title": "{name}",
        "detail": "Done · result link in",
        "mark": "send",
        "audience": {"roles": ["manager"]},
        "skip_actor": True,
        "channels": ["portal"],
    },
    "task.sent": {
        "label": "Sent to client",
        "title": "{name}",
        "detail": "Senior Approval",
        "mark": "",
        "audience": {"assignee": True, "roles": ["teamlead"]},
        "skip_actor": True,
        "channels": ["portal"],
    },
    "task.closed": {
        "label": "Closed",
        "title": "{name}",
        "detail": "Client accepted · Closed",
        "mark": "",
        "audience": {"assignee": True, "roles": ["teamlead"]},
        "skip_actor": True,
        "channels": ["portal"],
    },
}

KEEP = 400


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def fill(template: str, payload: dict) -> str:
    text = template or ""
    for key, val in (payload or {}).items():
        text = text.replace("{" + str(key) + "}", str(val or ""))
    return text


def person_name(db: dict, person_id: str) -> str:
    for person in db.get("people") or []:
        if person.get("id") == person_id:
            return person.get("name") or ""
    return ""


def resolve_audience(db: dict, spec: dict, task: dict | None, actor_id: str) -> list[str]:
    audience_spec = (spec or {}).get("audience") or {}
    seen: set[str] = set()
    ids: list[str] = []

    def add(pid: str | None) -> None:
        pid = str(pid or "").strip()
        if not pid or pid in seen:
            return
        seen.add(pid)
        ids.append(pid)

    roles = set(audience_spec.get("roles") or [])
    if roles:
        for person in db.get("people") or []:
            if person.get("role") in roles:
                add(person.get("id"))
    if audience_spec.get("assignee") and task:
        add(task.get("assigneeId"))
        add(task.get("programmerId"))
    for pid in audience_spec.get("person_ids") or []:
        add(pid)
    if spec.get("skip_actor"):
        ids = [pid for pid in ids if pid != actor_id]
    return ids


def ensure(db: dict) -> bool:
    """Create notice stores. Bootstrap from the board once on old databases."""
    mutated = False
    if "notices" not in db:
        db["notices"] = []
        db.setdefault("noticeReads", {})
        bootstrap(db)
        mutated = True
    db.setdefault("notices", [])
    db.setdefault("noticeReads", {})
    db.setdefault("meta", {})
    return mutated


def emit(db: dict, kind: str, *, actor_id: str = "", task: dict | None = None, payload: dict | None = None, at: str | None = None):
    spec = KINDS.get(kind)
    if not spec:
        return None
    ensure(db)
    task = task or {}
    body = dict(payload or {})
    body.setdefault("name", task.get("name") or "")
    body.setdefault("line", task.get("line") or "")
    body.setdefault("actorName", person_name(db, actor_id))
    audience = resolve_audience(db, spec, task, actor_id)
    if not audience:
        return None
    seq = int(db.get("meta", {}).get("noticeSeq") or 0) + 1
    db.setdefault("meta", {})["noticeSeq"] = seq
    notice = {
        "id": f"n-{seq}",
        "at": at or utc_now(),
        "kind": kind,
        "actorId": actor_id or "",
        "taskId": task.get("id") or "",
        "audience": audience,
        "payload": body,
        "channels": list(spec.get("channels") or ["portal"]),
    }
    db["notices"].insert(0, notice)
    db["notices"] = db["notices"][:KEEP]
    return notice


def for_person(db: dict, person_id: str, unread_only: bool = False) -> list[dict]:
    if not person_id:
        return []
    reads = (db.get("noticeReads") or {}).get(person_id) or {}
    out = []
    for notice in db.get("notices") or []:
        if person_id not in (notice.get("audience") or []):
            continue
        if unread_only and notice.get("id") in reads:
            continue
        out.append(notice)
    return out


def row_mark(db: dict, person_id: str, task_id: str) -> str:
    for notice in for_person(db, person_id, unread_only=True):
        if notice.get("taskId") != task_id:
            continue
        mark = (KINDS.get(notice.get("kind") or "") or {}).get("mark") or ""
        if mark:
            return mark
    return ""


def ack(
    db: dict,
    person_id: str,
    *,
    ids: list[str] | None = None,
    task_id: str | None = None,
    kinds: list[str] | None = None,
    all_mine: bool = False,
) -> int:
    if not person_id:
        return 0
    ensure(db)
    if not all_mine and ids is None and not task_id:
        return 0
    wanted = set(ids) if ids is not None else None
    kind_set = set(kinds) if kinds else None
    reads = db["noticeReads"].setdefault(person_id, {})
    stamp = utc_now()
    n = 0
    for notice in db.get("notices") or []:
        nid = notice.get("id")
        if not nid or person_id not in (notice.get("audience") or []):
            continue
        if nid in reads:
            continue
        if wanted is not None and nid not in wanted:
            continue
        if task_id and notice.get("taskId") != task_id:
            continue
        if kind_set and notice.get("kind") not in kind_set:
            continue
        reads[nid] = stamp
        n += 1
    return n


def on_landed(db: dict, task: dict, actor_id: str = "", at: str | None = None):
    return emit(db, "task.landed", actor_id=actor_id, task=task, at=at)


def on_task_change(db: dict, task: dict, before: dict | None, actor_id: str = ""):
    before = before or {}
    old_assignee = before.get("assigneeId") or ""
    new_assignee = task.get("assigneeId") or ""
    old_status = before.get("studioStatus")
    new_status = task.get("studioStatus")
    if new_assignee and new_assignee != old_assignee:
        emit(
            db,
            "task.assigned",
            actor_id=actor_id,
            task=task,
            payload={"from": old_assignee, "to": new_assignee},
        )
        ack(db, actor_id, task_id=task.get("id"), kinds=["task.landed"])
    old_prog = before.get("programmerId") or ""
    new_prog = task.get("programmerId") or ""
    if new_prog and new_prog != old_prog:
        emit(
            db,
            "task.assigned",
            actor_id=actor_id,
            task=task,
            payload={"from": old_prog, "to": new_prog},
        )
    if new_status and new_status != old_status:
        if new_status == "revision":
            emit(db, "task.revision", actor_id=actor_id, task=task)
        elif new_status == "tlcheck":
            emit(db, "task.tlcheck", actor_id=actor_id, task=task)
        elif new_status == "check":
            emit(db, "task.check", actor_id=actor_id, task=task)
        elif new_status == "artready":
            emit(db, "task.artready", actor_id=actor_id, task=task)
        elif new_status == "done":
            emit(db, "task.ready", actor_id=actor_id, task=task)
            ack(db, actor_id, task_id=task.get("id"), kinds=["task.revision", "task.assigned", "task.tlcheck", "task.check"])
        elif new_status == "approve":
            emit(db, "task.sent", actor_id=actor_id, task=task)
            ack(db, actor_id, task_id=task.get("id"), kinds=["task.ready", "task.check"])
        elif new_status == "closed":
            emit(db, "task.closed", actor_id=actor_id, task=task)
            ack(db, actor_id, task_id=task.get("id"), kinds=["task.sent", "task.ready"])


def bootstrap(db: dict) -> int:
    """One-time: turn the current board into unread notices (demo / old db)."""
    n = 0
    for task in db.get("tasks") or []:
        status = task.get("studioStatus")
        assignee = task.get("assigneeId") or ""
        at = ((task.get("activity") or [{}])[-1]).get("at")
        if status == "new" and not assignee:
            if on_landed(db, task, at=at):
                n += 1
        elif status == "done" and str(task.get("resultUrl") or "").strip():
            if emit(db, "task.ready", task=task, at=at):
                n += 1
        elif status == "revision" and assignee:
            if emit(db, "task.revision", task=task, at=at):
                n += 1
    return n
