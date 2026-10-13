"""Create MGX project folders + brief Docs in the live month DD / DX / DS folders."""
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
    r"(?:working folder|робоча папка|pls work here|please work here|work here|pls work)"
    r"[:\s\-]*[^\n]{0,60}?\n?\s*"
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


def file_url(fid: str) -> str:
    return f"https://drive.google.com/file/d/{fid}/view"


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


_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_PDF_MIME = "application/pdf"


def _http_upload(method: str, path: str, headers: dict, body: bytes) -> tuple[int, str]:
    conn = http.client.HTTPSConnection(DRIVE_HOST, timeout=90)
    try:
        conn.request(method, path, body=body, headers=headers)
        res = conn.getresponse()
        raw = res.read().decode("utf-8", errors="replace")
        return res.status, raw
    except (http.client.HTTPException, OSError, TimeoutError) as e:
        raise DriveError(f"Drive upload failed: {e}") from e
    finally:
        try:
            conn.close()
        except OSError:
            pass


def _upload_file(token: str, parent_id: str, name: str, blob: bytes, mime: str) -> dict:
    if not blob:
        raise DriveError(f"{name} is empty")
    found = _find_child(token, parent_id, name)
    if found:
        loc = (
            f"/upload/drive/v3/files/{found['id']}"
            f"?uploadType=media&supportsAllDrives=true&fields=id,name,webViewLink"
        )
        headers = _headers(token, {"Content-Type": mime, "Content-Length": str(len(blob))})
        status, raw = _http_upload("PATCH", loc, headers, blob)
        if status >= 400:
            raise DriveError(f"Drive API {status}: {raw[:300]}")
        out = json.loads(raw) if raw else {}
        fid = str(out.get("id") or found["id"])
        return {
            "id": fid,
            "name": name,
            "updated": True,
            "url": out.get("webViewLink") or file_url(fid),
        }
    boundary = f"lgboard{os.urandom(8).hex()}"
    meta = json.dumps({"name": name, "parents": [parent_id]})
    body = (
        f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n"
        f"--{boundary}\r\nContent-Type: {mime}\r\n\r\n"
    ).encode("utf-8") + blob + f"\r\n--{boundary}--\r\n".encode("utf-8")
    loc = "/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink"
    headers = _headers(
        token,
        {
            "Content-Type": f"multipart/related; boundary={boundary}",
            "Content-Length": str(len(body)),
        },
    )
    status, raw = _http_upload("POST", loc, headers, body)
    if status >= 400:
        raise DriveError(f"Drive API {status}: {raw[:300]}")
    out = json.loads(raw) if raw else {}
    fid = str(out.get("id") or "")
    if not fid:
        raise DriveError(f"Drive did not return an id for {name}")
    return {
        "id": fid,
        "name": name,
        "updated": False,
        "url": out.get("webViewLink") or file_url(fid),
    }


def ensure_invoice_month_folder(ym: str) -> dict:
    """LLC/docs/_clients/SUPERPLAY/invoice/MGX / 10_October."""
    token = drive_token()
    if not token:
        raise DriveError("Drive is not connected on this server")
    import drive_sync

    parent = str((drive_sync.roots() or {}).get("mgxInvoices") or "")
    if not parent:
        raise DriveError("MGX invoice folder is not configured")
    title = month_folder_name(ym)
    folder_id, created = _ensure_folder(token, parent, title)
    return {
        "ok": True,
        "folderId": folder_id,
        "folderUrl": folder_url(folder_id),
        "folder": title,
        "created": created,
        "path": f"LLC/docs/_clients/SUPERPLAY/invoice/MGX/{title}",
    }


def publish_invoices(ym: str, files: list[tuple[str, bytes]]) -> dict:
    """Write Word + PDF into the live Superplay MGX invoice month folder."""
    pack = ensure_invoice_month_folder(ym)
    token = drive_token()
    uploaded = []
    for name, blob in files:
        if not name or not blob:
            continue
        mime = _PDF_MIME if str(name).lower().endswith(".pdf") else _DOCX_MIME
        uploaded.append(_upload_file(token, pack["folderId"], name, blob, mime))
    return {**pack, "uploaded": uploaded, "count": len(uploaded)}


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


