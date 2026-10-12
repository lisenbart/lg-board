"""Create MGX project folders + brief Docs. Portal test tasks write into the live month DD/DX folders."""
from __future__ import annotations

import http.client
import json
import os
import re
import threading
import urllib.parse
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
CACHE_PATH = DATA / "drive_cache.json"
PACKS_PATH = DATA / "drive_packs.json"
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
DRIVE_HOST = "www.googleapis.com"
DOCS_HOST = "docs.googleapis.com"
HTTP_TIMEOUT = 20
_TLS = threading.local()
_LAST_BRIEF: dict[str, str] = {}


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
        raw = TOKEN_PATH.read_text(encoding="utf-8").strip()
        if raw and not raw.startswith("{"):
            return raw
    try:
        import drive_sync

        return drive_sync.access_token()
    except Exception:
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


def _load_packs() -> dict:
    if not PACKS_PATH.exists():
        return {"byName": {}}
    try:
        return json.loads(PACKS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"byName": {}}


def cached_pack(name: str) -> dict | None:
    for store in (_load_cache(), _load_packs()):
        pack = (store.get("byName") or {}).get(name)
        if pack and pack.get("folderUrl") and pack.get("docUrl"):
            return pack
    return None


def attach_cached_packs(db: dict) -> bool:
    """Fill empty folder/doc URLs from the local Drive cache (e.g. after a git pull)."""
    changed = False
    for task in db.get("tasks") or []:
        if task.get("folderUrl") and task.get("docUrl"):
            continue
        hit = cached_pack(str(task.get("name") or "").strip())
        if not hit:
            continue
        task["folderUrl"] = hit["folderUrl"]
        task["docUrl"] = hit["docUrl"]
        changed = True
    return changed


def sandbox_root_id(db: dict) -> str:
    meta = db.get("meta") or {}
    fid = folder_id_from_url(meta.get("driveSandbox") or "")
    if not fid:
        raise DriveError("sandbox _PORTAL_TEST folder is not set")
    return fid


def _headers(token: str, extra: dict | None = None) -> dict:
    h = {"Authorization": f"Bearer {token}", "Connection": "keep-alive"}
    if extra:
        h.update(extra)
    return h


def _host_conn(host: str) -> http.client.HTTPSConnection:
    bag = getattr(_TLS, "conns", None)
    if bag is None:
        bag = {}
        _TLS.conns = bag
    conn = bag.get(host)
    if conn is None:
        conn = http.client.HTTPSConnection(host, timeout=HTTP_TIMEOUT)
        bag[host] = conn
    return conn


def _drop_conn(host: str) -> None:
    bag = getattr(_TLS, "conns", None) or {}
    conn = bag.pop(host, None)
    if conn is None:
        return
    try:
        conn.close()
    except OSError:
        pass


def _http(host: str, method: str, path: str, headers: dict, body: bytes | None = None) -> tuple[int, str]:
    last_err: Exception | None = None
    for _ in range(2):
        try:
            conn = _host_conn(host)
            conn.request(method, path, body=body, headers=headers)
            res = conn.getresponse()
            raw = res.read().decode("utf-8", errors="replace")
            return res.status, raw
        except (http.client.HTTPException, OSError, TimeoutError) as e:
            last_err = e
            _drop_conn(host)
    raise DriveError(f"Drive HTTP failed: {last_err}") from last_err


def _api(token: str, method: str, path: str, query: dict | None = None, body: dict | None = None) -> dict:
    q = {"supportsAllDrives": "true"}
    if query:
        q.update(query)
    loc = f"/drive/v3/{path}?" + urllib.parse.urlencode(q)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = _headers(token, {"Content-Type": "application/json"} if data is not None else None)
    status, raw = _http(DRIVE_HOST, method, loc, headers, data)
    if status >= 400:
        raise DriveError(f"Drive API {status}: {raw[:300]}")
    return json.loads(raw) if raw else {}


def _find_child(token: str, parent_id: str, title: str, mime: str | None = None) -> dict | None:
    safe = title.replace("\\", "\\\\").replace("'", "\\'")
    q = f"name = '{safe}' and '{parent_id}' in parents and trashed = false"
    if mime:
        q += f" and mimeType = '{mime}'"
    out = _api(
        token,
        "GET",
        "files",
        query={
            "q": q,
            "fields": "files(id,name,mimeType,webViewLink)",
            "pageSize": "10",
            "includeItemsFromAllDrives": "true",
        },
    )
    files = out.get("files") or []
    return files[0] if files else None


def _ensure_folder(token: str, parent_id: str, title: str) -> tuple[str, bool]:
    found = _find_child(token, parent_id, title, FOLDER_MIME)
    if found:
        return found["id"], False
    created = _api(
        token,
        "POST",
        "files",
        query={"fields": "id,webViewLink"},
        body={"name": title, "mimeType": FOLDER_MIME, "parents": [parent_id]},
    )
    return created["id"], True


def _mkdir(token: str, parent_id: str, title: str) -> str:
    fid, _ = _ensure_folder(token, parent_id, title)
    return fid


