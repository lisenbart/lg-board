"""Studio PIN login. SuperPlay uses /superplay. Pins live in data/secrets/pins.json."""
from __future__ import annotations

import ipaddress
import json
import re
import secrets
import socket
import threading
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from pathlib import Path

import playables_io

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
SECRETS = DATA / "secrets"
PINS_PATH = SECRETS / "pins.json"
SESSIONS_PATH = SECRETS / "sessions.json"
VISITS_PATH = SECRETS / "superplay_visits.json"
MAX_VISITS = 400
MAX_PLACE_ENRICH = 12
_VISITS_LOCK = threading.Lock()
_IP_PLACE_CACHE: dict[str, dict] = {}
_HOST_SKIP = {
    "dynamic",
    "static",
    "dhcp",
    "pool",
    "cust",
    "customer",
    "rev",
    "ptr",
    "ip",
    "nat",
    "broadband",
    "mobile",
    "host",
    "user",
    "clients",
    "client",
    "dyn",
    "cable",
    "dsl",
    "ftth",
    "ppp",
    "bb",
    "net",
    "wan",
}
# Longest suffix first. Studio-relevant ISPs (PL / UA / IL) plus a few VPNs.
HOST_PLACES = (
    ("play.pl", "Poland", "Play"),
    ("plus.pl", "Poland", "Plus"),
    ("orange.pl", "Poland", "Orange"),
    ("t-mobile.pl", "Poland", "T-Mobile"),
    ("tmobile.pl", "Poland", "T-Mobile"),
    ("netia.pl", "Poland", "Netia"),
    ("vectra.pl", "Poland", "Vectra"),
    ("inea.pl", "Poland", "Inea"),
    ("upc.pl", "Poland", "UPC"),
    ("kyivstar.net", "Ukraine", "Kyivstar"),
    ("kyivstar.ua", "Ukraine", "Kyivstar"),
    ("triolan.net", "Ukraine", "Triolan"),
    ("volia.net", "Ukraine", "Volia"),
    ("ukrtel.net", "Ukraine", "Ukrtelecom"),
    ("ukrtelecom.ua", "Ukraine", "Ukrtelecom"),
    ("lanet.ua", "Ukraine", "Lanet"),
    ("vegatele.com", "Ukraine", "Vega"),
    ("lifecell.ua", "Ukraine", "lifecell"),
    ("vodafone.ua", "Ukraine", "Vodafone"),
    ("datagroup.ua", "Ukraine", "Datagroup"),
    ("bezeqint.net", "Israel", "Bezeq"),
    ("netvision.net.il", "Israel", "Netvision"),
    ("partner.net.il", "Israel", "Partner"),
    ("pelephone.net.il", "Israel", "Pelephone"),
    ("cellcom.co.il", "Israel", "Cellcom"),
    ("hot.net.il", "Israel", "HOT"),
    ("013.net.il", "Israel", "013"),
    ("012.net.il", "Israel", "012"),
    ("nordvpn.com", "", "VPN"),
    ("expressvpn.com", "", "VPN"),
    ("mullvad.net", "", "VPN"),
    ("protonvpn.com", "", "VPN"),
)
TLD_COUNTRY = {
    "pl": "Poland",
    "ua": "Ukraine",
    "il": "Israel",
    "de": "Germany",
    "cz": "Czechia",
    "sk": "Slovakia",
    "at": "Austria",
    "hu": "Hungary",
    "ro": "Romania",
    "md": "Moldova",
    "lt": "Lithuania",
    "lv": "Latvia",
    "ee": "Estonia",
    "nl": "Netherlands",
    "be": "Belgium",
    "fr": "France",
    "es": "Spain",
    "it": "Italy",
    "gb": "UK",
    "uk": "UK",
    "ie": "Ireland",
    "us": "US",
    "cy": "Cyprus",
    "tr": "Turkey",
    "ge": "Georgia",
    "ae": "UAE",
    "ch": "Switzerland",
    "se": "Sweden",
    "no": "Norway",
    "fi": "Finland",
    "dk": "Denmark",
    "pt": "Portugal",
    "gr": "Greece",
    "bg": "Bulgaria",
    "rs": "Serbia",
    "hr": "Croatia",
    "si": "Slovenia",
}

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
    "art_director": "4429",
    "programmer": "4429",
    "client": "3500",
    CLIENT_EMAIL: "3500",
}
ROLE_PIN_KEYS = {
    "finance": "finance",
    "manager": "manager",
    "teamlead": "teamlead",
    "designer": "designer",
    "art_director": "art_director",
    "programmer": "programmer",
    "client": "client",
}
STUDIO_ROLES = (
    {"role": "finance", "label": "DL", "blurb": ""},
    {"role": "manager", "label": "LP", "blurb": "Line Producer"},
    {"role": "teamlead", "label": "TL", "blurb": "Team Lead"},
    {"role": "designer", "label": "MD", "blurb": "Motion design"},
    {"role": "art_director", "label": "AD", "blurb": "Art Director"},
    {"role": "programmer", "label": "DEV", "blurb": "Programmer"},
)
# Rank PINs (DL / LP / TL) open that desk and every seat below.
# Performers share a role PIN until someone gets a personal PIN.
# A personal PIN fully replaces the role PIN for that person — the old PIN
# no longer sits them, and it does not open other performer desks.
STUDIO_ROLE_IDS = (
    "finance",
    "manager",
    "teamlead",
    "designer",
    "art_director",
    "programmer",
)
PIN_OPENS = {
    "finance": STUDIO_ROLE_IDS,
    "manager": ("manager", "teamlead", "designer", "art_director", "programmer"),
    "teamlead": ("teamlead", "designer", "art_director", "programmer"),
    "designer": ("designer", "art_director", "programmer"),
    "art_director": ("designer", "art_director", "programmer"),
    "programmer": ("designer", "art_director", "programmer"),
}
ROLE_SEAT_ORDER = {
    "finance": 0,
    "manager": 1,
    "teamlead": 2,
    "designer": 3,
    "art_director": 4,
    "programmer": 5,
}
ROLE_SHORT = {row["role"]: row["label"] for row in STUDIO_ROLES}
PIN_RE = re.compile(r"^\d{4,8}$")
RANK_PIN_OWNERS = ("finance", "manager", "teamlead")