def line_from_name(name: str) -> str:
    m = re.match(r"^\s*(DD|DX|DS)\b", name or "", re.I)
    return m.group(1).upper() if m else "DD"


def is_test_task_name(task: dict) -> bool:
    return bool(re.search(r"test[-_]?task", str((task or {}).get("name") or ""), re.I))


def is_deletable_task(task: dict) -> bool:
    return bool(str((task or {}).get("id") or "").strip())


LIVE_LINE_META = {"DD": "driveLiveDD", "DX": "driveLiveDX", "DS": "driveLiveDS"}
LIVE_LINE_CFG = {"DD": "octoberDD", "DX": "octoberDX", "DS": "octoberDS"}


def remember_line_parent(db: dict, line: str, fid: str) -> None:
    if not fid or line not in LIVE_LINE_META:
        return
    meta = db.setdefault("meta", {})
    meta[LIVE_LINE_META[line]] = folder_url(fid)
    if line == "DS":
        meta["driveOctoberDS"] = folder_url(fid)
    import drive_sync

    cfg = drive_sync.roots()
    cfg[LIVE_LINE_CFG[line]] = fid
    drive_sync.save_json(drive_sync.ROOTS_PATH, cfg)


def live_line_parent_id(db: dict, ym: str, line: str, token: str) -> str:
    """Month / DD|DX|DS folder on the live Projects drive."""
    line = (line or "DD").upper()
    if line not in {"DD", "DX", "DS"}:
        line = "DD"
    meta = db.get("meta") or {}
    import drive_sync

    cfg = drive_sync.roots()
    url = meta.get(LIVE_LINE_META[line]) or ""
    fid = folder_id_from_url(url) or str(cfg.get(LIVE_LINE_CFG[line]) or "")
    if fid and ym == "2026-10":
        return fid
    oct_id = folder_id_from_url(meta.get("driveLiveOctober") or "") or str(cfg.get("october") or "")
    if ym == "2026-10" and oct_id:
        fid, _ = _ensure_folder(token, oct_id, line)
        remember_line_parent(db, line, fid)
        return fid
    projects = folder_id_from_url(meta.get("driveLiveProjects") or "") or "1IBEGffspl0b7Ze6jH9BZNoyMybHxWSGH"
    month_id = _mkdir(token, projects, month_folder_name(ym))
    fid, _ = _ensure_folder(token, month_id, line)
    remember_line_parent(db, line, fid)
    return fid


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


def ensure_live_pack(db: dict, task: dict, ym: str | None = None) -> dict:
    """Idempotent live folder + brief Doc. Never writes outside Projects / month / DD|DX|DS."""
    name = (task.get("name") or "").strip()
    if not name:
        return {"ok": False, "error": "task has no name"}
    apply_work_folder(task)
    if task.get("folderUrl") and task.get("docUrl"):
        return {
            "ok": True,
            "created": False,
            "folderUrl": task["folderUrl"],
            "docUrl": task["docUrl"],
        }
    ym = str(ym or task.get("month") or (db.get("meta") or {}).get("month") or "2026-10")
    line = task.get("line") or line_from_name(name)
    pack = create_live_pack(db, name, ym, line)
    missing = not (task.get("folderUrl") and task.get("docUrl"))
    task["folderUrl"] = pack.get("folderUrl") or task.get("folderUrl") or ""
    task["docUrl"] = pack.get("docUrl") or ""
    apply_work_folder(task)
    if missing:
        task.setdefault("activity", []).append(
            {
                "at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "text": f"Drive folder + brief Doc in {line}",
            }
        )
    return {"ok": True, "created": missing, **pack}


def ensure_live_packs(db: dict, tasks: list[dict], ym: str | None = None) -> dict:
    created = 0
    skipped = 0
    errors = []
    for task in tasks:
        try:
            out = ensure_live_pack(db, task, ym)
        except DriveError as e:
            errors.append({"name": task.get("name"), "error": str(e)})
            continue
        if out.get("created"):
            created += 1
        elif out.get("ok"):
            skipped += 1
        else:
            errors.append({"name": task.get("name"), "error": out.get("error")})
    ready = sum(1 for t in tasks if t.get("folderUrl") and t.get("docUrl"))
    return {"created": created, "linked": skipped, "ready": ready, "errors": errors}


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


