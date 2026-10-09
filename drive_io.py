"""Create MGX project folders + brief Docs in Drive sandbox _PORTAL_TEST only."""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
CACHE_PATH = DATA / "drive_cache.json"
TOKEN_PATH = DATA / "secrets" / "google_drive_token.txt"

FOLDER_MIME = "application/vnd.google-apps.folder"
DOC_MIME = "application/vnd.google-apps.document"
FOLDER_ID_RE = re.compile(r"(?:/folders/|open\?id=)([a-zA-Z0-9_-]+)")
DRIVE_FOLDER_URL_RE = re.compile(
    r"https://drive\.google\.com/(?:drive/folders/|open\?id=)[a-zA-Z0-9_-]+",
    re.I,
)
WORK_LABEL_RE = re.compile(
    r"(?:working folder|pls work here|please work here|work here|pls work)[:\s]*\n*"
    r"(https://drive\.google\.com/(?:drive/folders/|open\?id=)[a-zA-Z0-9_-]+)",
    re.I,
)
API = "https://www.googleapis.com/drive/v3"
UPLOAD = "https://www.googleapis.com/upload/drive/v3/files"


class DriveError(RuntimeError):
    pass


def normalize_folder_url(url: str) -> str:
    fid = folder_id_from_url(url)
    return folder_url(fid) if fid else ""


def client_folder_from_brief(brief: str) -> str:
    """Working folder labeled in the brief — never the first source-asset URL."""
    text = brief or ""
    labeled = WORK_LABEL_RE.search(text)
    if labeled:
        return normalize_folder_url(labeled.group(1))
    return ""


def work_folder(task: dict) -> str:
    """Where the performer puts files: labeled Working folder, else folderUrl."""
    return client_folder_from_brief(task.get("brief") or "") or str(task.get("folderUrl") or "").strip()


def apply_work_folder(task: dict) -> str:
    client = client_folder_from_brief(task.get("brief") or "")
    if client:
        task["folderUrl"] = client
    return work_folder(task)


def folder_id_from_url(url: str) -> str:
    m = FOLDER_ID_RE.search(url or "")
    return m.group(1) if m else ""


def folder_url(fid: str) -> str:
    return f"https://drive.google.com/drive/folders/{fid}"


def doc_url(fid: str) -> str:
    return f"https://docs.google.com/document/d/{fid}/edit"


def month_folder_name(ym: str) -> str:
    y, m = [int(x) for x in ym.split("-")]
    label = datetime(y, m, 1).strftime("%B")
    return f"{m:02d}_{label}"


def drive_token() -> str:
    env = (os.environ.get("LG_DRIVE_TOKEN") or os.environ.get("GOOGLE_DRIVE_TOKEN") or "").strip()
    if env:
        return env
    if TOKEN_PATH.exists():
        return TOKEN_PATH.read_text(encoding="utf-8").strip()
    return ""


def _load_cache() -> dict:
    if not CACHE_PATH.exists():
        return {"byName": {}}
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"byName": {}}


