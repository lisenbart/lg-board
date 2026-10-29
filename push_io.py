"""Web Push for in-desk notices.

Subscriptions live in data/push_subs.json, not in db.json, so LP/client
state cannot leak endpoints. VAPID keys sit in data/secrets/vapid.json.
"""
from __future__ import annotations

import base64
import json
import threading
from pathlib import Path

import notice_io

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
VAPID_PATH = DATA / "secrets" / "vapid.json"
SUBS_PATH = DATA / "push_subs.json"
VAPID_MAIL = "mailto:board@lisenbart.games"
KEEP_PER_PERSON = 8
_LOCK = threading.Lock()
_VAPID = None


def ready() -> bool:
    try:
        import pywebpush  # noqa: F401
        from py_vapid import Vapid  # noqa: F401
    except ImportError:
        return False
    return True


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def ensure_vapid() -> dict:
    global _VAPID
    if _VAPID:
        return _VAPID
    if VAPID_PATH.is_file():
        try:
            got = json.loads(VAPID_PATH.read_text(encoding="utf-8"))
            if got.get("private") and got.get("public"):
                _VAPID = got
                return _VAPID
        except (OSError, json.JSONDecodeError, TypeError):
            pass
    if not ready():
        return {}
    from cryptography.hazmat.primitives import serialization
    from py_vapid import Vapid

    v = Vapid()
    v.generate_keys()
    priv = v.private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("ascii")
    pub = _b64(
        v.public_key.public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
    )
    _VAPID = {"private": priv, "public": pub}
    VAPID_PATH.parent.mkdir(parents=True, exist_ok=True)
    VAPID_PATH.write_text(json.dumps(_VAPID, indent=2) + "\n", encoding="utf-8")
    try:
        VAPID_PATH.chmod(0o600)
    except OSError:
        pass
    return _VAPID


def public_key() -> str:
    return str(ensure_vapid().get("public") or "")


def _load_subs() -> dict:
    if not SUBS_PATH.is_file():
        return {"people": {}}
    try:
        raw = json.loads(SUBS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, TypeError):
        return {"people": {}}
    people = raw.get("people") if isinstance(raw, dict) else None
    if not isinstance(people, dict):
        people = {}
    return {"people": people}


