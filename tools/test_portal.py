#!/usr/bin/env python3
"""Crash tests for the studio desk. Run: python3 tools/test_portal.py"""
from __future__ import annotations

import json
import sys
import tempfile
import threading
import time
import traceback
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from openpyxl import Workbook, load_workbook

import excel_io
import server

PASS = 0
FAIL = 0
ERRORS: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  ok  {name}")
    else:
        FAIL += 1
        msg = f"  FAIL  {name}" + (f" — {detail}" if detail else "")
        print(msg)
        ERRORS.append(msg)


def _synth_sheet(path: Path, extra_below_total: bool = True, duplicate: bool = False) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "October 26"
    ws.cell(1, 2, "2026 PROJECT NAME")
    ws.cell(2, 1, "DX")
    ws.cell(2, 2, "MGX")
    ws.cell(2, 3, "SHIFTS")
    ws.cell(2, 4, "HOURS")
    ws.cell(2, 5, "DEADLINE")
    ws.cell(3, 2, "DX-AAA-0001")
    ws.cell(3, 3, 1)
    ws.cell(4, 2, "DX-BBB-0002")
    ws.cell(4, 3, 0.5)
    ws.cell(6, 1, "DD")
    ws.cell(6, 2, "MGX")
    ws.cell(6, 3, "SHIFTS")
    ws.cell(6, 4, "HOURS")
    ws.cell(6, 5, "DEADLINE")
    ws.cell(7, 2, "DD-CCC-0003")
    ws.cell(7, 3, 2)
    ws.cell(8, 2, "DD-DDD-0004")
    ws.cell(8, 3, 0)
    ws.cell(10, 1, "total")
    ws.cell(10, 3, "=SUM(C3:C9)")
    if extra_below_total:
        ws.cell(12, 2, "DD-TEST-0000001")
        ws.cell(12, 3, 0)
        ws.cell(13, 1, "DD-TEST-0000002")
        ws.cell(13, 3, 0)
    if duplicate:
        ws.cell(14, 2, "DD-TEST-0000001")
        ws.cell(14, 3, 9)
    wb.save(path)
    wb.close()


def _db() -> dict:
    return {
        "meta": {"month": "2026-10", "rev": 1},
        "people": [
            {"id": "designer", "name": "Masha", "role": "designer", "color": "92D050"},
        ],
        "tasks": [],
        "droppedNames": ["DD-TEST-0000001"],
        "events": [],
    }


def test_parse_past_total() -> None:
    with tempfile.TemporaryDirectory() as raw:
        path = Path(raw) / "sheet.xlsx"
        _synth_sheet(path)
        parsed = excel_io.parse_workbook(path, "2026-10")
        names = [r["name"] for r in parsed["rows"]]
        check("parse finds sheet", parsed.get("sheet") == "October 26")
        check("parse keeps rows above total", "DX-AAA-0001" in names and "DD-CCC-0003" in names)
        check("parse keeps rows below total", "DD-TEST-0000001" in names and "DD-TEST-0000002" in names)
        check("parse all six projects", len(names) == 6, str(names))
        test_a = next(r for r in parsed["rows"] if r["name"] == "DD-TEST-0000002")
        check("name in column A still counts", test_a["line"] == "DD")


def test_apply_full_sheet() -> None:
    with tempfile.TemporaryDirectory() as raw:
        path = Path(raw) / "sheet.xlsx"
        _synth_sheet(path, duplicate=True)
        parsed = excel_io.parse_workbook(path, "2026-10")
        db = _db()
        stats = excel_io.apply_to_db(db, parsed, "2026-10")
        names = [t["name"] for t in db["tasks"]]
        check("apply upserts every distinct row", stats["added"] == 6, str(stats))
        check("duplicate Excel row does not double-card", names.count("DD-TEST-0000001") == 1)
        check("Excel presence un-drops the name", "DD-TEST-0000001" not in db["droppedNames"])
        ids = [t["id"] for t in db["tasks"]]
        check("new cards get unique ids", len(ids) == len(set(ids)), str(ids))
        db["tasks"] = [t for t in db["tasks"] if t["name"] != "DX-BBB-0002"]
        extra = excel_io.apply_to_db(db, parsed, "2026-10")
        ids2 = [t["id"] for t in db["tasks"]]
        check("re-add after delete still unique ids", extra["added"] == 1 and len(ids2) == len(set(ids2)))