def _save_cache(cache: dict) -> None:
    DATA.mkdir(exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def remember(name: str, folder_id: str, doc_id: str) -> dict:
    cache = _load_cache()
    pack = {
        "folderId": folder_id,
        "docId": doc_id,
        "folderUrl": folder_url(folder_id),
        "docUrl": doc_url(doc_id),
    }
    cache.setdefault("byName", {})[name] = pack
    _save_cache(cache)
    return pack


def cached_pack(name: str) -> dict | None:
    pack = (_load_cache().get("byName") or {}).get(name)
    if not pack:
        return None
    if pack.get("folderUrl") and pack.get("docUrl"):
        return pack
    return None


def sandbox_root_id(db: dict) -> str:
    meta = db.get("meta") or {}
    fid = folder_id_from_url(meta.get("driveSandbox") or "")
    if not fid:
        raise DriveError("sandbox _PORTAL_TEST folder is not set")
    return fid


def _headers(token: str, extra: dict | None = None) -> dict:
    h = {"Authorization": f"Bearer {token}"}
    if extra:
        h.update(extra)
    return h


def _api(token: str, method: str, path: str, query: dict | None = None, body: dict | None = None) -> dict:
    q = urllib.parse.urlencode(query or {})
    url = f"{API}/{path}" + (f"?{q}" if q else "")
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers=_headers(token, {"Content-Type": "application/json"} if body is not None else None),
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise DriveError(f"Drive API {e.code}: {err[:300]}") from e


def _find_child(token: str, parent_id: str, title: str, mime: str | None = None) -> dict | None:
    safe = title.replace("\\", "\\\\").replace("'", "\\'")
    q = f"name = '{safe}' and '{parent_id}' in parents and trashed = false"
    if mime:
        q += f" and mimeType = '{mime}'"
    out = _api(
        token,
        "GET",
        "files",
        query={"q": q, "fields": "files(id,name,mimeType,webViewLink)", "pageSize": "10"},
    )
    files = out.get("files") or []
    return files[0] if files else None


def _mkdir(token: str, parent_id: str, title: str) -> str:
    found = _find_child(token, parent_id, title, FOLDER_MIME)
    if found:
        return found["id"]
    created = _api(
        token,
        "POST",
        "files",
        query={"fields": "id,webViewLink"},
        body={"name": title, "mimeType": FOLDER_MIME, "parents": [parent_id]},
    )
    return created["id"]


def _create_doc(token: str, parent_id: str, title: str, brief: str) -> str:
    found = _find_child(token, parent_id, title, DOC_MIME)
    if found:
        return found["id"]
    boundary = "lgboarddriveboundary"
    meta = json.dumps(
        {"name": title, "mimeType": DOC_MIME, "parents": [parent_id]},
        ensure_ascii=False,
    )
    body = (
        f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n"
        f"--{boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n{brief or 'Brief'}\r\n"
        f"--{boundary}--\r\n"
    ).encode("utf-8")
    url = UPLOAD + "?" + urllib.parse.urlencode({"uploadType": "multipart", "fields": "id,webViewLink"})
    req = urllib.request.Request(
        url,
        data=body,
        headers=_headers(token, {"Content-Type": f"multipart/related; boundary={boundary}"}),
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            created = json.loads(res.read().decode("utf-8"))
            return created["id"]
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise DriveError(f"Drive upload {e.code}: {err[:300]}") from e


def line_parent_id(db: dict, ym: str, line: str, token: str) -> str:
    meta = db.get("meta") or {}
    line = (line or "DD").upper()
    if line not in {"DD", "DX", "DS"}:
        line = "DD"
    if ym == "2026-10":
        key = {"DD": "driveOctoberDD", "DX": "driveOctoberDX"}.get(line)
        if key and meta.get(key):
            fid = folder_id_from_url(meta[key])
            if fid:
                return fid
    month_id = folder_id_from_url(meta.get("driveSandboxOctober") or "") if ym == "2026-10" else ""
    if not month_id:
        if not token:
            raise DriveError("Drive is not connected — cannot create a month folder")
        month_id = _mkdir(token, sandbox_root_id(db), month_folder_name(ym))
        if ym == "2026-10":
            meta["driveSandboxOctober"] = folder_url(month_id)
    if not token:
        raise DriveError("Drive is not connected")
    line_id = _mkdir(token, month_id, line)
    if ym == "2026-10" and line == "DS":
        meta["driveOctoberDS"] = folder_url(line_id)
    return line_id


def ensure_task(db: dict, task: dict, ym: str | None = None) -> dict:
    """Idempotent: project folder named as the task + Google Doc with the brief.

    Writes only under _PORTAL_TEST. Live Projects / 10_October is never a parent.
    Mirror mode never creates Drive files — clicks stay in the portal buffer.
    """
    name = (task.get("name") or "").strip()
    if not name:
        return {"ok": False, "error": "task has no name"}
    apply_work_folder(task)
    if (db.get("meta") or {}).get("mode") == "mirror":
        return {
            "ok": True,
            "created": False,
            "skipped": "mirror",
            "folderUrl": task.get("folderUrl") or "",
            "docUrl": task.get("docUrl") or "",
        }
    if task.get("folderUrl") and task.get("docUrl"):
        return {
            "ok": True,
            "created": False,
            "folderUrl": task["folderUrl"],
            "docUrl": task["docUrl"],
        }
    hit = cached_pack(name)
    if hit:
        missing = not (task.get("folderUrl") and task.get("docUrl"))
        task["folderUrl"] = hit["folderUrl"]
        task["docUrl"] = hit["docUrl"]
        if missing:
            task.setdefault("activity", []).append(
                {
                    "at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "text": "Folder and brief created in _PORTAL_TEST",
                }
            )
        return {"ok": True, "created": missing, **hit}

    ym = ym or task.get("month") or (db.get("meta") or {}).get("month") or "2026-10"
    token = drive_token()
    if not token:
        return {
            "ok": False,
            "error": "Drive token missing — folder lives in _PORTAL_TEST once LG_DRIVE_TOKEN is set",
        }

    sandbox_root_id(db)
    parent = line_parent_id(db, ym, task.get("line") or "DD", token)
    import mirror_io

    if mirror_io.is_live_id(parent):
        raise DriveError("refusing to write into the live October Drive folder")
    folder_id = _mkdir(token, parent, name)
    doc_id = _create_doc(token, folder_id, name, task.get("brief") or "")
    pack = remember(name, folder_id, doc_id)
    task["docUrl"] = pack["docUrl"]
    if not client_folder_from_brief(task.get("brief") or ""):
        task["folderUrl"] = pack["folderUrl"]
    apply_work_folder(task)
    task.setdefault("activity", []).append(
        {
            "at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "text": "Folder and brief created in _PORTAL_TEST",
        }
    )
    return {"ok": True, "created": True, **pack}


def ensure_tasks(db: dict, tasks: list[dict], ym: str | None = None) -> dict:
    created = 0
    skipped = 0
    errors = []
    for task in tasks:
        out = ensure_task(db, task, ym)
        if out.get("created"):
            created += 1
        elif out.get("ok"):
            skipped += 1
        else:
            errors.append({"name": task.get("name"), "error": out.get("error")})
    ready = sum(1 for t in tasks if t.get("folderUrl") and t.get("docUrl"))
    return {"created": created, "linked": skipped, "ready": ready, "errors": errors}
