#!/usr/bin/env python3
"""Lisenbart studio portal — local/cloud HTTP app (stdlib only)."""
from __future__ import annotations

import json
import re
import threading
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

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
        seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
        DB_PATH.write_text(json.dumps(seed, ensure_ascii=False, indent=2), encoding="utf-8")
        return seed
    return json.loads(DB_PATH.read_text(encoding="utf-8"))


def save_db(db: dict) -> None:
    DB_PATH.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")


def hours_from_shift(shift: float) -> float:
    return round(shift * 9, 1)


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

    def _json(self, code: int, payload) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw) if raw else {}

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/state":
            with LOCK:
                self._json(200, load_db())
            return
        if path == "/health":
            self._json(200, {"ok": True})
            return
        if path == "/":
            self.path = "/index.html"
        return SimpleHTTPRequestHandler.do_GET(self)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        data = self._read_json()
        with LOCK:
            db = load_db()
            if path == "/api/reset":
                db = json.loads(SEED_PATH.read_text(encoding="utf-8"))
                save_db(db)
                self._json(200, db)
                return
            if path == "/api/parse-email":
                rows = parse_email(data.get("text") or "")
                added, updated = 0, 0
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
                db.setdefault("events", []).insert(
                    0,
                    {
                        "at": utc_now(),
                        "text": f"Parsed email: {added} new, {updated} shifts updated",
                    },
                )
                save_db(db)
                self._json(200, {"added": added, "updated": updated, "parsed": rows, "state": db})
                return
            if path == "/api/import-monday":
                incoming = data.get("tasks") or _monday_fixture()
                added = 0
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
                            "folderUrl": "",
                            "docUrl": "",
                            "resultUrl": "",
                            "source": "monday",
                            "activity": [{"at": utc_now(), "text": "Pulled from Monday External Weekly"}],
                        }
                    )
                    added += 1
                db.setdefault("events", []).insert(
                    0, {"at": utc_now(), "text": f"Monday import: {added} new tasks"}
                )
                save_db(db)
                self._json(200, {"added": added, "state": db})
                return
            if path == "/api/export-monday":
                ids = set(data.get("ids") or [])
                exported = []
                for task in db["tasks"]:
                    if task["id"] not in ids:
                        continue
                    if not task.get("resultUrl"):
                        continue
                    task["studioStatus"] = "approve"
                    task["mondayStatus"] = "Senior Approval"
                    task.setdefault("activity", []).append(
                        {
                            "at": utc_now(),
                            "text": "Sent to Monday: check it please + link → Senior Approval",
                        }
                    )
                    exported.append(
                        {
                            "name": task["name"],
                            "reply": f"check it please\n{task['resultUrl']}",
                            "mondayStatus": "Senior Approval",
                        }
                    )
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
            if path == "/api/provision":
                ids = set(data.get("ids") or [])
                dd = db.get("meta", {}).get("driveOctoberDD", "")
                dx = db.get("meta", {}).get("driveOctoberDX", "")
                n = 0
                for task in db["tasks"]:
                    if task["id"] not in ids:
                        continue
                    parent = dd if task["line"] == "DD" else dx
                    if not task.get("folderUrl"):
                        task["folderUrl"] = parent
                    if not task.get("docUrl"):
                        task["docUrl"] = parent
                    task.setdefault("activity", []).append(
                        {
                            "at": utc_now(),
                            "text": "Folder/brief marked in _PORTAL_TEST (sandbox, not live October)",
                        }
                    )
                    n += 1
                save_db(db)
                self._json(200, {"provisioned": n, "state": db})
                return
            if path == "/api/tasks/update":
                task_id = data.get("id")
                task = next((t for t in db["tasks"] if t["id"] == task_id), None)
                if not task:
                    self._json(404, {"error": "not found"})
                    return
                nxt = data.get("studioStatus")
                role = data.get("role") or ""
                allowed = {
                    "designer": {"wip", "done"},
                    "teamlead": {"new", "wip", "revision", "done"},
                    "manager": {"new", "wip", "revision", "done", "approve"},
                    "finance": {"new", "wip", "revision", "done", "approve"},
                }
                if (
                    nxt
                    and nxt != task.get("studioStatus")
                    and role in allowed
                    and nxt not in allowed[role]
                ):
                    self._json(403, {"error": f"{role} cannot set {nxt}"})
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
                for key in ("studioStatus", "assigneeId", "resultUrl", "brief", "folderUrl", "docUrl"):
                    if key in data:
                        task[key] = data[key]
                note = data.get("note")
                if note:
                    task.setdefault("activity", []).append({"at": utc_now(), "text": note})
                save_db(db)
                self._json(200, {"task": task, "state": db})
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
        }
    ]


def main() -> None:
    load_db()
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"LG Board http://127.0.0.1:{PORT}", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