def test_write_month_roundtrip() -> None:
    with tempfile.TemporaryDirectory() as raw:
        path = Path(raw) / "sheet.xlsx"
        _synth_sheet(path)
        parsed = excel_io.parse_workbook(path, "2026-10")
        db = _db()
        excel_io.apply_to_db(db, parsed, "2026-10")
        excel_io.write_month(db, "2026-10", path)
        again = excel_io.parse_workbook(path, "2026-10")
        names = [r["name"] for r in again["rows"]]
        check("roundtrip keeps TEST rows", "DD-TEST-0000001" in names and "DD-TEST-0000002" in names)
        wb = load_workbook(path)
        ws = wb[again["sheet"]]
        total_row = next(r for r in range(2, (ws.max_row or 1) + 1) if str(ws.cell(r, 1).value or "").strip().lower() == "total")
        test_rows = []
        for r in range(2, (ws.max_row or 1) + 1):
            name = excel_io._project_name(str(ws.cell(r, 1).value or ""), str(ws.cell(r, 2).value or ""))
            if "TEST" in name:
                test_rows.append(r)
        wb.close()
        check("write_month moves TEST above total", test_rows and max(test_rows) < total_row, f"rows={test_rows} total={total_row}")
        check("xlsx still opens after atomic save", path.stat().st_size > 1000)


def test_corrupt_xlsx_empty() -> None:
    with tempfile.TemporaryDirectory() as raw:
        path = Path(raw) / "bad.xlsx"
        path.write_text("not a workbook", encoding="utf-8")
        parsed = excel_io.parse_workbook(path, "2026-10")
        check("corrupt xlsx returns empty, does not raise", parsed.get("rows") == [] and not parsed.get("sheet"))


def test_live_workbook_if_present() -> None:
    live = ROOT / "data" / "SP_MGX_check.xlsx"
    if not live.exists():
        check("live Excel present", False, "missing data/SP_MGX_check.xlsx")
        return
    parsed = excel_io.parse_workbook(live, "2026-10")
    names = [r["name"] for r in parsed.get("rows") or []]
    check("live October tab parses", bool(parsed.get("sheet")), str(parsed.get("sheet")))
    check("live October has project rows", len(names) >= 20, str(len(names)))
    db = json.loads((ROOT / "data" / "seed.json").read_text(encoding="utf-8"))
    db.setdefault("droppedNames", [])
    stats = excel_io.apply_to_db(db, parsed, "2026-10")
    board = {
        str(t.get("name") or "").strip()
        for t in db.get("tasks") or []
        if (t.get("month") or "2026-10") == "2026-10"
    }
    missing = [n for n in names if n not in board]
    check("every live Excel row has a card", not missing, str(missing[:8]))
    check("matched count equals parsed names", stats["matched"] == len(set(names)), str(stats))


def test_corrupt_db_recovery() -> None:
    with tempfile.TemporaryDirectory() as raw:
        data = Path(raw)
        db_path = data / "db.json"
        bak = data / "db.json.bak"
        seed = data / "seed.json"
        seed.write_text(json.dumps({"meta": {"month": "2026-10", "from": "seed"}, "tasks": [], "people": []}), encoding="utf-8")
        bak.write_text(json.dumps({"meta": {"month": "2026-10", "from": "bak", "rev": 3}, "tasks": [{"name": "DD-KEEP-1"}], "people": []}), encoding="utf-8")
        db_path.write_text("{not json", encoding="utf-8")
        old_db, old_seed = server.DB_PATH, server.SEED_PATH
        server.DB_PATH = db_path
        server.SEED_PATH = seed
        try:
            recovered = server._read_db_file()
            check("corrupt db.json falls back to bak", recovered.get("meta", {}).get("from") == "bak")
            check("bak keeps live tasks", (recovered.get("tasks") or [{}])[0].get("name") == "DD-KEEP-1")
            bak.write_text("also broken", encoding="utf-8")
            recovered = server._read_db_file()
            check("corrupt bak falls back to seed", recovered.get("meta", {}).get("from") == "seed")
            db_path.write_text("{still broken", encoding="utf-8")
            bak.unlink()
            seed.unlink()
            recovered = server._read_db_file()
            check("missing seed returns empty month db", recovered.get("meta", {}).get("month") == "2026-10")
        finally:
            server.DB_PATH = old_db
            server.SEED_PATH = old_seed


def test_save_db_atomic() -> None:
    with tempfile.TemporaryDirectory() as raw:
        data = Path(raw)
        db_path = data / "db.json"
        db_path.write_text(json.dumps({"meta": {"rev": 1}, "tasks": []}), encoding="utf-8")
        old = server.DB_PATH
        server.DB_PATH = db_path
        try:
            server.save_db({"meta": {"rev": 1, "ok": True}, "tasks": [{"name": "DD-X"}]})
            disk = json.loads(db_path.read_text(encoding="utf-8"))
            bak = json.loads(db_path.with_suffix(".json.bak").read_text(encoding="utf-8"))
            check("save_db writes the new db", disk.get("meta", {}).get("ok") is True)
            check("save_db keeps previous copy as bak", bak.get("meta", {}).get("rev") == 1)
            check("save_db bumps rev", int(disk.get("meta", {}).get("rev") or 0) >= 2)
        finally:
            server.DB_PATH = old