def _doc_id_from_url(url: str) -> str:
    m = re.search(r"/document/d/([a-zA-Z0-9_-]+)", url or "")
    return m.group(1) if m else ""


def studio_pack_folder_id(task: dict) -> str:
    """October DD/DX/DS project folder — not the client working folder from the brief."""
    name = str((task or {}).get("name") or "").strip()
    fid = _folder_id_from_pack(name)
    if fid:
        return fid
    import excel_io
    import mirror_io

    key = excel_io._id_key(name)
    try:
        import drive_sync

        pack = (drive_sync.load_brief_packs() or {}).get(key) or {}
        fid = str(pack.get("folderId") or "") or folder_id_from_url(str(pack.get("folderUrl") or ""))
        if fid:
            return fid
    except Exception:
        pass
    if key:
        fid = folder_id_from_url(str(mirror_io.folder_map().get(key) or ""))
        if fid:
            return fid
    work = folder_id_from_url(client_folder_from_brief(str((task or {}).get("brief") or "")))
    cand = folder_id_from_url(str((task or {}).get("folderUrl") or ""))
    if cand and cand != work:
        return cand
    return ""


def rename_live_pack(db: dict, task: dict, new_name: str) -> dict:
    """Rename the studio folder + brief Doc. Moves the folder if DD/DX/DS changed."""
    old_name = str((task or {}).get("name") or "").strip()
    new_name = (new_name or "").strip()
    if not new_name:
        raise DriveError("task has no name")
    if new_name == old_name:
        return {"ok": True, "renamed": False}
    token = drive_token()
    fid = studio_pack_folder_id(task)
    did = _doc_id_from_url(str(task.get("docUrl") or ""))
    hit = cached_pack(old_name) or {}
    did = did or str(hit.get("docId") or "")
    if not token and (fid or did):
        raise DriveError("Drive is not connected on this server")
    old_line = str(task.get("line") or line_from_name(old_name) or "DD")
    new_line = line_from_name(new_name)
    ym = str(task.get("month") or (db.get("meta") or {}).get("month") or "2026-10")
    if fid and token:
        body = {"name": new_name}
        query = {}
        if new_line != old_line:
            new_parent = live_line_parent_id(db, ym, new_line, token)
            meta = _api(token, "GET", f"files/{fid}", query={"fields": "parents"})
            parents = [str(p) for p in (meta.get("parents") or [])]
            old_parent = live_line_parent_id(db, ym, old_line, token)
            if new_parent and new_parent not in parents:
                query["addParents"] = new_parent
                drop = old_parent if old_parent in parents else (parents[0] if parents else "")
                if drop and drop != new_parent:
                    query["removeParents"] = drop
        _api(token, "PATCH", f"files/{fid}", query=query or None, body=body)
    if did and token:
        _api(token, "PATCH", f"files/{did}", body={"name": new_name})
    forget_live_folder(old_name)
    if fid or did:
        pack = remember(new_name, fid, did)
        if fid:
            remember_live_folder(new_name, pack.get("folderUrl") or folder_url(fid))
    try:
        import drive_sync
        import excel_io

        packs = drive_sync.load_brief_packs()
        old_key = excel_io._id_key(old_name)
        new_key = excel_io._id_key(new_name)
        rec = packs.pop(old_key, None) if old_key else None
        if isinstance(rec, dict):
            rec["name"] = new_name
            if fid:
                rec["folderId"] = fid
                rec["folderUrl"] = folder_url(fid)
            if did:
                rec["docId"] = did
                rec["docUrl"] = doc_url(did)
            if new_key:
                packs[new_key] = rec
            drive_sync.save_json(drive_sync.BRIEFS_PATH, packs)
    except Exception:
        pass
    return {"ok": True, "renamed": True, "folderId": fid, "docId": did, "line": new_line}


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
