#!/usr/bin/env python3
"""Lisenbart studio portal — local/cloud HTTP app (stdlib only)."""
from __future__ import annotations

import base64
import json
import re
import threading
import tempfile
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse

import auth_io
import drive_io
import excel_io
import finance_io
import mirror_io
import notice_io

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
DATA = ROOT / "data"
DB_PATH = DATA / "db.json"
SEED_PATH = DATA / "seed.json"
PORT = 43141
LOCK = threading.Lock()

EMAIL_LINE = re.compile(
    r"^\s*([A-Z]{2}-[A-Za-z0-9._-]+)\s*\|\s*([\d]+(?:[.,]\d+)?)\s*shifts?\s*$",
    re.I,
)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_db() -> dict:
    DATA.mkdir(exist_ok=True)
    if not DB_PATH.exists():
        db = json.loads(SEED_PATH.read_text(encoding="utf-8"))
        notice_io.ensure(db)
        if (db.get("meta") or {}).get("mode") == "mirror":
            mirror_io.restore_buffer_xlsx()
        save_db(db, origin=True)
        return db
    db = json.loads(DB_PATH.read_text(encoding="utf-8"))
    if notice_io.ensure(db):
        save_db(db)
    meta = db.get("meta") or {}
    if meta.get("mode") == "mirror" and not meta.get("bufferDirty") and mirror_io.ORIGIN_XLSX.exists():
        mirror_io.restore_buffer_xlsx()
    return db


def save_db(db: dict, origin: bool = False) -> None:
    meta = db.setdefault("meta", {})
    if origin:
        meta["bufferDirty"] = False
    elif meta.get("mode") == "mirror":
        meta["bufferDirty"] = True
    DB_PATH.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")


def hours_from_shift(shift: float) -> float:
    return round(shift * 9, 1)


def parse_money(val):
    if val is None or val == "":
        return None
    n = float(str(val).replace(",", "."))
    if n < 0:
        raise ValueError("rate must be 0 or more")
    return n


def parse_tax(val):
    """Store tax as a fraction (0.06 = 6%). 6 also means 6%."""
    n = parse_money(val)
    if n is None:
        raise ValueError("tax must be a number, 0–100%")
    if n > 1:
        n = n / 100.0
    if n > 1:
        raise ValueError("tax must be 0–100%")
    return round(n, 6)


def sync_excel(db: dict, month: str | None = None, calculator: bool = False) -> None:
    """Write the month into SP_MGX_check.xlsx, then read hours back. Disk is the core."""
    ym = month or db.get("meta", {}).get("month") or "2026-10"
    excel_io.write_month(db, ym)
    parsed = excel_io.parse_workbook(excel_io.XLSX_PATH, ym)
    excel_io.apply_to_db(db, parsed, ym)
    if calculator:
        fx = (db.get("meta") or {}).get("nbuRate")
        finance_io.write_month(db, ym, nbu_rate=fx)


def next_pay_order(db: dict) -> int:
    vals = []
    for person in db.get("people") or []:
        try:
            vals.append(int(person.get("payOrder") or 0))
        except (TypeError, ValueError):
            vals.append(0)
    return max(vals, default=0) + 1


JOB_TITLES = {
    "designer": "Motion design",
    "teamlead": "Team Lead",
    "manager": "Line Producer",
}
CREW_JOBS = {"designer", "teamlead"}


def apply_person_job(db: dict, person: dict, job: str, *, check_last: bool = True) -> str | None:
    """MD ↔ TL only. Identity, Excel column, and $15 rate stay. Keep one Team Lead."""
    nxt = str(job or "").strip()
    if nxt not in CREW_JOBS:
        return "only Motion design and Team Lead can switch"
    if person.get("role") not in CREW_JOBS:
        return "only Motion design and Team Lead can switch"
    if person.get("role") == nxt:
        return None
    if (
        check_last
        and person.get("role") == "teamlead"
        and nxt == "designer"
    ):
        leads = sum(
            1
            for p in db.get("people") or []
            if p.get("role") == "teamlead" and p.get("id") != person.get("id")
        )
        if leads < 1:
            return "keep at least one Team Lead"
    person["role"] = nxt
    if nxt in JOB_TITLES:
        person["jobTitle"] = JOB_TITLES[nxt]
    return None

OPS_ROLES = {"manager", "finance"}
STATUS_BY_ROLE = {
    "designer": {"wip", "done"},
    "teamlead": {"new", "wip", "revision", "done"},
    "manager": {"new", "wip", "revision", "done", "closed"},
    "finance": {"new", "wip", "revision", "done", "closed"},
    "client": set(),
}


def monday_reply(task: dict) -> str:
    return f"{task.get('name') or ''}\ncheck it please\n{task.get('resultUrl') or ''}".strip()


COMMENT_ROLES = {"manager", "finance", "teamlead"}
COMMENT_FILES = DATA / "comments"
URL_IN_TEXT = re.compile(r"https?://[^\s<>\"')\]]+", re.I)
IMAGE_URL = re.compile(r"\.(?:png|jpe?g|gif|webp|bmp)(?:\?|$)", re.I)
COMMENT_TASK_ID = re.compile(r"^[A-Za-z0-9_-]+$")
COMMENT_FILE_NAME = re.compile(
    r"^(?:c-\d+-\d+|[A-Z0-9]+(?:-[A-Z0-9]+)*(?:_\d{2})?)\.(png|jpg|jpeg|gif|webp)$",
    re.I,
)
PROJECT_ROOT = re.compile(r"^([A-Z]{2}-[A-Z0-9]+-\d+(?:-\d+)?)", re.I)
IMAGE_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
}
MAX_SHOT_BYTES = 6 * 1024 * 1024
MAX_SHOTS = 8


def comment_attachments(text: str, extra: list | None = None) -> list[dict]:
    urls: list[str] = []
    seen: set[str] = set()
    extra_urls = []
    for item in extra or []:
        if isinstance(item, str):
            extra_urls.append(item)
        elif isinstance(item, dict) and item.get("url") and not item.get("data"):
            extra_urls.append(str(item.get("url") or ""))
    for raw in list(URL_IN_TEXT.findall(text or "")) + extra_urls:
        url = raw.strip().rstrip(".,);]")
        if not url or url in seen:
            continue
        seen.add(url)
        kind = "image" if (IMAGE_URL.search(url) or url.startswith("data:image") or "/file/d/" in url or "/thumbnail?" in url) else "link"
        urls.append({"url": url, "kind": kind})
    return urls


