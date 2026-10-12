"""Studio PIN login. SuperPlay uses /hours. Pins live in data/secrets/pins.json."""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
SECRETS = DATA / "secrets"
PINS_PATH = SECRETS / "pins.json"
SESSIONS_PATH = SECRETS / "sessions.json"

COOKIE = "lg"
MAX_SESSIONS = 200

STUDIO_ACCOUNTS = (
    "dmytro@lisenbart.games",
    "anastasiia@lisenbart.games",
    "lisenbart.games@gmail.com",
)
CLIENT_EMAIL = "superplay@lg-board"
ALIASES = {
    "dmytro": "dmytro@lisenbart.games",
    "anastasiia": "anastasiia@lisenbart.games",
    "anastasia": "anastasiia@lisenbart.games",
    "team": "lisenbart.games@gmail.com",
    "designers": "lisenbart.games@gmail.com",
    "superplay": CLIENT_EMAIL,
    "sp": CLIENT_EMAIL,
}


def resolve_email(raw: str) -> str:
    text = str(raw or "").strip().lower()
    return ALIASES.get(text, text)


def door_allows(door: str, email: str) -> bool:
    door = str(door or "").strip().lower()
    if door == "client":
        return email == CLIENT_EMAIL
    if door == "studio":
        return email in STUDIO_ACCOUNTS
    return email in LOCK_ROLE

DEFAULT_PINS = {
    "finance": "3245",
    "manager": "1726",
    "teamlead": "2026",
    "designer": "4429",
    "client": "3500",
    CLIENT_EMAIL: "3500",
}
ROLE_PIN_KEYS = {
    "finance": "finance",
    "manager": "manager",
    "teamlead": "teamlead",
    "designer": "designer",
    "client": "client",
}
STUDIO_ROLES = (
    {"role": "finance", "label": "DL", "blurb": ""},
    {"role": "manager", "label": "LP", "blurb": "Line Producer"},
    {"role": "teamlead", "label": "TL", "blurb": "Team Lead"},
    {"role": "designer", "label": "MD", "blurb": "Motion design"},
)

LOCK_ROLE = {
    "dmytro@lisenbart.games": "finance",
    "anastasiia@lisenbart.games": "manager",
    "lisenbart.games@gmail.com": None,
    CLIENT_EMAIL: "client",
}

CLIENT_META = ("client", "board", "month", "shiftHours", "mode", "bufferDirty")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _load_json(path: Path, fallback):
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def _save_json(path: Path, payload) -> None:
    SECRETS.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def ensure_pins() -> dict:
    pins = _load_json(PINS_PATH, {})
    if not isinstance(pins, dict):
        pins = {}
    changed = False
    if str(pins.get("teamlead") or "").strip() == "5514":
        pins["teamlead"] = "2026"
        changed = True
    for key, pin in DEFAULT_PINS.items():
        if not str(pins.get(key) or "").strip():
            pins[key] = pin
            changed = True
    if changed or not pins:
        _save_json(PINS_PATH, pins)
    return {str(k).strip().lower(): str(v).strip() for k, v in pins.items() if k}


def _pin_eq(want: str, got: str) -> bool:
    if not want or not got or len(want) != len(got):
        return False
    acc = 0
    for a, b in zip(want.encode("utf-8"), got.encode("utf-8")):
        acc |= a ^ b
    return acc == 0


def pin_ok(email: str, pin: str) -> bool:
    want = ensure_pins().get(str(email or "").strip().lower(), "")
    return _pin_eq(want, str(pin or "").strip())


def pin_ok_for_role(role: str, pin: str) -> bool:
    key = ROLE_PIN_KEYS.get(str(role or "").strip().lower(), "")
    want = ensure_pins().get(key, "")
    return _pin_eq(want, str(pin or "").strip())


def _sessions() -> dict:
    raw = _load_json(SESSIONS_PATH, {})
    return raw if isinstance(raw, dict) else {}


def _save_sessions(rows: dict) -> None:
    if len(rows) > MAX_SESSIONS:
        ordered = sorted(rows.items(), key=lambda kv: str((kv[1] or {}).get("at") or ""))
        rows = dict(ordered[-MAX_SESSIONS:])
    _save_json(SESSIONS_PATH, rows)


ROLE_EMAIL = {
    "finance": "dmytro@lisenbart.games",
    "manager": "anastasiia@lisenbart.games",
    "teamlead": "lisenbart.games@gmail.com",
    "designer": "lisenbart.games@gmail.com",
    "client": CLIENT_EMAIL,
}

def email_for_person(person: dict | None) -> str:
    if not person:
        return ""
    return ROLE_EMAIL.get(str(person.get("role") or ""), "")