def test_sync_files_releases_lock() -> None:
    original = server.sync_excel
    during = {"locked": None}

    def slow(db, month=None, calculator=False):
        time.sleep(0.4)
        during["locked"] = server.LOCK.locked()
        return {"ok": False, "skipped": True}

    server.sync_excel = slow
    try:
        th = threading.Thread(target=lambda: server._sync_files_bg("2026-10", False), daemon=True)
        th.start()
        time.sleep(0.08)
        t0 = time.monotonic()
        got = server.LOCK.acquire(timeout=0.25)
        dt = time.monotonic() - t0
        if got:
            server.LOCK.release()
        th.join(timeout=2)
        check(
            "excel bg does not hold board LOCK",
            got is True and dt < 0.2,
            f"got={got} dt={dt:.3f}s",
        )
        check("LOCK.locked() is false during xlsx/Drive", during["locked"] is False, str(during))
    finally:
        server.sync_excel = original


def test_unreadable_ingest_does_not_wipe() -> None:
    with tempfile.TemporaryDirectory() as raw:
        path = Path(raw) / "bad.xlsx"
        path.write_bytes(b"")
        parsed = excel_io.parse_workbook(path, "2026-10")
        db = _db()
        db["tasks"] = [{"id": "t-1", "name": "DD-KEEP-9", "month": "2026-10", "shifts": 1, "hours": 9}]
        before = list(db["tasks"])
        if not parsed.get("sheet"):
            check("empty parse does not apply", True)
            check("existing cards stay when Excel is unreadable", db["tasks"] == before)
        else:
            check("empty parse does not apply", False, "sheet was set")


