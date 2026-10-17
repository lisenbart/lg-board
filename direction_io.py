"""SUPERPLAY directions: MGX videos and Playables HTML ads on one desk."""
from __future__ import annotations

import re

MGX = "mgx"
PLAYABLES = "playables"
DIRECTIONS = (MGX, PLAYABLES)

LABELS = {MGX: "SUPERPLAY MGX", PLAYABLES: "SUPERPLAY Playables"}
SHORT = {MGX: "MGX", PLAYABLES: "Playables"}
DEPT = {MGX: "MGX", PLAYABLES: "Playables"}
CLIENT_RATE = {MGX: 35.0, PLAYABLES: 40.0}

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
    "storyboard": "Storyboard",
    "clientart": "Client art",
    "finalart": "Final art",
    "build": "Build",
    "htmlready": "HTML ready",
    "approve": "Send",
    "closed": "Closed",
}

PLAY_STATUS_BY_ROLE = {
    "art_director": {"new", "storyboard", "finalart", "build"},
    "programmer": {"build", "htmlready"},
    "designer": {"storyboard", "finalart"},
    "teamlead": {"storyboard", "finalart", "build"},
    "manager": {"storyboard", "clientart", "closed"},
    "finance": {"storyboard", "clientart", "closed"},
    "client": set(),
}

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


def of_name(name: str) -> str:
    text = str(name or "").strip()
    if re.match(r"^(DD|DX|DS)-P-", text, re.I):
        return PLAYABLES
    return MGX


def of_task(task: dict | None) -> str:
    if not task:
        return MGX
    raw = task.get("department") or task.get("direction") or ""
    return norm_dir(raw)


def is_playables(task: dict | None) -> bool:
    return of_task(task) == PLAYABLES


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
    meta = db.setdefault("meta", {})
    if meta.get("playableClientRateUsd") in (None, ""):
        meta["playableClientRateUsd"] = CLIENT_RATE[PLAYABLES]
        dirty = True
    for person in db.get("people") or []:
        role = str(person.get("role") or "")
        if "directions" not in person:
            if role in {"finance", "manager", "client"}:
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
    return dirty