LOCK_ROLE = {
    "dmytro@lisenbart.games": "finance",
    "anastasiia@lisenbart.games": "manager",
    "lisenbart.games@gmail.com": None,
    CLIENT_EMAIL: "client",
}

CLIENT_META = (
    "client",
    "board",
    "month",
    "shiftHours",
    "mode",
    "bufferDirty",
    "rev",
    "clientRateUsd",
    "playableClientRateUsd",
)


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
    raw = _load_json(PINS_PATH, {})
    if not isinstance(raw, dict):
        raw = {}
    people = raw.get("people") if isinstance(raw.get("people"), dict) else {}
    pins = {
        str(k).strip().lower(): str(v).strip()
        for k, v in raw.items()
        if k and k != "people" and not isinstance(v, (dict, list))
    }
    changed = False
    if str(pins.get("teamlead") or "").strip() == "5514":
        pins["teamlead"] = "2026"
        changed = True
    for key, pin in DEFAULT_PINS.items():
        if not str(pins.get(key) or "").strip():
            pins[key] = pin
            changed = True
    people_out = {
        str(k).strip(): str(v).strip()
        for k, v in people.items()
        if str(k).strip() and str(v).strip()
    }
    if changed or not pins:
        payload = dict(pins)
        if people_out:
            payload["people"] = people_out
        _save_json(PINS_PATH, payload)
    pins["people"] = people_out
    return pins


def _save_pins(pins: dict) -> None:
    payload = {k: v for k, v in pins.items() if k != "people"}
    people = pins.get("people") if isinstance(pins.get("people"), dict) else {}
    people_out = {
        str(k).strip(): str(v).strip()
        for k, v in people.items()
        if str(k).strip() and str(v).strip()
    }
    if people_out:
        payload["people"] = people_out
    _save_json(PINS_PATH, payload)


def parse_pin(raw) -> tuple[str | None, str]:
    pin = str(raw or "").strip()
    if not pin:
        return None, ""
    if not PIN_RE.fullmatch(pin):
        return None, "PIN must be 4–8 digits"
    return pin, ""