def _http(url: str, data=None, cookie: str | None = None, timeout: float = 8):
    headers = {"Content-Type": "application/json"}
    if cookie:
        headers["Cookie"] = cookie
    body = None if data is None else (data if isinstance(data, bytes) else json.dumps(data).encode("utf-8"))
    req = urllib.request.Request(url, data=body, headers=headers, method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            ctype = res.headers.get("Content-Type") or ""
            payload = json.loads(raw.decode("utf-8")) if "json" in ctype else raw
            return res.status, payload, res.headers
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            payload = raw.decode("utf-8", errors="replace")
        return e.code, payload, e.headers


def test_http(base: str) -> str | None:
    code, payload, _ = _http(f"{base}/health")
    check("GET /health", code == 200 and payload.get("ok") is True and payload.get("build"), str(payload))
    code, payload, _ = _http(f"{base}/api/version")
    check("GET /api/version", code == 200 and payload.get("build") == server.BUILD, str(payload.get("build")))

    t0 = time.monotonic()
    code, payload, _ = _http(f"{base}/api/roster", timeout=2)
    dt = time.monotonic() - t0
    roles = [r.get("role") for r in (payload.get("studio") or [])]
    check("GET /api/roster under 0.4s", code == 200 and dt < 0.4, f"status={code} {dt:.3f}s")
    check(
        "roster seats are DL LP TL MD",
        roles == ["finance", "manager", "teamlead", "designer"],
        str(roles),
    )

    code, payload, _ = _http(f"{base}/api/login", {"door": "studio", "role": "finance", "pin": "0000"})
    check("wrong PIN is 403", code == 403, str(payload))

    code, payload, _ = _http(f"{base}/api/login", b"not-json")
    check("bad JSON is 400", code == 400, str(payload))

    code, payload, _ = _http(f"{base}/api/login", [])
    check("array JSON is 400", code == 400 and "object" in str(payload.get("error") or payload), str(payload))

    code, payload, headers = _http(f"{base}/api/login", {"door": "studio", "role": "finance", "pin": "3245"})
    cookie = headers.get("Set-Cookie") if hasattr(headers, "get") else None
    check("finance login", code == 200 and payload.get("ok") is True and payload.get("session"), str(payload.get("error")))
    check("login sets cookie", bool(cookie), str(cookie))

    if cookie:
        t0 = time.monotonic()
        code, payload, _ = _http(f"{base}/api/me", cookie=cookie.split(";", 1)[0], timeout=5)
        dt = time.monotonic() - t0
        check("/api/me under 1s", code == 200 and payload.get("session") and dt < 1, f"status={code} {dt:.3f}s")

        hits = []

        def ping():
            t = time.monotonic()
            try:
                c, body, _ = _http(f"{base}/api/me", cookie=cookie.split(";", 1)[0], timeout=5)
                hits.append((c, time.monotonic() - t, bool((body or {}).get("session"))))
            except Exception as e:
                hits.append((0, time.monotonic() - t, str(e)))

        threads = [threading.Thread(target=ping) for _ in range(16)]
        t0 = time.monotonic()
        for th in threads:
            th.start()
        for th in threads:
            th.join(timeout=8)
        wall = time.monotonic() - t0
        ok_hits = [h for h in hits if h[0] == 200 and h[2] is True]
        slow = [h for h in hits if h[1] >= 5]
        check("16 concurrent /api/me all 200", len(ok_hits) == 16, str(hits[:3]))
        check("concurrent /api/me none hung", not slow and wall < 6, f"wall={wall:.3f}s slow={slow}")

        crash_id = "t-crash-del"
        with server.LOCK:
            db = server.load_db()
            db["tasks"] = [t for t in (db.get("tasks") or []) if t.get("id") != crash_id]
            db.setdefault("tasks", []).insert(
                0,
                {
                    "id": crash_id,
                    "name": "DD-CRASH-DEL-13H",
                    "line": "DD",
                    "month": "2026-10",
                    "studioStatus": "new",
                    "mondayStatus": "Ready to Start",
                    "shifts": 0,
                    "hours": 0,
                    "help": [],
                    "source": "portal",
                },
            )
            server.save_db(db)
        t0 = time.monotonic()
        code, payload, _ = _http(
            f"{base}/api/tasks/delete",
            {"id": crash_id, "role": "finance", "actorId": "finance"},
            cookie=cookie.split(";", 1)[0],
            timeout=3,
        )
        dt = time.monotonic() - t0
        gone = not any(
            str(t.get("id") or "") == crash_id for t in ((payload or {}).get("state") or {}).get("tasks") or []
        )
        check(
            "delete returns under 1s",
            code == 200 and payload.get("ok") is True and dt < 1,
            f"status={code} {dt:.3f}s err={payload.get('error') if isinstance(payload, dict) else payload}",
        )
        check("delete drops the card before Drive", gone, str((payload or {}).get("drive")))

        original_excel = server.sync_excel

        def slow_excel(db, month=None, calculator=False):
            time.sleep(1.0)
            return {"ok": False, "skipped": True}

        server.sync_excel = slow_excel
        try:
            threading.Thread(target=lambda: server._sync_files_bg("2026-10", False), daemon=True).start()
            time.sleep(0.05)
            times = []

            def ping_fast(path):
                t = time.monotonic()
                try:
                    c, body, _ = _http(f"{base}{path}", timeout=1)
                    times.append((path, c, time.monotonic() - t, body))
                except Exception as e:
                    times.append((path, 0, time.monotonic() - t, str(e)))

            workers = [
                threading.Thread(target=ping_fast, args=("/api/roster",)),
                threading.Thread(target=ping_fast, args=("/health",)),
            ]
            for w in workers:
                w.start()
            for w in workers:
                w.join(timeout=2)
            slow_hits = [row for row in times if row[2] >= 0.5]
            check(
                "roster/health stay instant while excel writes",
                times and not slow_hits and all(row[1] == 200 for row in times),
                str(times),
            )
        finally:
            server.sync_excel = original_excel


def start_local_server() -> tuple[threading.Thread, str]:
    import server as srv

    httpd = srv.ThreadingHTTPServer(("127.0.0.1", srv.PORT), srv.Handler)
    httpd.daemon_threads = True
    httpd.timeout = 8
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return thread, f"http://127.0.0.1:{srv.PORT}"


def main() -> int:
    print("Excel / db")
    for fn in (
        test_parse_past_total,
        test_apply_full_sheet,
        test_write_month_roundtrip,
        test_corrupt_xlsx_empty,
        test_live_workbook_if_present,
        test_corrupt_db_recovery,
        test_save_db_atomic,
        test_unreadable_ingest_does_not_wipe,
        test_sync_files_releases_lock,
    ):
        try:
            fn()
        except Exception:
            check(fn.__name__, False, traceback.format_exc()[-400:])

    print("HTTP")
    base = f"http://127.0.0.1:{server.PORT}"
    owned = False
    try:
        urllib.request.urlopen(f"{base}/health", timeout=1).read()
    except Exception:
        print("  starting local desk…")
        start_local_server()
        owned = True
        for _ in range(40):
            try:
                urllib.request.urlopen(f"{base}/health", timeout=0.25).read()
                break
            except Exception:
                time.sleep(0.1)
        else:
            check("desk starts", False, "no /health")
            print(f"\n{PASS} passed, {FAIL} failed")
            return 1
    try:
        test_http(base)
    except Exception:
        check("HTTP suite", False, traceback.format_exc()[-400:])

    print(f"\n{PASS} passed, {FAIL} failed")
    if ERRORS:
        print("\n".join(ERRORS))
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
