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
from urllib.parse import parse_qs, urlparse

import excel_io
import finance_io

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


def parse_money(val):
    if val is None or val == "":
        return None
    n = float(str(val).replace(",", "."))
    if n < 0:
        raise ValueError("rate must be 0 or more")
    return n


def sync_excel(db: dict, month: str | None = None) -> None:
    ym = month or db.get("meta", {}).get("month") or "2026-10"
    try:
        excel_io.write_month(db, ym)
    except FileNotFoundError:
        pass


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

    def _bytes(self, data: bytes, content_type: str, filename: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/state":
            with LOCK:
                self._json(200, load_db())
            return
        if path == "/health":
            self._json(200, {"ok": True})
            return
        if path == "/api/nbu":
            qs = parse_qs(urlparse(self.path).query)
            force = (qs.get("refresh") or [""])[0] in {"1", "true", "yes"}
            self._json(200, finance_io.fetch_nbu(force=force))
            return
        if path == "/api/finance/calculator":
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
                sync_excel(db, data.get("month"))
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
                sync_excel(db, data.get("month"))
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
                sync_excel(db, task.get("month"))
                self._json(200, {"task": task, "state": db})
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
                excel_io.write_month(db, month)
                drive = db.get("meta", {}).get("driveSandboxExcel") or ""
                self._json(
                    200,
                    {
                        "ok": True,
                        "file": str(excel_io.XLSX_PATH),
                        "drive": drive,
                        "message": "Updated the calculator in place. Hours stay = shifts × 9. Other months untouched.",
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
                        rate = parse_money(data.get("taxPct"))
                        if rate is None:
                            self._json(400, {"error": "tax must be 0 or more"})
                            return
                        meta["taxPct"] = rate
                    if "nbuRate" in data:
                        rate = parse_money(data.get("nbuRate"))
                        if rate is None or rate <= 0:
                            self._json(400, {"error": "NBU rate must be more than 0"})
                            return
                        meta["nbuRate"] = rate
                except (TypeError, ValueError):
                    self._json(400, {"error": "rates must be numbers, 0 or more"})
                    return
                save_db(db)
                self._json(200, {"meta": meta, "state": db})
                return
            if path == "/api/finance/invoice":
                if (data.get("role") or "") != "finance":
                    self._json(403, {"error": "only finance can make invoices"})
                    return
                line = str(data.get("line") or "").upper()
                if line not in {"DD", "DX", "DS"}:
                    self._json(400, {"error": "invoice line must be DD, DX or DS"})
                    return
                month = data.get("month") or db.get("meta", {}).get("month") or "2026-10"
                nbu = None
                if data.get("nbuRate"):
                    try:
                        nbu = {"rate": float(data["nbuRate"]), "date": "", "source": "manual"}
                    except (TypeError, ValueError):
                        nbu = None
                snap = finance_io.snapshot(db, month, nbu)
                row = next((r for r in snap["byLine"] if r["line"] == line), None)
                if not row or not row["hours"]:
                    self._json(400, {"error": f"no {line} hours this month"})
                    return
                blob = finance_io.build_invoice(line, row["hours"], row["bill"])
                name = finance_io.invoice_filename(line)
                self._bytes(
                    blob,
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    name,
                )
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
                        "message": "Wrote this month into SUPERPLAY_MGX_Calculator.xlsx. Hours = shifts × 9, client $35, tax 5%, then EMPL vs studio.",
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
                    items = [item]
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
                    for key in ("legalName", "bank", "bankCard", "iban", "phone"):
                        if key in item and item.get(key) is not None:
                            person[key] = str(item.get(key) or "").strip()
                    updated.append(person)
                if not updated and data.get("id"):
                    self._json(404, {"error": "not found"})
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
                }
                db["people"].append(person)
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
                for task in held:
                    task["assigneeId"] = dest
                    task.setdefault("activity", []).append(
                        {
                            "at": utc_now(),
                            "text": (
                                f"Moved from deleted person to {dest or 'unassigned'}"
                            ),
                        }
                    )
                db["people"] = [p for p in db["people"] if p["id"] != pid]
                save_db(db)
                self._json(200, {"deleted": pid, "reassigned": len(held), "state": db})
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