def effective_pin(person: dict | None) -> str:
    if not person:
        return ""
    pins = ensure_pins()
    pid = str(person.get("id") or "")
    personal = str((pins.get("people") or {}).get(pid) or "").strip()
    if personal:
        return personal
    key = ROLE_PIN_KEYS.get(str(person.get("role") or "").strip().lower(), "")
    return str(pins.get(key) or "").strip()


def set_person_pin(people: list[dict], person_id: str, pin: str) -> str:
    pin, err = parse_pin(pin)
    if err:
        return err
    if not pin:
        return ""
    person = person_by_id(people, person_id)
    if not person:
        return "not found"
    pins = ensure_pins()
    people_map = dict(pins.get("people") or {})
    people_map[str(person_id)] = pin
    pins["people"] = people_map
    role = str(person.get("role") or "")
    key = ROLE_PIN_KEYS.get(role, "")
    same = [p for p in people or [] if p.get("role") == role]
    if key and len(same) <= 1:
        pins[key] = pin
        if role == "client":
            pins[CLIENT_EMAIL] = pin
    _save_pins(pins)
    return ""


def drop_person_pin(person_id: str) -> None:
    pins = ensure_pins()
    people_map = dict(pins.get("people") or {})
    if str(person_id) not in people_map:
        return
    people_map.pop(str(person_id), None)
    pins["people"] = people_map
    _save_pins(pins)


def attach_pins(db: dict) -> dict:
    out = dict(db or {})
    out["people"] = [dict(p, pin=effective_pin(p)) for p in (db or {}).get("people") or []]
    return out


def pin_unlocks(pin: str) -> bool:
    if pin_owner_roles(pin):
        return True
    got = str(pin or "").strip()
    for want in (ensure_pins().get("people") or {}).values():
        if _pin_eq(str(want or "").strip(), got):
            return True
    return False


def people_for_pin(people: list[dict], pin: str) -> list[dict]:
    got = str(pin or "").strip()
    if not got:
        return []
    personal = ensure_pins().get("people") or {}
    hits = []
    for person in people or []:
        want = str(personal.get(str(person.get("id") or "")) or "").strip()
        if want and _pin_eq(want, got):
            hits.append(person)
    return hits


def people_who_accept_pin(people: list[dict], pin: str) -> list[dict]:
    """Sit only people whose current PIN is this one. A personal PIN drops the role PIN."""
    got = str(pin or "").strip()
    if not got:
        return []
    personal = ensure_pins().get("people") or {}
    hits = []
    for person in people or []:
        pid = str(person.get("id") or "")
        want = str(personal.get(pid) or "").strip()
        if want:
            if _pin_eq(want, got):
                hits.append(person)
        elif pin_ok_for_role(str(person.get("role") or ""), got):
            hits.append(person)
    return hits


def pin_rank(pin: str) -> str:
    for owner in RANK_PIN_OWNERS:
        if pin_ok_for_role(owner, pin):
            return owner
    return ""


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


def pin_owner_roles(pin: str, people: list[dict] | None = None) -> tuple[str, ...]:
    """Roles this PIN may sit as. Rank PINs open the desks below. Personal PINs sit that person only."""
    rank = pin_rank(pin)
    if rank:
        return PIN_OPENS.get(rank, (rank,))
    if people is not None:
        unlocked: list[str] = []
        seen: set[str] = set()
        for person in people_who_accept_pin(people, pin):
            role = str(person.get("role") or "")
            if role and role not in seen:
                seen.add(role)
                unlocked.append(role)
        return tuple(unlocked)
    unlocked: list[str] = []
    seen: set[str] = set()

    def add_owner(owner: str) -> None:
        for role in PIN_OPENS.get(owner, (owner,)):
            if role not in seen:
                seen.add(role)
                unlocked.append(role)

    for owner in ("designer", "art_director", "programmer"):
        if pin_ok_for_role(owner, pin):
            add_owner(owner)
    return tuple(unlocked)