def studio_roster(people: list[dict]) -> dict:
    designers = []
    for person in people or []:
        if person.get("role") != "designer":
            continue
        try:
            order = int(person.get("payOrder") or 99)
        except (TypeError, ValueError):
            order = 99
        designers.append(
            {
                "id": person.get("id"),
                "name": person.get("name") or "",
                "role": "designer",
                "payOrder": order,
            }
        )
    designers.sort(key=lambda row: (int(row.get("payOrder") or 99), str(row.get("name") or "").lower()))
    for row in designers:
        row.pop("payOrder", None)
    return {"studio": [dict(item) for item in STUDIO_ROLES], "designers": designers}


def people_for_role(people: list[dict], role: str) -> list[dict]:
    want = str(role or "").strip()
    return [p for p in people or [] if p.get("role") == want]


def person_by_id(people: list[dict], seat_id: str) -> dict | None:
    want = str(seat_id or "")
    if not want:
        return None
    for person in people or []:
        if str(person.get("id") or "") == want:
            return person
    return None


def seats_for(email: str, people: list[dict]) -> list[dict]:
    role = LOCK_ROLE.get(str(email or "").strip().lower())
    if role:
        picked = [p for p in people if p.get("role") == role]
    else:
        picked = [p for p in people if p.get("role") in {"teamlead", "designer"}]
    out = []
    for person in picked:
        out.append(
            {
                "id": person.get("id"),
                "name": person.get("name") or "",
                "role": person.get("role") or "",
            }
        )
    return out


def pick_seat(email: str, people: list[dict], seat_id: str | None) -> dict | None:
    seats = seats_for(email, people)
    if not seats:
        return None
    if seat_id:
        for row in seats:
            if str(row.get("id") or "") == str(seat_id):
                return row
    return seats[0]


def create_session(email: str, seat: dict) -> str:
    token = secrets.token_urlsafe(32)
    rows = _sessions()
    rows[token] = {
        "email": str(email).strip().lower(),
        "seatId": seat.get("id"),
        "role": seat.get("role"),
        "personId": seat.get("id"),
        "at": utc_now(),
    }
    _save_sessions(rows)
    return token


def drop_session(token: str) -> None:
    if not token:
        return
    rows = _sessions()
    if token in rows:
        rows.pop(token, None)
        _save_sessions(rows)


def session_of(token: str) -> dict | None:
    if not token:
        return None
    row = _sessions().get(token)
    if not isinstance(row, dict) or not row.get("email"):
        return None
    return row


def switch_seat(token: str, people: list[dict], seat_id: str) -> dict | None:
    row = session_of(token)
    if not row:
        return None
    email = row.get("email")
    if email == CLIENT_EMAIL or LOCK_ROLE.get(email):
        return row
    seat = pick_seat(email, people, seat_id)
    if not seat:
        return None
    rows = _sessions()
    cur = rows.get(token) or {}
    cur.update(
        {
            "seatId": seat.get("id"),
            "role": seat.get("role"),
            "personId": seat.get("id"),
            "at": utc_now(),
        }
    )
    rows[token] = cur
    _save_sessions(rows)
    return cur


def cookie_header(token: str, *, clear: bool = False, secure: bool = False) -> str:
    if clear:
        return f"{COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
    parts = [f"{COOKIE}={token}", "Path=/", "Max-Age=2592000", "HttpOnly", "SameSite=Lax"]
    if secure:
        parts.append("Secure")
    return "; ".join(parts)


def token_from_header(cookie_header_value: str) -> str:
    jar = SimpleCookie()
    try:
        jar.load(cookie_header_value or "")
    except (KeyError, ValueError):
        return ""
    morsel = jar.get(COOKIE)
    return (morsel.value if morsel else "") or ""


def client_state(db: dict) -> dict:
    meta = db.get("meta") or {}
    return {
        "meta": {key: meta.get(key) for key in CLIENT_META},
        "people": [
            {
                "id": p.get("id"),
                "name": p.get("name") or "SuperPlay",
                "role": "client",
                "email": p.get("email") or CLIENT_EMAIL,
            }
            for p in db.get("people") or []
            if p.get("role") == "client"
        ],
        "tasks": [
            {
                "id": t.get("id"),
                "name": t.get("name"),
                "line": t.get("line"),
                "game": t.get("game"),
                "month": t.get("month"),
                "shifts": t.get("shifts"),
                "hours": t.get("hours"),
            }
            for t in db.get("tasks") or []
        ],
        "events": [],
    }


def view_state(db: dict, sess: dict | None) -> dict:
    if not sess:
        return {"error": "sign in"}
    if sess.get("role") == "client" or sess.get("email") == CLIENT_EMAIL:
        return client_state(db)
    return db