def _create_doc(token: str, parent_id: str, title: str, brief: str = "", *, skip_find: bool = False) -> str:
    if not skip_find:
        found = _find_child(token, parent_id, title, DOC_MIME)
        if found:
            return found["id"]
    created = _api(
        token,
        "POST",
        "files",
        query={"fields": "id,webViewLink"},
        body={"name": title, "mimeType": DOC_MIME, "parents": [parent_id]},
    )
    did = str(created.get("id") or "")
    if did:
        _LAST_BRIEF[did] = ""
    if did and (brief or "").strip() and (brief or "").strip() != "Brief":
        write_brief_doc(doc_url(did), brief)
    return did


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


def line_from_name(name: str) -> str:
    m = re.match(r"^\s*(DD|DX|DS)\b", name or "", re.I)
    return m.group(1).upper() if m else "DD"


def is_test_task_name(task: dict) -> bool:
    return bool(re.search(r"test[-_]?task", str((task or {}).get("name") or ""), re.I))


def is_deletable_task(task: dict) -> bool:
    if is_test_task_name(task):
        return True
    if str((task or {}).get("source") or "") == "portal":
        return True
    return str((task or {}).get("id") or "").startswith("t-new-")


def live_line_parent_id(db: dict, ym: str, line: str, token: str) -> str:
    """Month / DD|DX folder on the live Projects drive — not _PORTAL_TEST."""
    line = (line or "DD").upper()
    if line not in {"DD", "DX", "DS"}:
        line = "DD"
    meta = db.get("meta") or {}
    import drive_sync

    cfg = drive_sync.roots()
    if ym == "2026-10":
        url = meta.get("driveLiveDD" if line == "DD" else "driveLiveDX" if line == "DX" else "") or ""
        fid = folder_id_from_url(url)
        if not fid:
            fid = str(cfg.get("octoberDD" if line == "DD" else "octoberDX" if line == "DX" else "") or "")
        if fid:
            return fid
        oct_id = folder_id_from_url(meta.get("driveLiveOctober") or "") or str(cfg.get("october") or "")
        if oct_id:
            return _mkdir(token, oct_id, line)
    projects = folder_id_from_url(meta.get("driveLiveProjects") or "") or "1IBEGffspl0b7Ze6jH9BZNoyMybHxWSGH"
    month_id = _mkdir(token, projects, month_folder_name(ym))
    return _mkdir(token, month_id, line)