def resolve_studio_login(people: list[dict], pin: str, door_role: str = "", seat_id: str | None = None) -> dict:
    """Sit the door you clicked, if this PIN ranks high enough to open it."""
    rank = pin_rank(pin)
    door = str(door_role or "").strip()
    if rank:
        unlocked = PIN_OPENS.get(rank, (rank,))
        if door:
            if door not in unlocked:
                return {"error": "this PIN cannot open this seat"}
            roles = (door,)
        else:
            roles = unlocked
        matches = people_for_roles(people, roles)
    else:
        accepts = people_who_accept_pin(people, pin)
        unlocked = pin_owner_roles(pin, people)
        if not unlocked:
            return {"error": "wrong login or PIN"}
        if door:
            if door not in unlocked:
                return {"error": "this PIN cannot open this seat"}
            matches = [p for p in accepts if p.get("role") == door]
        else:
            matches = accepts
    if not matches:
        return {"error": "no seat for this login"}
    if seat_id:
        person = person_by_id(people, seat_id)
        allowed = {str(p.get("id") or "") for p in matches}
        if not person or str(person.get("id") or "") not in allowed:
            return {"error": "wrong login or PIN"}
        if door and str(person.get("role") or "") != door:
            return {"error": "wrong login or PIN"}
        return {"person": person}
    if len(matches) == 1:
        return {"person": matches[0]}
    return {"needSeat": True, "seats": [seat_payload(p) for p in matches]}


def seat_payload(person: dict) -> dict:
    role = str(person.get("role") or "")
    return {
        "id": person.get("id"),
        "name": person.get("name") or "",
        "role": role,
        "label": ROLE_SHORT.get(role, role),
    }


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
    "art_director": "lisenbart.games@gmail.com",
    "programmer": "lisenbart.games@gmail.com",
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


def people_for_roles(people: list[dict], roles) -> list[dict]:
    want = {str(r).strip() for r in (roles or []) if r}
    picked = [p for p in people or [] if p.get("role") in want]

    def key(person: dict):
        role = str(person.get("role") or "")
        try:
            order = int(person.get("payOrder") or 99)
        except (TypeError, ValueError):
            order = 99
        return (ROLE_SEAT_ORDER.get(role, 9), order, str(person.get("name") or "").lower())

    return sorted(picked, key=key)


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
        picked = [
            p
            for p in people
            if p.get("role") in {"teamlead", "designer", "art_director", "programmer"}
        ]
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


def _reverse_host(ip: str, timeout: float = 0.8) -> str:
    found = [""]

    def run() -> None:
        try:
            found[0] = str(socket.gethostbyaddr(ip)[0] or "").strip().rstrip(".").lower()
        except (OSError, socket.error, ValueError):
            found[0] = ""

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    thread.join(timeout)
    return found[0]


def place_from_host(host: str) -> dict:
    host = str(host or "").strip().lower().rstrip(".")
    if not host:
        return {"country": "", "isp": ""}
    try:
        ipaddress.ip_address(host)
        return {"country": "", "isp": ""}
    except ValueError:
        pass
    for suffix, country, isp in HOST_PLACES:
        if host == suffix or host.endswith("." + suffix):
            return {"country": country, "isp": isp}
    labels = [part for part in host.split(".") if part]
    if len(labels) >= 2 and labels[-2:] == ["co", "il"]:
        brand = labels[-3] if len(labels) >= 3 and labels[-3] not in _HOST_SKIP else ""
        return {
            "country": "Israel",
            "isp": brand.replace("-", " ").title() if brand else "",
        }
    tld = labels[-1] if labels else ""
    country = TLD_COUNTRY.get(tld, "")
    brand = ""
    for part in reversed(labels[:-1]):
        if part in _HOST_SKIP or part.replace("-", "").isdigit():
            continue
        brand = part
        break
    return {
        "country": country,
        "isp": brand.replace("-", " ").title() if brand else "",
    }


