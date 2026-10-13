"""Read-only live snapshot. Clicks stay in a local buffer. Core Drive files are never written."""
from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import excel_io
import notice_io

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
SEED_PATH = DATA / "seed.json"
ORIGIN_XLSX = DATA / "mirror" / "SP_MGX_check.xlsx"
FOLDERS_PATH = DATA / "mirror" / "live_folders.json"
BUFFER_XLSX = excel_io.XLSX_PATH

LIVE_EXCEL_ID = "1SvRLe-Txl-F9MTfuDb08GBCh6XywNlzE"
LIVE_EXCEL_URL = f"https://drive.google.com/file/d/{LIVE_EXCEL_ID}/view"
LIVE_OCTOBER_ID = "173mZwMf2SAg2tKouzHc-xIqE_WadwIEH"
LIVE_PARENTS = {
    LIVE_EXCEL_ID,
    LIVE_OCTOBER_ID,
    "1cbyetaLxF2IiB47HOPMP_ffxo4v8T90p",
    "1ZdT3oxP5W-Fs8uKhcoTkEaMU1XRrxf1P",
    "1IBEGffspl0b7Ze6jH9BZNoyMybHxWSGH",
}

MIRROR_MONTHS = ("2026-10", "2026-09")
DROP_CREW_IDS = {"designer6"}
DROP_CREW_NAMES = {"андрій", "andriy", "andrew", "андрей"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def is_live_id(fid: str) -> bool:
    return str(fid or "").strip() in LIVE_PARENTS


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def folder_map() -> dict:
    if not FOLDERS_PATH.exists():
        return {}
    raw = json.loads(FOLDERS_PATH.read_text(encoding="utf-8"))
    return {str(k).upper(): str(v) for k, v in (raw or {}).items() if k and v}


def briefs_from(previous: dict) -> dict:
    out = {}
    for task in previous.get("tasks") or []:
        key = excel_io._id_key(task.get("name") or "")
        if not key:
            continue
        pack = {
            "brief": task.get("brief") or "",
            "docUrl": task.get("docUrl") or "",
            "folderUrl": task.get("folderUrl") or "",
        }
        if pack["brief"] or pack["docUrl"]:
            out[key] = pack
    return out


def ensure_people(people: list[dict]) -> list[dict]:
    kept: list[dict] = []
    for person in people:
        pid = str(person.get("id") or "")
        name = " ".join(str(person.get("name") or "").split()).lower()
        if pid in DROP_CREW_IDS or name in DROP_CREW_NAMES:
            continue
        kept.append(person)
    people[:] = kept
    by_id = {p.get("id"): p for p in people}
    maria = by_id.get("designer2")
    if maria:
        aliases = list(maria.get("aliases") or [])
        for extra in ("Маша", "Мария", "Masha"):
            if extra not in aliases:
                aliases.append(extra)
        maria["aliases"] = aliases
    return people


def comments_by_key(source: dict) -> dict:
    out = {}
    for task in source.get("tasks") or []:
        rows = task.get("comments") or []
        if not rows:
            continue
        key = excel_io._id_key(task.get("name") or "") or str(task.get("id") or "")
        if key:
            out[key] = rows
    return out


def apply_comments(db: dict, kept: dict) -> None:
    if not kept:
        return
    for task in db.get("tasks") or []:
        key = excel_io._id_key(task.get("name") or "") or str(task.get("id") or "")
        if key in kept:
            task["comments"] = kept[key]


def live_brief_map() -> dict:
    path = DATA / "mirror" / "live_briefs.json"
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return raw if isinstance(raw, dict) else {}


def attach_pack(task: dict, briefs: dict, folders: dict) -> None:
    key = excel_io._id_key(task.get("name") or "")
    pack = briefs.get(key) or {}
    live = live_brief_map().get(key) or {}
    if not isinstance(live, dict):
        live = {}
    if pack.get("brief") and not task.get("brief"):
        task["brief"] = pack["brief"]
    elif live.get("brief") and not str(task.get("brief") or "").strip():
        task["brief"] = live["brief"]
    if pack.get("docUrl") and not task.get("docUrl"):
        task["docUrl"] = pack["docUrl"]
    elif live.get("docUrl") and not str(task.get("docUrl") or "").strip():
        task["docUrl"] = live["docUrl"]
    live_folder = folders.get(key) or live.get("folderUrl") or ""
    if live_folder:
        task["folderUrl"] = live_folder
    elif pack.get("folderUrl") and not task.get("folderUrl"):
        task["folderUrl"] = pack["folderUrl"]
    import drive_io

    drive_io.apply_work_folder(task)
    name = task.get("name") or ""
    if "SettAI" in name or "Halloween" in name:
        task["game"] = task.get("game") or "SettAI"


def attach_live(task: dict, briefs: dict, folders: dict) -> None:
    attach_pack(task, briefs, folders)
    excel_status = task.get("excelStatus") or ""
    if excel_status == "closed" or task.get("studioStatus") == "closed":
        task["studioStatus"] = "closed"
        task["mondayStatus"] = "Closed"
    elif excel_status == "wip":
        task["studioStatus"] = "wip"
        task["mondayStatus"] = "WIP"
    else:
        task["studioStatus"] = "new"
        task["mondayStatus"] = "Ready to Start"
    task["resultUrl"] = ""
    task["source"] = "live-excel"


def sync_from_files(db: dict, xlsx: Path | None = None) -> dict:
    """Hours and projects from the workbook on disk. Pipeline clicks stay on the card."""
    xlsx = Path(xlsx or (BUFFER_XLSX if BUFFER_XLSX.exists() else ORIGIN_XLSX))
    if not xlsx.exists():
        return db
    ensure_people(db.setdefault("people", []))
    briefs = briefs_from(db)
    folders = folder_map()
    for ym in MIRROR_MONTHS:
        excel_io.apply_to_db(db, excel_io.parse_workbook(xlsx, ym), ym)
    for task in db.get("tasks") or []:
        attach_pack(task, briefs, folders)
        task["source"] = "excel"
    meta = db.setdefault("meta", {})
    meta["bufferDirty"] = False
    meta["mirrorSource"] = "SP_MGX_check.xlsx · files on disk"
    meta["mirrorAt"] = utc_now()
    return db


def hydrate(previous: dict | None = None, xlsx: Path | None = None) -> dict:
    """Build portal state from the live workbook copy. Does not write Drive."""
    previous = previous if previous is not None else (load_json(SEED_PATH) if SEED_PATH.exists() else {})
    xlsx = Path(xlsx or ORIGIN_XLSX)
    if not xlsx.exists():
        raise FileNotFoundError(f"live snapshot missing: {xlsx}")
    db = json.loads(json.dumps(previous))
    ensure_people(db.setdefault("people", []))
    for task in db.get("tasks") or []:
        if task.get("assigneeId") in DROP_CREW_IDS:
            task["assigneeId"] = ""
        task["help"] = [
            row for row in (task.get("help") or []) if (row or {}).get("id") not in DROP_CREW_IDS
        ]
    meta = db.setdefault("meta", {})
    meta.update(
        {
            "mode": "mirror",
            "bufferDirty": False,
            "month": "2026-10",
            "driveLiveExcel": LIVE_EXCEL_URL,
            "mirrorAt": utc_now(),
            "mirrorSource": "SP_MGX_check.xlsx · Google Drive · read only",
            "driveMode": "read",
            "briefsFrom": "Live October folders + copied brief text where we already had the Doc",
        }
    )
    briefs = briefs_from(previous)
    kept_comments = comments_by_key(previous)
    folders = folder_map()
    keep_other = [
        t
        for t in (db.get("tasks") or [])
        if (t.get("month") or "") not in MIRROR_MONTHS
    ]
    db["tasks"] = []
    for ym in MIRROR_MONTHS:
        parsed = excel_io.parse_workbook(xlsx, ym)
        excel_io.apply_to_db(db, parsed, ym)
    for task in db.get("tasks") or []:
        attach_live(task, briefs, folders)
    db["tasks"] = (db.get("tasks") or []) + keep_other
    apply_comments(db, kept_comments)
    db["notices"] = []
    db["noticeReads"] = {}
    db["events"] = [
        {
            "at": utc_now(),
            "text": "Mirror snapshot from live SP_MGX_check.xlsx. Clicks stay in the portal buffer.",
        }
    ]
    notice_io.ensure(db)
    db["notices"] = []
    return db


def restore_buffer_xlsx() -> None:
    BUFFER_XLSX.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ORIGIN_XLSX, BUFFER_XLSX)


def write_seeds(db: dict) -> None:
    blob = json.dumps(db, ensure_ascii=False, indent=2) + "\n"
    SEED_PATH.write_text(blob, encoding="utf-8")


def restore(carry_from: dict | None = None) -> dict:
    """Throw away the click buffer and return to the live snapshot."""
    restore_buffer_xlsx()
    previous = load_json(SEED_PATH) if SEED_PATH.exists() else {}
    db = hydrate(previous, ORIGIN_XLSX)
    if carry_from:
        apply_comments(db, comments_by_key(carry_from))
    db.setdefault("meta", {})["bufferDirty"] = False
    write_seeds(db)
    return db