def remember_live_folder(name: str, url: str) -> None:
    import excel_io
    import mirror_io

    key = excel_io._id_key(name)
    if not key or not url:
        return
    mapped = mirror_io.folder_map()
    mapped[key] = url
    mirror_io.FOLDERS_PATH.parent.mkdir(parents=True, exist_ok=True)
    mirror_io.FOLDERS_PATH.write_text(
        json.dumps(mapped, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def create_live_pack(db: dict, name: str, ym: str, line: str) -> dict:
    """Create the project folder + empty brief Doc in the live month line folder."""
    name = (name or "").strip()
    if not name:
        raise DriveError("task has no name")
    hit = cached_pack(name)
    if hit:
        remember_live_folder(name, hit["folderUrl"])
        return hit
    token = drive_token()
    if not token:
        raise DriveError(
            "Drive is not connected on this server. Put Google service-account JSON in "
            "data/secrets/google_service.json and share October DD/DX with that account."
        )
    parent = live_line_parent_id(db, ym, line, token)
    folder_id, is_new = _ensure_folder(token, parent, name)
    doc_id = _create_doc(token, folder_id, name, skip_find=is_new)
    pack = remember(name, folder_id, doc_id)
    remember_live_folder(name, pack["folderUrl"])
    return pack


def forget_live_folder(name: str) -> None:
    import excel_io
    import mirror_io

    key = excel_io._id_key(name)
    cache = _load_cache()
    (cache.get("byName") or {}).pop(name, None)
    _save_cache(cache)
    packs = _load_packs()
    if name in (packs.get("byName") or {}):
        packs["byName"].pop(name, None)
        PACKS_PATH.write_text(json.dumps(packs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if not key:
        return
    mapped = mirror_io.folder_map()
    if key in mapped:
        mapped.pop(key, None)
        mirror_io.FOLDERS_PATH.write_text(
            json.dumps(mapped, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )


def _folder_id_from_pack(name: str) -> str:
    for store in (_load_cache(), _load_packs()):
        pack = (store.get("byName") or {}).get(name) or {}
        fid = str(pack.get("folderId") or "") or folder_id_from_url(str(pack.get("folderUrl") or ""))
        if fid:
            return fid
    return ""


def _search_folder(token: str, name: str, parent_id: str = "") -> str:
    safe = name.replace("\\", "\\\\").replace("'", "\\'")
    q = f"name = '{safe}' and mimeType = '{FOLDER_MIME}' and trashed = false"
    if parent_id:
        q += f" and '{parent_id}' in parents"
    query = {
        "q": q,
        "fields": "files(id,name)",
        "pageSize": "10",
        "includeItemsFromAllDrives": "true",
    }
    try:
        out = _api(token, "GET", "files", query={**query, "corpora": "allDrives"})
    except DriveError:
        out = _api(token, "GET", "files", query=query)
    files = out.get("files") or []
    return str((files[0] or {}).get("id") or "") if files else ""


def _trash_file(token: str, fid: str) -> None:
    try:
        _api(token, "PATCH", f"files/{fid}", body={"trashed": True})
    except DriveError:
        _api(token, "DELETE", f"files/{fid}")


def resolve_live_folder_id(task: dict, db: dict | None = None) -> str:
    name = str((task or {}).get("name") or "").strip()
    fid = folder_id_from_url((task or {}).get("folderUrl") or "") or _folder_id_from_pack(name)
    if fid:
        return fid
    token = drive_token()
    if not token:
        return ""
    parents: list[str] = []
    if db is not None:
        ym = str(task.get("month") or (db.get("meta") or {}).get("month") or "2026-10")
        line = str(task.get("line") or line_from_name(name) or "DD")
        other = "DX" if line == "DD" else "DD"
        for cand in (line, other):
            try:
                pid = live_line_parent_id(db, ym, cand, token)
            except DriveError:
                continue
            if pid and pid not in parents:
                parents.append(pid)
    for parent in parents:
        fid = _search_folder(token, name, parent)
        if fid:
            return fid
    return _search_folder(token, name)


def trash_live_pack(task: dict, db: dict | None = None) -> dict:
    """Move the test folder (and the brief Doc inside it) to Drive trash."""
    name = str((task or {}).get("name") or "").strip()
    token = drive_token()
    fid = resolve_live_folder_id(task, db)
    if not fid:
        forget_live_folder(name)
        return {"ok": True, "trashed": False, "skipped": "no Drive folder"}
    if not token:
        raise DriveError("Drive is not connected on this server")
    _trash_file(token, fid)
    forget_live_folder(name)
    return {"ok": True, "trashed": True, "folderId": fid}


def sync_task_brief(db: dict, task: dict) -> dict:
    """Make sure the live folder + Doc exist, then write the card brief into the Doc."""
    name = str((task or {}).get("name") or "").strip()
    if not name:
        raise DriveError("task has no name")
    ym = str(task.get("month") or (db.get("meta") or {}).get("month") or "2026-10")
    line = task.get("line") or line_from_name(name)
    if not task.get("folderUrl") or not task.get("docUrl"):
        pack = create_live_pack(db, name, ym, line)
        task["folderUrl"] = pack.get("folderUrl") or ""
        task["docUrl"] = pack.get("docUrl") or ""
    write_brief_doc(task.get("docUrl") or "", task.get("brief") or "")
    return {
        "ok": True,
        "folderUrl": task.get("folderUrl") or "",
        "docUrl": task.get("docUrl") or "",
    }


def _docs_json(token: str, method: str, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = _headers(token, {"Content-Type": "application/json"} if data is not None else None)
    status, raw = _http(DOCS_HOST, method, path, headers, data)
    if status >= 400:
        raise DriveError(f"Docs API {status}: {raw[:300]}")
    return json.loads(raw) if raw else {}


def _docs_batch(token: str, did: str, requests: list[dict]) -> dict:
    path = "/v1/documents/" + urllib.parse.quote(did) + ":batchUpdate"
    return _docs_json(token, "POST", path, {"requests": requests})


def _rewrite_doc(token: str, did: str, text: str) -> None:
    doc = _docs_json(
        token,
        "GET",
        f"/v1/documents/{urllib.parse.quote(did)}?fields=body(content(endIndex))",
    )
    end = 1
    for block in (doc.get("body") or {}).get("content") or []:
        try:
            end = max(end, int(block.get("endIndex") or 1))
        except (TypeError, ValueError):
            pass
    requests = []
    if end > 2:
        requests.append({"deleteContentRange": {"range": {"startIndex": 1, "endIndex": end - 1}}})
    body = (text or "").strip()
    if body:
        requests.append({"insertText": {"location": {"index": 1}, "text": body}})
    if requests:
        _docs_batch(token, did, requests)


def write_brief_doc(doc_url: str, text: str) -> None:
    did = ""
    m = re.search(r"/document/d/([a-zA-Z0-9_-]+)", doc_url or "")
    if m:
        did = m.group(1)
    if not did:
        raise DriveError("task has no Google Doc yet")
    token = drive_token()
    if not token:
        raise DriveError("Drive is not connected on this server")
    body = (text or "").strip()
    prev = _LAST_BRIEF.get(did)
    if prev == body:
        return
    if prev is None:
        _rewrite_doc(token, did, body)
    elif prev == "":
        if body:
            _docs_batch(token, did, [{"insertText": {"location": {"index": 1}, "text": body}}])
    else:
        out = _docs_batch(
            token,
            did,
            [
                {
                    "replaceAllText": {
                        "containsText": {"text": prev, "matchCase": True},
                        "replaceText": body,
                    }
                }
            ],
        )
        n = 0
        try:
            n = int((((out.get("replies") or [{}])[0]).get("replaceAllText") or {}).get("occurrencesChanged") or 0)
        except (TypeError, ValueError, IndexError):
            n = 0
        if n < 1:
            _rewrite_doc(token, did, body)
    _LAST_BRIEF[did] = body