def lookup_ip_place(ip: str) -> dict:
    ip = str(ip or "").strip()
    cached = _IP_PLACE_CACHE.get(ip)
    if cached is not None:
        return dict(cached)
    place = {"host": "", "country": "", "isp": ""}
    if not ip:
        _IP_PLACE_CACHE[ip] = place
        return dict(place)
    try:
        addr = ipaddress.ip_address(ip.split("%", 1)[0])
    except ValueError:
        _IP_PLACE_CACHE[ip] = place
        return dict(place)
    if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved or addr.is_multicast:
        place = {"host": "", "country": "", "isp": "local"}
        _IP_PLACE_CACHE[ip] = place
        return dict(place)
    host = _reverse_host(ip)
    parsed = place_from_host(host)
    place = {
        "host": host[:120],
        "country": str(parsed.get("country") or "")[:40],
        "isp": str(parsed.get("isp") or "")[:60],
    }
    _IP_PLACE_CACHE[ip] = place
    return dict(place)


def _public_visit(row: dict) -> dict:
    return {
        "at": str(row.get("at") or ""),
        "login": str(row.get("login") or "SuperPlay"),
        "ip": str(row.get("ip") or ""),
        "ua": str(row.get("ua") or ""),
        "host": str(row.get("host") or "")[:120],
        "country": str(row.get("country") or "")[:40],
        "isp": str(row.get("isp") or "")[:60],
    }


def record_client_visit(*, login: str = "", ip: str = "", ua: str = "") -> None:
    ip = str(ip or "").strip()[:80]
    place = lookup_ip_place(ip)
    row = {
        "at": utc_now(),
        "login": " ".join(str(login or "").split())[:80] or "SuperPlay",
        "ip": ip,
        "ua": str(ua or "").strip()[:180],
        "host": str(place.get("host") or "")[:120],
        "country": str(place.get("country") or "")[:40],
        "isp": str(place.get("isp") or "")[:60],
    }
    try:
        with _VISITS_LOCK:
            rows = _load_json(VISITS_PATH, [])
            if not isinstance(rows, list):
                rows = []
            rows.insert(0, row)
            _save_json(VISITS_PATH, rows[:MAX_VISITS])
    except OSError:
        return


def client_visits() -> list:
    with _VISITS_LOCK:
        rows = _load_json(VISITS_PATH, [])
    if not isinstance(rows, list):
        return []
    out = []
    dirty = False
    enriched = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        item = _public_visit(row)
        needs_place = bool(item["ip"]) and not item["country"] and not item["isp"]
        if needs_place and enriched < MAX_PLACE_ENRICH:
            place = lookup_ip_place(item["ip"])
            item["host"] = str(place.get("host") or item["host"] or "")[:120]
            item["country"] = str(place.get("country") or "")[:40]
            item["isp"] = str(place.get("isp") or "")[:60]
            row["host"] = item["host"]
            row["country"] = item["country"]
            row["isp"] = item["isp"]
            dirty = True
            enriched += 1
        out.append(item)
    if dirty:
        try:
            with _VISITS_LOCK:
                _save_json(VISITS_PATH, rows[:MAX_VISITS])
        except OSError:
            pass
    return out


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
                "department": t.get("department") or "MGX",
                "game": t.get("game"),
                "month": t.get("month"),
                "shifts": t.get("shifts"),
                "hours": t.get("hours"),
                "studioStatus": t.get("studioStatus") or "new",
            }
            for t in db.get("tasks") or []
        ],
        "events": [],
    }


PAY_PEOPLE_KEYS = ("rates", "rateUsd", "iban", "bankCard", "taxId", "legalName", "bank", "pin")


def view_state(db: dict, sess: dict | None) -> dict:
    if not sess:
        return {"error": "sign in"}
    if sess.get("role") == "client" or sess.get("email") == CLIENT_EMAIL:
        return client_state(db)
    if sess.get("role") == "finance":
        out = attach_pins(db)
        out["superplayVisits"] = client_visits()
        return out
    people = []
    for person in db.get("people") or []:
        row = {key: val for key, val in person.items() if key not in PAY_PEOPLE_KEYS}
        people.append(row)
    tasks = []
    for task in db.get("tasks") or []:
        row = dict(task)
        dept = str(row.get("department") or row.get("direction") or "").lower()
        if dept.startswith("play"):
            row.pop("producerHours", None)
            row.pop("studioBuffer", None)
            row["hours"] = playables_io.crew_hours(task)
        tasks.append(row)
    out = dict(db)
    out["people"] = people
    out["tasks"] = tasks
    return out