def decode_data_image(item: dict) -> tuple[str, bytes] | None:
    mime = str((item or {}).get("mime") or "").split(";")[0].strip().lower()
    raw = str((item or {}).get("data") or "").strip()
    if not raw:
        return None
    if raw.startswith("data:") and "," in raw:
        header, raw = raw.split(",", 1)
        if "image/" in header and not mime:
            mime = header.split(";")[0].replace("data:", "").strip().lower()
    if mime not in IMAGE_EXT:
        return None
    try:
        blob = base64.b64decode(raw, validate=False)
    except Exception:
        return None
    if not blob or len(blob) > MAX_SHOT_BYTES:
        return None
    return mime, blob


def project_root(task: dict | None) -> str:
    m = PROJECT_ROOT.match(str((task or {}).get("name") or "").strip())
    raw = (m.group(1) if m else str((task or {}).get("id") or "shot")).upper()
    return re.sub(r"[^A-Z0-9-]", "", raw) or "SHOT"


def is_local_shot_url(url: str) -> bool:
    u = str(url or "")
    return "/api/comment-file" in u or u.startswith("/comments/")


def comment_file_url(tid: str, name: str) -> str:
    return f"/comments/{tid}/{name}"


def is_shot_att(att: dict | None) -> bool:
    url = str((att or {}).get("url") or "")
    return (att or {}).get("kind") == "image" or url.startswith("data:image") or is_local_shot_url(url)


def count_shots(task: dict | None) -> int:
    n = 0
    for row in (task or {}).get("comments") or []:
        for att in row.get("attachments") or []:
            if is_shot_att(att):
                n += 1
    return n


def shot_filename(root: str, index: int, ext: str, total: int) -> str:
    ext = (ext or "png").lower().replace("jpeg", "jpg")
    if total <= 1:
        return f"{root}.{ext}"
    return f"{root}_{index:02d}.{ext}"


def ext_from_url(url: str) -> str:
    m = re.search(r"\.(png|jpe?g|gif|webp)(?:\?|$)", str(url or ""), re.I)
    if m:
        return m.group(1).lower().replace("jpeg", "jpg")
    return "png"


def relabel_first_shot(task: dict, root: str) -> None:
    """If the card had one unnamed/root.png shot, it becomes root_01 when a second arrives."""
    found = None
    for row in task.get("comments") or []:
        for att in row.get("attachments") or []:
            if is_shot_att(att):
                found = att
                break
        if found:
            break
    if not found:
        return
    old_name = str(found.get("name") or "")
    if re.search(r"_\d{2}\.[A-Za-z]+$", old_name):
        return
    ext = ext_from_url(old_name or found.get("url") or "")
    new_name = f"{root}_01.{ext}"
    url = str(found.get("url") or "")
    if is_local_shot_url(url) and old_name:
        tid = str(task.get("id") or "")
        src = COMMENT_FILES / tid / old_name
        dest = COMMENT_FILES / tid / new_name
        if src.is_file() and src.resolve() != dest.resolve():
            dest.write_bytes(src.read_bytes())
            try:
                src.unlink()
            except OSError:
                pass
        found["url"] = comment_file_url(tid, new_name)
    found["name"] = new_name


def store_comment_images(task: dict, items: list | None, *, start: int, total: int) -> list[dict]:
    out: list[dict] = []
    tid = str((task or {}).get("id") or "")
    if not COMMENT_TASK_ID.match(tid):
        return out
    folder = COMMENT_FILES / tid
    root = project_root(task)
    n = 0
    for item in items or []:
        if n >= MAX_SHOTS:
            break
        if not isinstance(item, dict) or not item.get("data"):
            continue
        decoded = decode_data_image(item)
        if not decoded:
            continue
        mime, blob = decoded
        folder.mkdir(parents=True, exist_ok=True)
        index = start + n + 1
        name = shot_filename(root, index, IMAGE_EXT[mime], total)
        (folder / name).write_bytes(blob)
        out.append({"url": comment_file_url(tid, name), "kind": "image", "name": name})
        n += 1
    return out


def make_comment(
    db: dict,
    *,
    actor_id: str,
    body: str,
    source: str = "manual",
    monday_id: str = "",
    extra: list | None = None,
    task: dict | None = None,
) -> dict | str:
    text = str(body or "").strip()
    attachments = comment_attachments(text, extra)
    new_files = sum(1 for item in extra or [] if isinstance(item, dict) and item.get("data"))
    url_shots = [a for a in attachments if is_shot_att(a)]
    existing = count_shots(task)
    total = existing + len(url_shots) + min(new_files, MAX_SHOTS)
    root = project_root(task)
    if existing == 1 and total > 1 and task is not None:
        relabel_first_shot(task, root)
        existing = count_shots(task)
    for i, att in enumerate(url_shots):
        att["name"] = shot_filename(root, existing + i + 1, ext_from_url(att.get("url") or ""), total)
    seq = int((db.get("meta") or {}).get("commentSeq") or 0) + 1
    comment_id = f"c-{seq}"
    stored = store_comment_images(
        task or {},
        extra,
        start=existing + len(url_shots),
        total=total,
    )
    attachments.extend(stored)
    if not text and not attachments:
        return "paste client text or a screenshot"
    src = source if source in {"manual", "monday"} else "manual"
    db.setdefault("meta", {})["commentSeq"] = seq
    person = next((p for p in db.get("people") or [] if p.get("id") == actor_id), None)
    return {
        "id": comment_id,
        "at": utc_now(),
        "authorId": actor_id or "",
        "authorName": (person or {}).get("name") or "",
        "body": text,
        "attachments": attachments,
        "source": src,
        "mondayId": str(monday_id or ""),
    }


def is_sendable(task: dict) -> bool:
    return task.get("studioStatus") == "done" and bool(str(task.get("resultUrl") or "").strip())


def task_month(data: dict, db: dict) -> str:
    return data.get("month") or db.get("meta", {}).get("month") or "2026-10"


def line_from_name(name: str) -> str:
    prefix = name.split("-", 1)[0].upper()
    return prefix if prefix in {"DD", "DX", "DS"} else "DD"