def _save_subs(store: dict) -> None:
    SUBS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = SUBS_PATH.with_name(SUBS_PATH.name + ".tmp")
    tmp.write_text(json.dumps(store, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(SUBS_PATH)


def _clean_sub(raw: dict | None) -> dict | None:
    if not isinstance(raw, dict):
        return None
    endpoint = str(raw.get("endpoint") or "").strip()
    keys = raw.get("keys") if isinstance(raw.get("keys"), dict) else {}
    p256dh = str(keys.get("p256dh") or "").strip()
    auth = str(keys.get("auth") or "").strip()
    if not endpoint.startswith("https://") or not p256dh or not auth:
        return None
    return {
        "endpoint": endpoint,
        "keys": {"p256dh": p256dh, "auth": auth},
        "userAgent": str(raw.get("userAgent") or "")[:180],
    }


def save_subscription(person_id: str, raw: dict | None) -> dict | None:
    pid = str(person_id or "").strip()
    sub = _clean_sub(raw)
    if not pid or not sub:
        return None
    with _LOCK:
        store = _load_subs()
        rows = [row for row in (store["people"].get(pid) or []) if isinstance(row, dict)]
        rows = [row for row in rows if row.get("endpoint") != sub["endpoint"]]
        rows.insert(0, sub)
        store["people"][pid] = rows[:KEEP_PER_PERSON]
        _save_subs(store)
    return sub


def drop_subscription(person_id: str, endpoint: str) -> int:
    pid = str(person_id or "").strip()
    url = str(endpoint or "").strip()
    if not pid or not url:
        return 0
    with _LOCK:
        store = _load_subs()
        rows = [row for row in (store["people"].get(pid) or []) if isinstance(row, dict)]
        keep = [row for row in rows if row.get("endpoint") != url]
        dropped = len(rows) - len(keep)
        if dropped:
            if keep:
                store["people"][pid] = keep
            else:
                store["people"].pop(pid, None)
            _save_subs(store)
    return dropped


def drop_endpoint(endpoint: str) -> int:
    url = str(endpoint or "").strip()
    if not url:
        return 0
    n = 0
    with _LOCK:
        store = _load_subs()
        people = store.get("people") or {}
        dirty = False
        for pid, rows in list(people.items()):
            keep = [row for row in (rows or []) if isinstance(row, dict) and row.get("endpoint") != url]
            gone = len(rows or []) - len(keep)
            if gone:
                n += gone
                dirty = True
                if keep:
                    people[pid] = keep
                else:
                    people.pop(pid, None)
        if dirty:
            _save_subs(store)
    return n


def count_for(person_id: str) -> int:
    pid = str(person_id or "").strip()
    if not pid:
        return 0
    with _LOCK:
        rows = (_load_subs().get("people") or {}).get(pid) or []
    return len([row for row in rows if isinstance(row, dict) and row.get("endpoint")])


def card(notice: dict | None) -> dict:
    notice = notice or {}
    if notice.get("kind") == "push.test":
        return {
            "title": "LG Board",
            "body": "Test ping — lock-screen notices work.",
            "taskId": "",
            "url": "/",
            "tag": "push-test",
        }
    spec = notice_io.KINDS.get(notice.get("kind") or "") or {}
    title = str(spec.get("label") or "Board")
    name = str((notice.get("payload") or {}).get("name") or "").strip()
    detail = notice_io.fill(str(spec.get("detail") or ""), notice.get("payload") or {})
    bits = [bit for bit in (name, detail) if bit]
    body = " · ".join(bits) or "New on the board"
    task_id = str(notice.get("taskId") or "")
    url = f"/?task={task_id}" if task_id else "/"
    return {"title": title, "body": body, "taskId": task_id, "url": url, "tag": task_id or str(notice.get("kind") or "lg-board")}


def send_one(sub: dict, payload: dict) -> str:
    """ok | gone | fail"""
    if not ready():
        return "fail"
    vapid = ensure_vapid()
    if not vapid.get("private"):
        return "fail"
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
            data=json.dumps(payload, ensure_ascii=True),
            vapid_private_key=vapid["private"],
            vapid_claims={"sub": VAPID_MAIL},
            ttl=86400,
            timeout=12,
        )
        return "ok"
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        detail = ""
        try:
            resp = getattr(exc, "response", None)
            detail = (getattr(resp, "text", None) or str(exc))[:240]
        except Exception:
            detail = str(exc)[:240]
        print(f"[push] send {status or 'fail'}: {detail}", flush=True)
        if status in (404, 410):
            return "gone"
        return "fail"
    except Exception as exc:
        print(f"[push] send error: {exc}", flush=True)
        return "fail"


def fanout(notice: dict | None, *, sender=None) -> int:
    notice = notice or {}
    people = [str(pid) for pid in (notice.get("audience") or []) if pid]
    if not people:
        return 0
    payload = card(notice)
    send = sender or send_one
    with _LOCK:
        store = _load_subs()
        rows = []
        for pid in people:
            for sub in store.get("people", {}).get(pid) or []:
                if isinstance(sub, dict) and sub.get("endpoint"):
                    rows.append(sub)
    n = 0
    gone = []
    failed = 0
    for sub in rows:
        result = send(sub, payload)
        if result == "ok":
            n += 1
        elif result == "gone":
            gone.append(sub.get("endpoint") or "")
        else:
            failed += 1
    for endpoint in gone:
        drop_endpoint(endpoint)
    print(
        f"[push] {notice.get('kind') or 'notice'} people={len(people)} "
        f"phones={len(rows)} sent={n} fail={failed} gone={len(gone)}",
        flush=True,
    )
    return n


def ping_person(person_id: str) -> int:
    pid = str(person_id or "").strip()
    if not pid:
        return 0
    return fanout(
        {
            "kind": "push.test",
            "audience": [pid],
            "taskId": "",
            "payload": {"name": "LG Board"},
        }
    )