def parse_email(text: str) -> list[dict]:
    found = []
    for raw in text.splitlines():
        m = EMAIL_LINE.match(raw.strip().replace("\\_", "_"))
        if not m:
            continue
        name = m.group(1).replace("\\_", "_")
        shift = float(m.group(2).replace(",", "."))
        found.append(
            {
                "name": name,
                "line": line_from_name(name),
                "shifts": shift,
                "hours": hours_from_shift(shift),
            }
        )
    return found


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code: int, payload, cookie: str | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def _cookie_secure(self) -> bool:
        proto = (self.headers.get("X-Forwarded-Proto") or "").split(",")[0].strip().lower()
        return proto == "https"

    def _token(self) -> str:
        return auth_io.token_from_header(self.headers.get("Cookie") or "")

    def _session(self) -> dict | None:
        return auth_io.session_of(self._token())

    def _bind_actor(self, data: dict, sess: dict) -> dict:
        data = dict(data or {})
        data["role"] = sess.get("role") or ""
        data["actorId"] = sess.get("personId") or data.get("actorId") or ""
        return data

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw) if raw else {}

    def _bytes(self, data: bytes, content_type: str, filename: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _comment_file(self, task_id: str, name: str) -> None:
        task_id = unquote(str(task_id or ""))
        name = unquote(str(name or ""))
        if not COMMENT_TASK_ID.match(task_id) or not COMMENT_FILE_NAME.match(name):
            self.send_error(404, "note file missing")
            return
        fpath = (COMMENT_FILES / task_id / name).resolve()
        root = COMMENT_FILES.resolve()
        if root not in fpath.parents or not fpath.is_file():
            self.send_error(404, "note file missing")
            return
        ctype = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
        }.get(fpath.suffix.lower(), "application/octet-stream")
        data = fpath.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header(
            "Content-Disposition",
            f'inline; filename="{name}"; filename*=UTF-8\'\'{quote(name)}',
        )
        self.send_header("Cache-Control", "private, max-age=86400")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path in {"/hours", "/hours/"}:
            self.path = "/index.html"
            return SimpleHTTPRequestHandler.do_GET(self)
        if path == "/health":
            self._json(200, {"ok": True})
            return
        if path == "/api/me":
            sess = self._session()
            if not sess:
                self._json(401, {"error": "sign in"})
                return
            with LOCK:
                db = load_db()
            self._json(200, {"session": sess, "state": auth_io.view_state(db, sess)})
            return
        if path == "/api/state":
            sess = self._session()
            if not sess:
                self._json(401, {"error": "sign in"})
                return
            with LOCK:
                db = load_db()
            self._json(200, auth_io.view_state(db, sess))
            return
        sess = self._session()
        studio = bool(sess) and sess.get("role") != "client" and sess.get("email") != auth_io.CLIENT_EMAIL
        finance = bool(sess) and sess.get("role") == "finance"
        if path == "/api/comment-file":
            if not studio:
                self._json(401, {"error": "sign in"})
                return
            qs = parse_qs(urlparse(self.path).query)
            self._comment_file((qs.get("task") or [""])[0], (qs.get("name") or [""])[0])
            return
        parts = [p for p in path.split("/") if p]
        if len(parts) == 3 and parts[0] == "comments":
            if not studio:
                self._json(401, {"error": "sign in"})
                return
            self._comment_file(parts[1], parts[2])
            return
        if path == "/api/finance/snapshot":
            if not finance:
                self._json(401, {"error": "sign in"})
                return
            qs = parse_qs(urlparse(self.path).query)
            month = (qs.get("month") or [""])[0] or load_db().get("meta", {}).get("month") or "2026-10"
            with LOCK:
                db = load_db()
                try:
                    snap = finance_io.snapshot(db, month)
                except FileNotFoundError as e:
                    self._json(409, {"error": str(e)})
                    return
            self._json(200, snap)
            return
        if path == "/api/nbu":
            if not finance:
                self._json(401, {"error": "sign in"})
                return
            qs = parse_qs(urlparse(self.path).query)
            force = (qs.get("refresh") or [""])[0] in {"1", "true", "yes"}
            self._json(200, finance_io.fetch_nbu(force=force))
            return
        if path == "/api/finance/invoices":
            if not finance:
                self._json(401, {"error": "sign in"})
                return
            qs = parse_qs(urlparse(self.path).query)
            month = (qs.get("month") or [""])[0] or load_db().get("meta", {}).get("month") or "2026-10"
            self._json(200, finance_io.list_invoices(month))
            return
        if path == "/api/finance/invoice/file":
            if not finance:
                self._json(401, {"error": "sign in"})
                return
            qs = parse_qs(urlparse(self.path).query)
            month = (qs.get("month") or [""])[0] or "2026-10"
            name = (qs.get("name") or [""])[0]
            try:
                fpath = finance_io.resolve_invoice_file(month, name)
            except ValueError:
                self._json(400, {"error": "bad invoice file name"})
                return
            except FileNotFoundError:
                self.send_error(404, "invoice file missing")
                return
            ctype = (
                "application/pdf"
                if fpath.suffix == ".pdf"
                else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            )
            self._bytes(fpath.read_bytes(), ctype, fpath.name)
            return
        if path == "/api/finance/invoice/zip":
            if not finance:
                self._json(401, {"error": "sign in"})
                return
            qs = parse_qs(urlparse(self.path).query)
            month = (qs.get("month") or [""])[0] or load_db().get("meta", {}).get("month") or "2026-10"
            name, data = finance_io.zip_invoice_dir(month)
            if not data:
                self._json(404, {"error": "no invoices in the sandbox folder yet"})
                return
            self._bytes(data, "application/zip", name)
            return
        if path == "/api/finance/calculator":
            if not finance:
                self._json(401, {"error": "sign in"})
                return
            xlsx = finance_io.CALC_PATH
            if not xlsx.exists():
                self.send_error(404, "Calculator workbook missing")
                return
            self._bytes(
                xlsx.read_bytes(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "SUPERPLAY_MGX_Calculator.xlsx",
            )
            return
        if path == "/api/excel/file":
            if not studio:
                self._json(401, {"error": "sign in"})
                return
            xlsx = excel_io.XLSX_PATH
            if not xlsx.exists():
                self.send_error(404, "Excel workbook missing")
                return
            data = xlsx.read_bytes()
            self.send_response(200)
            self.send_header(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            self.send_header("Content-Disposition", 'attachment; filename="SP_MGX_check.xlsx"')
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if path == "/":
            self.path = "/index.html"
        return SimpleHTTPRequestHandler.do_GET(self)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        data = self._read_json()
        if path == "/api/login":
            with LOCK:
                db = load_db()
                email = auth_io.resolve_email(data.get("email") or "")
                pin = str(data.get("pin") or "")
                door = str(data.get("door") or "")
                if (
                    email not in auth_io.LOCK_ROLE
                    or not auth_io.door_allows(door, email)
                    or not auth_io.pin_ok(email, pin)
                ):
                    self._json(403, {"error": "wrong login or PIN"})
                    return
                people = db.get("people") or []
                seats = auth_io.seats_for(email, people)
                if not seats:
                    self._json(400, {"error": "no seat for this login"})
                    return
                need_seat = email == "lisenbart.games@gmail.com" and not data.get("seatId")
                seat = auth_io.pick_seat(email, people, data.get("seatId"))
                token = auth_io.create_session(email, seat)
                sess = auth_io.session_of(token)
                cookie = auth_io.cookie_header(token, secure=self._cookie_secure())
                payload = {
                    "ok": True,
                    "needSeat": need_seat,
                    "seats": seats,
                    "session": sess,
                    "state": auth_io.view_state(db, sess),
                }
            self._json(200, payload, cookie=cookie)
            return
        if path == "/api/logout":
            auth_io.drop_session(self._token())
            self._json(200, {"ok": True}, cookie=auth_io.cookie_header("", clear=True))
            return
        sess = self._session()
        if not sess:
            self._json(401, {"error": "sign in"})
            return
        if path == "/api/seat":
            with LOCK:
                db = load_db()
                nxt = auth_io.switch_seat(self._token(), db.get("people") or [], str(data.get("seatId") or ""))
            if not nxt:
                self._json(403, {"error": "cannot switch seat"})
                return
            self._json(200, {"ok": True, "session": nxt, "state": auth_io.view_state(load_db(), nxt)})
            return
        if sess.get("role") == "client" or sess.get("email") == auth_io.CLIENT_EMAIL:
            self._json(403, {"error": "client cannot edit"})
            return
        data = self._bind_actor(data, sess)
        with LOCK:
            db = load_db()
            if path == "/api/reset":
                if sess.get("role") != "finance":
                    self._json(403, {"error": "only finance can reset"})
                    return
                db = mirror_io.restore(carry_from=db)
                save_db(db, origin=True)
                self._json(200, db)
                return
            if path == "/api/parse-email":
                if data.get("role") not in OPS_ROLES:
                    self._json(403, {"error": "only Line Producer can parse shift email"})
                    return
                rows = parse_email(data.get("text") or "")
                added, updated = 0, 0
                fresh = []
                for row in rows:
                    existing = next((t for t in db["tasks"] if t["name"] == row["name"]), None)
                    if existing:
                        existing["shifts"] = row["shifts"]
                        existing["hours"] = row["hours"]
                        existing["line"] = row["line"]
                        existing["source"] = "monday+email" if existing.get("brief") else "email"
                        existing.setdefault("activity", []).append(
                            {"at": utc_now(), "text": f"From email: {row['shifts']} shifts → {row['hours']} h"}
                        )
                        updated += 1
                    else:
                        db["tasks"].append(
                            {
                                "id": f"t-{row['name'][:40]}-{len(db['tasks'])}",
                                "name": row["name"],
                                "line": row["line"],
                                "department": "MGX",
                                "game": "SettAI",
                                "shifts": row["shifts"],
                                "hours": row["hours"],
                                "deadline": "",
                                "month": task_month(data, db),
                                "studioStatus": "new",
                                "mondayStatus": "Ready to Start",
                                "assigneeId": "",
                                "brief": "",
                                "folderUrl": "",
                                "docUrl": "",
                                "resultUrl": "",
                                "source": "email",
                                "activity": [
                                    {
                                        "at": utc_now(),
                                        "text": f"From Orit email: {row['shifts']} shifts",
                                    }
                                ],
                            }
                        )
                        added += 1
                        fresh.append(db["tasks"][-1])
                actor_id = data.get("actorId") or ""
                for task in fresh:
                    notice_io.on_landed(db, task, actor_id)
                drive = drive_io.ensure_tasks(db, fresh, task_month(data, db))
                db.setdefault("events", []).insert(
                    0,
                    {
                        "at": utc_now(),
                        "text": f"Parsed email: {added} new, {updated} shifts updated",
                    },
                )
                try:
                    sync_excel(db, data.get("month"), calculator=True)
                except FileNotFoundError as e:
                    save_db(db)
                    self._json(500, {"error": str(e), "state": db})
                    return
                save_db(db)
                self._json(
                    200,
                    {
                        "added": added,
                        "updated": updated,
                        "parsed": rows,
                        "drive": drive,
                        "state": db,
                    },
                )
                return
            if path == "/api/import-monday":
                if data.get("role") not in OPS_ROLES:
                    self._json(403, {"error": "only Line Producer can pull from Monday"})
                    return
                incoming = data.get("tasks") or _monday_fixture()
                added = 0
                fresh = []
                for item in incoming:
                    if any(t["name"] == item["name"] for t in db["tasks"]):
                        existing = next(t for t in db["tasks"] if t["name"] == item["name"])
                        if item.get("brief") and not existing.get("brief"):
                            existing["brief"] = item["brief"]
                        existing["mondayStatus"] = item.get("mondayStatus") or existing["mondayStatus"]
                        continue
                    db["tasks"].append(
                        {
                            "id": item.get("id") or f"t-imp-{len(db['tasks'])}",
                            "name": item["name"],
                            "line": item.get("line") or line_from_name(item["name"]),
                            "department": "MGX",
                            "game": item.get("game") or "SettAI",
                            "shifts": item.get("shifts") or 0,
                            "hours": item.get("hours") or 0,
                            "deadline": "",
                            "month": item.get("month") or task_month(data, db),
                            "studioStatus": "new",
                            "mondayStatus": item.get("mondayStatus") or "Ready to Start",
                            "assigneeId": "",
                            "brief": item.get("brief") or "",
                            "folderUrl": item.get("folderUrl") or "",
                            "docUrl": item.get("docUrl") or "",
                            "resultUrl": "",
                            "source": "monday",
                            "activity": [{"at": utc_now(), "text": "Pulled from Monday External Weekly"}],
                        }
                    )
                    added += 1
                    fresh.append(db["tasks"][-1])
                actor_id = data.get("actorId") or ""
                for task in fresh:
                    notice_io.on_landed(db, task, actor_id)
                drive = drive_io.ensure_tasks(db, fresh, task_month(data, db))
                db.setdefault("events", []).insert(
                    0, {"at": utc_now(), "text": f"Monday import: {added} new tasks"}
                )
                try:
                    sync_excel(db, data.get("month"), calculator=True)
                except FileNotFoundError as e:
                    save_db(db)
                    self._json(500, {"error": str(e), "state": db})
                    return
                save_db(db)
                self._json(200, {"added": added, "drive": drive, "state": db})
                return
            if path == "/api/drive/ensure":
                if data.get("role") not in OPS_ROLES:
                    self._json(403, {"error": "only Line Producer can create Drive folders"})
                    return
                task = next((t for t in db["tasks"] if t["id"] == data.get("id")), None)
                if not task:
                    self._json(404, {"error": "not found"})
                    return
                out = drive_io.ensure_task(db, task, data.get("month") or task.get("month"))
                save_db(db)
                if not out.get("ok"):
                    self._json(400, {**out, "state": db})
                    return
                self._json(200, {**out, "state": db})
                return
            if path == "/api/export-monday":
                if data.get("role") not in OPS_ROLES:
                    self._json(403, {"error": "only Line Producer can send to the client"})
                    return
                ids = set(data.get("ids") or [])
                exported = []
                actor_id = data.get("actorId") or ""
                for task in db["tasks"]:
                    if task["id"] not in ids or not is_sendable(task):
                        continue
                    before = {"studioStatus": task.get("studioStatus"), "assigneeId": task.get("assigneeId")}
                    task["studioStatus"] = "approve"
                    task["mondayStatus"] = "Senior Approval"
                    task.setdefault("activity", []).append(
                        {
                            "at": utc_now(),
                            "text": "Sent to Monday: check it please + link → Senior Approval",
                        }
                    )
                    notice_io.on_task_change(db, task, before, actor_id)
                    exported.append(
                        {
                            "name": task["name"],
                            "reply": monday_reply(task),
                            "mondayStatus": "Senior Approval",
                        }
                    )
                if not exported:
                    self._json(
                        400,
                        {
                            "error": "Send only works on Done projects that have a result link",
                            "exported": [],
                            "state": db,
                        },
                    )
                    return
                db.setdefault("events", []).insert(
                    0,
                    {
                        "at": utc_now(),
                        "text": f"Sent {len(exported)} tasks to Monday Senior Approval",
                    },
                )
                save_db(db)
                self._json(200, {"exported": exported, "state": db})
                return
            if path == "/api/tasks/update":
                task_id = data.get("id")
                task = next((t for t in db["tasks"] if t["id"] == task_id), None)
                if not task:
                    self._json(404, {"error": "not found"})
                    return
                before = {
                    "studioStatus": task.get("studioStatus"),
                    "assigneeId": task.get("assigneeId"),
                }
                nxt = data.get("studioStatus")
                role = data.get("role") or ""
                actor = str(data.get("actorId") or "")
                allowed = STATUS_BY_ROLE
                if role not in allowed:
                    self._json(403, {"error": "unknown role"})
                    return
                if role == "client":
                    self._json(403, {"error": "client cannot edit tasks"})
                    return
                if role == "designer":
                    if actor != str(task.get("assigneeId") or ""):
                        self._json(403, {"error": "you can only edit your own tasks"})
                        return
                    for locked in ("brief", "folderUrl", "docUrl", "assigneeId"):
                        data.pop(locked, None)
                if (
                    "assigneeId" in data
                    and str(data.get("assigneeId") or "") != str(task.get("assigneeId") or "")
                    and role not in {"teamlead", "manager", "finance"}
                ):
                    self._json(403, {"error": "only TL or LP can assign"})
                    return
                if (
                    role == "teamlead"
                    and nxt == "done"
                    and nxt != task.get("studioStatus")
                    and actor != str(task.get("assigneeId") or "")
                ):
                    self._json(403, {"error": "TL can Done only their own work"})
                    return
                if nxt == "approve" and nxt != task.get("studioStatus"):
                    self._json(403, {"error": "Senior Approval is set only when you Send to client"})
                    return
                if (
                    nxt == "closed"
                    and nxt != task.get("studioStatus")
                    and task.get("studioStatus") != "approve"
                ):
                    self._json(
                        403,
                        {"error": "Closed is after Senior Approval, when the client accepts"},
                    )
                    return
                if (
                    nxt
                    and nxt != task.get("studioStatus")
                    and role in allowed
                    and nxt not in allowed[role]
                ):
                    self._json(403, {"error": f"{role} cannot set {nxt}"})
                    return
                status_after = data["studioStatus"] if "studioStatus" in data else task.get("studioStatus")
                result_after = data["resultUrl"] if "resultUrl" in data else task.get("resultUrl")
                if status_after == "done" and not str(result_after or "").strip():
                    self._json(400, {"error": "paste the result link before Done"})
                    return
                if "shifts" in data:
                    if role not in {"manager", "finance"}:
                        self._json(403, {"error": "only manager or finance can edit time"})
                        return
                    try:
                        shift = float(str(data["shifts"]).replace(",", "."))
                    except (TypeError, ValueError):
                        self._json(400, {"error": "shifts must be a number"})
                        return
                    if shift < 0:
                        self._json(400, {"error": "shifts must be 0 or more"})
                        return
                    task["shifts"] = shift
                    task["hours"] = hours_from_shift(shift)
                if "deadline" in data:
                    if role not in {"manager", "finance"}:
                        self._json(403, {"error": "only manager or finance can edit deadline"})
                        return
                    raw = str(data.get("deadline") or "").strip()
                    if raw and not re.match(r"^\d{4}-\d{2}-\d{2}$", raw[:10]):
                        self._json(400, {"error": "deadline must be a date"})
                        return
                    task["deadline"] = raw[:10] if raw else ""
                data.pop("comments", None)
                for key in ("studioStatus", "assigneeId", "resultUrl", "brief", "folderUrl", "docUrl"):
                    if key in data:
                        task[key] = data[key]
                if "help" in data:
                    if role not in {"manager", "finance", "teamlead"}:
                        self._json(403, {"error": "only TL or LP can split hours"})
                        return
                    help_rows = []
                    for row in data.get("help") or []:
                        pid = str((row or {}).get("id") or "").strip()
                        try:
                            hours = float(str((row or {}).get("hours") or "").replace(",", "."))
                        except (TypeError, ValueError):
                            self._json(400, {"error": "help hours must be a number"})
                            return
                        if not pid or hours <= 0:
                            continue
                        help_rows.append({"id": pid, "hours": hours})
                    who = str(task.get("assigneeId") or "")
                    given = sum(row["hours"] for row in help_rows if row["id"] != who)
                    total = excel_io.client_hours(task)
                    if given > total + 0.001:
                        self._json(400, {"error": "help hours cannot exceed the client hours"})
                        return
                    task["help"] = help_rows
                excel_io.normalize_help(
                    task, {p["id"] for p in excel_io.designers(db)}
                )
                if task.get("studioStatus") == "closed":
                    task["mondayStatus"] = "Closed"
                elif nxt == "revision":
                    task["mondayStatus"] = "Need Fixing"
                note = data.get("note")
                if note:
                    task.setdefault("activity", []).append({"at": utc_now(), "text": note})
                notice_io.on_task_change(db, task, before, data.get("actorId") or "")
                money = "assigneeId" in data or "shifts" in data or "help" in data
                try:
                    sync_excel(db, task.get("month"), calculator=money)
                except FileNotFoundError as e:
                    save_db(db)
                    self._json(500, {"error": str(e), "state": db})
                    return
                save_db(db)
                self._json(200, {"task": task, "state": db})
                return
            if path == "/api/tasks/comment":
                role = data.get("role") or ""
                if role not in COMMENT_ROLES:
                    self._json(403, {"error": "only LP or TL can add client notes"})
                    return
                data.pop("brief", None)
                data.pop("comments", None)
                task = next((t for t in db["tasks"] if t["id"] == data.get("id")), None)
                if not task:
                    self._json(404, {"error": "not found"})
                    return
                brief_before = task.get("brief")
                delete_id = str(data.get("deleteId") or "").strip()
                if delete_id:
                    rows = list(task.get("comments") or [])
                    found = next((row for row in rows if row.get("id") == delete_id), None)
                    if not found:
                        self._json(404, {"error": "note not found"})
                        return
                    if found.get("source") == "monday":
                        self._json(400, {"error": "Monday notes stay until the Monday sync"})
                        return
                    task["comments"] = [row for row in rows if row.get("id") != delete_id]
                    save_db(db)
                    self._json(200, {"task": task, "state": db})
                    return
                comment = make_comment(
                    db,
                    actor_id=str(data.get("actorId") or ""),
                    body=data.get("body") or "",
                    source=str(data.get("source") or "manual"),
                    monday_id=str(data.get("mondayId") or ""),
                    extra=data.get("attachments") or [],
                    task=task,
                )
                if isinstance(comment, str):
                    self._json(400, {"error": comment})
                    return
                task.setdefault("comments", []).append(comment)
                if task.get("brief") != brief_before:
                    task["brief"] = brief_before
                notice_io.emit(
                    db,
                    "task.comment",
                    actor_id=str(data.get("actorId") or ""),
                    task=task,
                )
                save_db(db)
                self._json(200, {"comment": comment, "task": task, "state": db})
                return
            if path == "/api/excel/pull":
                month = data.get("month") or db.get("meta", {}).get("month") or "2026-10"
                parsed = excel_io.parse_workbook(excel_io.XLSX_PATH, month)
                stats = excel_io.apply_to_db(db, parsed, month)
                db.setdefault("events", []).insert(
                    0, {"at": utc_now(), "text": f"Excel pull {month}: {stats['updated']} updated, {stats['added']} new"}
                )
                save_db(db)
                self._json(200, {**stats, "state": db})
                return
            if path == "/api/excel/import":
                month = data.get("month") or db.get("meta", {}).get("month") or "2026-10"
                raw = data.get("content") or ""
                try:
                    blob = base64.b64decode(raw)
                except Exception:
                    self._json(400, {"error": "not a valid Excel file"})
                    return
                with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
                    tmp.write(blob)
                    tmp_path = Path(tmp.name)
                try:
                    parsed = excel_io.parse_workbook(tmp_path, month)
                    stats = excel_io.apply_to_db(db, parsed, month)
                    excel_io.XLSX_PATH.write_bytes(blob)
                finally:
                    tmp_path.unlink(missing_ok=True)
                db.setdefault("events", []).insert(
                    0, {"at": utc_now(), "text": f"Excel import {month}: {stats['updated']} updated, {stats['added']} new"}
                )
                save_db(db)
                self._json(200, {**stats, "state": db})
                return
            if path == "/api/excel/save":
                month = data.get("month") or db.get("meta", {}).get("month") or "2026-10"
                try:
                    sync_excel(db, month, calculator=True)
                except FileNotFoundError as e:
                    self._json(500, {"error": str(e)})
                    return
                save_db(db)
                drive = db.get("meta", {}).get("driveSandboxExcel") or ""
                self._json(
                    200,
                    {
                        "ok": True,
                        "file": str(excel_io.XLSX_PATH),
                        "drive": drive,
                        "message": "Wrote the portal buffer only. Live Drive SP_MGX_check.xlsx was not changed.",
                        "state": db,
                    },
                )
                return
            if path == "/api/meta/update":
                if (data.get("role") or "") != "finance":
                    self._json(403, {"error": "only finance can edit rates"})
                    return
                meta = db.setdefault("meta", {})
                try:
                    if "clientRateUsd" in data:
                        rate = parse_money(data.get("clientRateUsd"))
                        if rate is None:
                            self._json(400, {"error": "Superplay rate must be 0 or more"})
                            return
                        meta["clientRateUsd"] = rate
                    if "designerRateUsd" in data:
                        rate = parse_money(data.get("designerRateUsd"))
                        if rate is None:
                            self._json(400, {"error": "pay rate must be 0 or more"})
                            return
                        meta["designerRateUsd"] = rate
                    if "taxPct" in data:
                        try:
                            meta["taxPct"] = parse_tax(data.get("taxPct"))
                        except ValueError as e:
                            self._json(400, {"error": str(e)})
                            return
                    if "nbuRate" in data:
                        rate = parse_money(data.get("nbuRate"))
                        if rate is None or rate <= 0:
                            self._json(400, {"error": "NBU rate must be more than 0"})
                            return
                        meta["nbuRate"] = rate
                except (TypeError, ValueError):
                    self._json(400, {"error": "rates must be numbers, 0 or more"})
                    return
                if "taxPct" in data or "nbuRate" in data:
                    try:
                        finance_io.write_month(
                            db,
                            data.get("month") or db.get("meta", {}).get("month") or "2026-10",
                            nbu_rate=meta.get("nbuRate"),
                        )
                    except FileNotFoundError as e:
                        save_db(db)
                        self._json(500, {"error": str(e), "state": db})
                        return
                save_db(db)
                self._json(200, {"meta": meta, "state": db})
                return
            if path == "/api/finance/invoice":
                if (data.get("role") or "") != "finance":
                    self._json(403, {"error": "only finance can make invoices"})
                    return
                line = str(data.get("line") or "BOTH").upper().replace(" ", "")
                month = data.get("month") or db.get("meta", {}).get("month") or "2026-10"
                nbu = None
                if data.get("nbuRate"):
                    try:
                        nbu = {"rate": float(data["nbuRate"]), "date": "", "source": "manual"}
                    except (TypeError, ValueError):
                        nbu = None
                try:
                    snap = finance_io.snapshot(db, month, nbu)
                except FileNotFoundError as e:
                    self._json(409, {"error": str(e)})
                    return
                if line in {"BOTH", "ALL", "MGX", "DD/DX", "DDDX"}:
                    rows = [
                        r
                        for r in snap["byLine"]
                        if r.get("hours") and r["line"] in {"DD", "DX", "DS"}
                    ]
                elif line in {"DD", "DX", "DS"}:
                    rows = [r for r in snap["byLine"] if r["line"] == line and r.get("hours")]
                else:
                    self._json(400, {"error": "invoice line must be DD, DX or both"})
                    return
                if not rows:
                    self._json(400, {"error": "no hours this month to invoice"})
                    return
                packs = [
                    finance_io.issue_invoice(r["line"], r["hours"], r["bill"], month)
                    for r in rows
                ]
                names = []
                files = []
                for item in packs:
                    names.append(item["docxName"])
                    if item.get("pdfName"):
                        names.append(item["pdfName"])
                    files.extend(item.get("files") or [])
                first = packs[0]
                folder_path = first.get("folderPath") or ""
                self._json(
                    200,
                    {
                        "ok": True,
                        "folder": first["folder"],
                        "folderPath": folder_path,
                        "files": files,
                        "docxName": first["docxName"],
                        "pdfName": first.get("pdfName") or "",
                        "message": f"Wrote {folder_path}",
                    },
                )
                return
            if path == "/api/finance/invoice/reveal":
                if (data.get("role") or "") != "finance":
                    self._json(403, {"error": "only finance can open the invoice folder"})
                    return
                month = data.get("month") or db.get("meta", {}).get("month") or "2026-10"
                self._json(200, finance_io.reveal_invoice_dir(month))
                return
            if path == "/api/finance/save":
                if (data.get("role") or "") != "finance":
                    self._json(403, {"error": "only finance can write the calculator"})
                    return
                month = data.get("month") or db.get("meta", {}).get("month") or "2026-10"
                nbu = data.get("nbuRate")
                try:
                    fx = float(nbu) if nbu not in (None, "") else None
                except (TypeError, ValueError):
                    self._json(400, {"error": "NBU rate must be a number"})
                    return
                path_out = finance_io.write_month(db, month, nbu_rate=fx)
                drive = db.get("meta", {}).get("driveCalculator") or ""
                self._json(
                    200,
                    {
                        "ok": True,
                        "file": str(path_out),
                        "drive": drive,
                        "message": (
                            "Wrote this month into SUPERPLAY_MGX_Calculator.xlsx. "
                            f"Hours = shifts × 9, client $35, tax {float(db.get('meta', {}).get('taxPct') or 0.06) * 100:g}%, then EMPL vs studio."
                        ),
                        "state": db,
                    },
                )
                return
            if path == "/api/people/update":
                if (data.get("role") or "") != "finance":
                    self._json(403, {"error": "only finance can edit the team"})
                    return
                items = data.get("people")
                if not items:
                    item = {"id": data.get("id")}
                    if "name" in data:
                        item["name"] = data.get("name")
                    if "rateUsd" in data:
                        item["rateUsd"] = data.get("rateUsd")
                    if "job" in data:
                        item["job"] = data.get("job")
                    items = [item]
                planned = {p["id"]: p.get("role") for p in db["people"]}
                job_changes = False
                for item in items:
                    person = next((p for p in db["people"] if p["id"] == item.get("id")), None)
                    if not person or "job" not in item or item.get("job") is None:
                        continue
                    nxt = str(item.get("job") or "").strip()
                    if nxt not in CREW_JOBS or person.get("role") not in CREW_JOBS:
                        self._json(400, {"error": "only Motion design and Team Lead can switch"})
                        return
                    planned[person["id"]] = nxt
                    job_changes = True
                if job_changes and not any(role == "teamlead" for role in planned.values()):
                    self._json(400, {"error": "keep at least one Team Lead"})
                    return
                updated = []
                for item in items:
                    person = next((p for p in db["people"] if p["id"] == item.get("id")), None)
                    if not person:
                        continue
                    if "name" in item and item.get("name") is not None:
                        name = str(item.get("name") or "").strip()
                        if not name:
                            self._json(400, {"error": "name cannot be empty"})
                            return
                        person["name"] = name
                    if "rateUsd" in item:
                        try:
                            rate = parse_money(item.get("rateUsd"))
                        except (TypeError, ValueError):
                            self._json(400, {"error": "pay rate must be a number, 0 or more"})
                            return
                        if rate is None:
                            person.pop("rateUsd", None)
                        else:
                            person["rateUsd"] = rate
                    if "job" in item and item.get("job") is not None:
                        err = apply_person_job(db, person, item.get("job"), check_last=False)
                        if err:
                            self._json(400, {"error": err})
                            return
                    for key in ("legalName", "bank", "bankCard", "iban", "phone"):
                        if key in item and item.get(key) is not None:
                            person[key] = str(item.get(key) or "").strip()
                    updated.append(person)
                if not updated and data.get("id"):
                    self._json(404, {"error": "not found"})
                    return
                try:
                    sync_excel(db, calculator=True)
                except FileNotFoundError as e:
                    save_db(db)
                    self._json(500, {"error": str(e), "state": db})
                    return
                save_db(db)
                self._json(200, {"people": updated, "state": db})
                return
            if path == "/api/people/add":
                if (data.get("role") or "") != "finance":
                    self._json(403, {"error": "only finance can add people"})
                    return
                job = data.get("job") or "designer"
                labels = {
                    "designer": "Designer",
                    "teamlead": "Team lead",
                    "manager": "Manager",
                    "finance": "Finance",
                }
                if job not in labels:
                    self._json(400, {"error": "unknown role"})
                    return
                existing = {p["id"] for p in db["people"]}
                n = 1
                while True:
                    pid = job if n == 1 else f"{job}{n}"
                    if pid not in existing:
                        break
                    n += 1
                palette = {
                    "designer": ["#00c875", "#579bfc", "#ff5ac4", "#fdab3d", "#9d50dd", "#00c2e0", "#bb3354"],
                    "teamlead": ["#fdab3d", "#e67e22"],
                    "manager": ["#9d50dd", "#7b2cbf"],
                    "finance": ["#0073ea", "#0059b3"],
                }[job]
                count = len([p for p in db["people"] if p.get("role") == job])
                person = {
                    "id": pid,
                    "name": labels[job] if n == 1 else f"{labels[job]} {n}",
                    "role": job,
                    "color": palette[count % len(palette)],
                    "payOrder": next_pay_order(db),
                }
                if job in JOB_TITLES:
                    person["jobTitle"] = JOB_TITLES[job]
                if job == "manager":
                    person["rateUsd"] = 5
                elif job in {"designer", "teamlead"}:
                    person["rateUsd"] = 15
                db["people"].append(person)
                try:
                    if job in {"designer", "teamlead", "manager"}:
                        sync_excel(db, calculator=True)
                except FileNotFoundError as e:
                    save_db(db)
                    self._json(500, {"error": str(e), "state": db})
                    return
                save_db(db)
                self._json(200, {"person": person, "state": db})
                return
            if path == "/api/people/delete":
                if (data.get("role") or "") != "finance":
                    self._json(403, {"error": "only finance can delete people"})
                    return
                pid = data.get("id")
                person = next((p for p in db["people"] if p["id"] == pid), None)
                if not person:
                    self._json(404, {"error": "not found"})
                    return
                if pid == data.get("actorId"):
                    self._json(400, {"error": "you cannot delete yourself"})
                    return
                if person.get("role") == "finance" and sum(
                    1 for p in db["people"] if p.get("role") == "finance"
                ) <= 1:
                    self._json(400, {"error": "keep at least one finance login"})
                    return
                if person.get("role") == "client" and sum(
                    1 for p in db["people"] if p.get("role") == "client"
                ) <= 1:
                    self._json(400, {"error": "keep the SuperPlay hours login"})
                    return
                held = [t for t in db["tasks"] if t.get("assigneeId") == pid]
                if held and "reassignTo" not in data:
                    self._json(
                        409,
                        {
                            "error": "this person still has projects — choose who takes them",
                            "count": len(held),
                        },
                    )
                    return
                dest = data.get("reassignTo", "")
                if dest == pid:
                    self._json(400, {"error": "cannot move projects onto the person being deleted"})
                    return
                if dest and not any(p["id"] == dest for p in db["people"]):
                    self._json(400, {"error": "move-to person not found"})
                    return
                actor_id = data.get("actorId") or ""
                for task in db["tasks"]:
                    help_rows = [
                        row for row in (task.get("help") or []) if (row or {}).get("id") != pid
                    ]
                    if dest and task.get("assigneeId") == dest:
                        help_rows = [row for row in help_rows if (row or {}).get("id") != dest]
                    task["help"] = help_rows
                for task in held:
                    before = {"assigneeId": pid, "studioStatus": task.get("studioStatus")}
                    task["assigneeId"] = dest
                    if dest:
                        task["help"] = [
                            row for row in (task.get("help") or []) if (row or {}).get("id") != dest
                        ]
                    task.setdefault("activity", []).append(
                        {
                            "at": utc_now(),
                            "text": (
                                f"Moved from deleted person to {dest or 'unassigned'}"
                            ),
                        }
                    )
                    if dest:
                        notice_io.on_task_change(db, task, before, actor_id)
                db["people"] = [p for p in db["people"] if p["id"] != pid]
                try:
                    sync_excel(db, calculator=True)
                except FileNotFoundError as e:
                    save_db(db)
                    self._json(500, {"error": str(e), "state": db})
                    return
                save_db(db)
                self._json(200, {"deleted": pid, "reassigned": len(held), "state": db})
                return
            if path == "/api/notices/read":
                person_id = data.get("personId") or ""
                notice_io.ensure(db)
                if data.get("all"):
                    notice_io.ack(db, person_id, all_mine=True)
                elif data.get("taskId"):
                    notice_io.ack(db, person_id, task_id=data.get("taskId"))
                else:
                    notice_io.ack(db, person_id, ids=list(data.get("ids") or []))
                save_db(db)
                self._json(200, {"state": db})
                return
        self._json(404, {"error": "unknown endpoint"})


def _monday_fixture() -> list[dict]:
    return [
        {
            "id": "t-dd-new-banana",
            "name": "DD-VEO-068-001_BananaBoat_8s_Resize",
            "line": "DD",
            "game": "Dice Dreams",
            "mondayStatus": "Ready to Start",
            "brief": "Resize BananaBoat 8s. Keep logo top-left.",
            "folderUrl": "https://drive.google.com/drive/folders/13-eo8f5K8rZm-DEkIXgQ0EWNsqC_O5HF",
            "docUrl": "https://docs.google.com/document/d/1dbxJCigaJisDTUnHFqjkmAFTctjM_kFR1tMrw9dFTxU/edit",
        }
    ]


def main() -> None:
    load_db()
    auth_io.ensure_pins()
    ThreadingHTTPServer.allow_reuse_address = True
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"LG Board http://127.0.0.1:{PORT}", flush=True)
    print("SuperPlay hours http://127.0.0.1:%s/hours" % PORT, flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
