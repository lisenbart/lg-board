"""Read-only Google Drive pull. Never writes files back to Drive."""
from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import finance_io
import mirror_io

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
SECRETS = DATA / "secrets"
ROOTS_PATH = DATA / "drive_roots.json"
INDEX_PATH = DATA / "drive_index.json"
CLIENT_PATH = SECRETS / "google_client.json"
OAUTH_PATH = SECRETS / "google_oauth.json"
TOKEN_PATH = SECRETS / "google_drive_token.txt"
OAUTH_STATE_PATH = SECRETS / "drive_oauth_state.json"
SCOPE = "https://www.googleapis.com/auth/drive"
API = "https://www.googleapis.com/drive/v3"
TOKEN_URL = "https://oauth2.googleapis.com/token"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
FOLDER_MIME = "application/vnd.google-apps.folder"
NAME_ID = re.compile(r"^([A-Z]{2}-[A-Z0-9]+-\d+(?:-\d+)?)", re.I)
INVOICE_DOC = re.compile(r"^invoice(DD|DX)_\d{4}\.\d{2}\.\d{2}\.docx$", re.I)
_TOKEN_MEM: dict = {"at": 0.0, "value": ""}


class DriveSyncError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def folder_url(fid: str) -> str:
    return f"https://drive.google.com/drive/folders/{fid}"


def file_url(fid: str) -> str:
    return f"https://drive.google.com/file/d/{fid}/view"


def load_json(path: Path, fallback):
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def save_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def roots() -> dict:
    return load_json(ROOTS_PATH, {})


def skip_names() -> set[str]:
    return {str(n).strip().lower() for n in (roots().get("skipNames") or ["_acc_pass"]) if n}


def _client_blob() -> dict:
    raw = load_json(CLIENT_PATH, {})
    if not isinstance(raw, dict):
        return {}
    return raw.get("web") or raw.get("installed") or raw


def client_creds() -> tuple[str, str]:
    blob = _client_blob()
    cid = str(blob.get("client_id") or os.environ.get("LG_GOOGLE_CLIENT_ID") or "").strip()
    secret = str(blob.get("client_secret") or os.environ.get("LG_GOOGLE_CLIENT_SECRET") or "").strip()
    return cid, secret


def has_client() -> bool:
    cid, secret = client_creds()
    return bool(cid and secret)


def connected() -> bool:
    if (os.environ.get("LG_DRIVE_TOKEN") or os.environ.get("GOOGLE_DRIVE_TOKEN") or "").strip():
        return True
    if TOKEN_PATH.exists() and TOKEN_PATH.read_text(encoding="utf-8").strip():
        return True
    oauth = load_json(OAUTH_PATH, {})
    return bool(oauth.get("refresh_token") and (oauth.get("client_id") or has_client()))


def _form(url: str, payload: dict) -> dict:
    data = urllib.parse.urlencode(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode("utf-8"))


def access_token() -> str:
    env = (os.environ.get("LG_DRIVE_TOKEN") or os.environ.get("GOOGLE_DRIVE_TOKEN") or "").strip()
    if env:
        return env
    if TOKEN_PATH.exists():
        raw = TOKEN_PATH.read_text(encoding="utf-8").strip()
        if raw and not raw.startswith("{"):
            return raw
    oauth = load_json(OAUTH_PATH, {})
    refresh = str(oauth.get("refresh_token") or "").strip()
    if not refresh:
        return ""
    cached = str(_TOKEN_MEM.get("value") or "")
    if cached and time.time() - float(_TOKEN_MEM.get("at") or 0) < 3000:
        return cached
    cid = str(oauth.get("client_id") or "").strip()
    secret = str(oauth.get("client_secret") or "").strip()
    if not cid or not secret:
        cid, secret = client_creds()
    if not cid or not secret:
        raise DriveSyncError("Google OAuth client is missing")
    out = _form(
        TOKEN_URL,
        {
            "client_id": cid,
            "client_secret": secret,
            "refresh_token": refresh,
            "grant_type": "refresh_token",
        },
    )
    token = str(out.get("access_token") or "").strip()
    if not token:
        raise DriveSyncError("Google did not return an access token")
    _TOKEN_MEM["value"] = token
    _TOKEN_MEM["at"] = time.time()
    return token


def auth_url(redirect_uri: str, state: str) -> str:
    cid, _secret = client_creds()
    if not cid:
        raise DriveSyncError("Put Google OAuth client JSON in data/secrets/google_client.json")
    q = urllib.parse.urlencode(
        {
            "client_id": cid,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": SCOPE,
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": state,
        }
    )
    return f"{AUTH_URL}?{q}"


def begin_oauth(redirect_uri: str) -> str:
    import secrets as sec

    state = sec.token_urlsafe(24)
    save_json(
        OAUTH_STATE_PATH,
        {"state": state, "redirect_uri": redirect_uri, "at": utc_now()},
    )
    return auth_url(redirect_uri, state)


def finish_oauth(code: str, state: str) -> dict:
    pending = load_json(OAUTH_STATE_PATH, {})
    if not pending or pending.get("state") != state:
        raise DriveSyncError("OAuth state mismatch — start Connect Drive again")
    cid, secret = client_creds()
    if not cid or not secret:
        raise DriveSyncError("Google OAuth client is missing")
    redirect_uri = str(pending.get("redirect_uri") or "").strip()
    out = _form(
        TOKEN_URL,
        {
            "client_id": cid,
            "client_secret": secret,
            "code": str(code or "").strip(),
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    refresh = str(out.get("refresh_token") or "").strip()
    access = str(out.get("access_token") or "").strip()
    if not refresh and not access:
        raise DriveSyncError("Google did not return tokens")
    blob = {
        "client_id": cid,
        "client_secret": secret,
        "refresh_token": refresh or load_json(OAUTH_PATH, {}).get("refresh_token"),
        "token_uri": TOKEN_URL,
        "scopes": [SCOPE],
        "at": utc_now(),
    }
    if not blob.get("refresh_token"):
        raise DriveSyncError("Google did not send a refresh token — retry Connect Drive")
    save_json(OAUTH_PATH, blob)
    if access:
        _TOKEN_MEM["value"] = access
        _TOKEN_MEM["at"] = time.time()
    if OAUTH_STATE_PATH.exists():
        OAUTH_STATE_PATH.unlink()
    return {"ok": True, "connected": True}


def _api(token: str, path: str, query: dict | None = None, raw: bool = False):
    q = dict(query or {})
    url = f"{API}/{path}" + ("?" + urllib.parse.urlencode(q) if q else "")
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"}, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            data = res.read()
            return data if raw else json.loads(data.decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise DriveSyncError(f"Drive API {e.code}: {err[:300]}") from e


def list_children(token: str, parent_id: str) -> list[dict]:
    out: list[dict] = []
    page = ""
    while True:
        q = {
            "q": f"'{parent_id}' in parents and trashed = false",
            "fields": "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,size)",
            "pageSize": "100",
            "supportsAllDrives": "true",
            "includeItemsFromAllDrives": "true",
        }
        if page:
            q["pageToken"] = page
        batch = _api(token, "files", q)
        out.extend(batch.get("files") or [])
        page = batch.get("nextPageToken") or ""
        if not page:
            break
    return out


def download_file(token: str, file_id: str) -> bytes:
    return _api(
        token,
        f"files/{file_id}",
        {"alt": "media", "supportsAllDrives": "true"},
        raw=True,
    )


def _kind(name: str, mime: str, path: str) -> str:
    low = name.lower()
    if mime == FOLDER_MIME:
        return "folder"
    if low == "sp_mgx_check.xlsx":
        return "excel"
    if "calculator" in low and low.endswith(".xlsx"):
        return "calculator"
    if INVOICE_DOC.match(name):
        return "invoice"
    if "/CALC/" in path and low.endswith(".xlsx"):
        return "calculator"
    return "file"


def walk_docs(token: str) -> list[dict]:
    cfg = roots()
    docs = str(cfg.get("docs") or "")
    skip = skip_names()
    rows: list[dict] = []
    if not docs:
        return rows
    queue = [(docs, "LLC/docs")]
    seen = {docs}
    while queue and len(rows) < 500:
        fid, prefix = queue.pop(0)
        for item in list_children(token, fid):
            name = str(item.get("name") or "")
            if name.lower() in skip:
                continue
            mime = str(item.get("mimeType") or "")
            path = f"{prefix}/{name}"
            rec = {
                "id": item.get("id"),
                "name": name,
                "mime": mime,
                "path": path,
                "url": item.get("webViewLink") or (
                    folder_url(item["id"]) if mime == FOLDER_MIME else file_url(item["id"])
                ),
                "modified": item.get("modifiedTime") or "",
                "kind": _kind(name, mime, path),
            }
            rows.append(rec)
            if mime == FOLDER_MIME and item.get("id") not in seen:
                seen.add(item["id"])
                queue.append((item["id"], path))
    return rows


def map_project_folders(token: str) -> dict:
    cfg = roots()
    mapped: dict[str, str] = {}
    for key in ("octoberDD", "octoberDX"):
        parent = str(cfg.get(key) or "")
        if not parent:
            continue
        for item in list_children(token, parent):
            if item.get("mimeType") != FOLDER_MIME:
                continue
            code = NAME_ID.match(str(item.get("name") or "").strip())
            if not code:
                continue
            mapped[code.group(1).upper()] = folder_url(item["id"])
    return mapped


def _write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def _latest_templates(index_rows: list[dict]) -> dict[str, dict]:
    latest: dict[str, dict] = {}
    for row in index_rows:
        m = INVOICE_DOC.match(str(row.get("name") or ""))
        if not m:
            continue
        line = m.group(1).upper()
        stamp = str(row.get("name") or "")
        prev = latest.get(line)
        if not prev or stamp > str(prev.get("name") or ""):
            latest[line] = row
    return latest


def apply_meta(db: dict, extra: dict | None = None) -> None:
    cfg = roots()
    meta = db.setdefault("meta", {})
    meta["driveDocs"] = folder_url(cfg["docs"]) if cfg.get("docs") else ""
    meta["driveLiveExcel"] = file_url(cfg["excel"]) if cfg.get("excel") else meta.get("driveLiveExcel")
    meta["driveCalculator"] = file_url(cfg["calculator"]) if cfg.get("calculator") else meta.get("driveCalculator")
    meta["driveLiveOctober"] = folder_url(cfg["october"]) if cfg.get("october") else meta.get("driveLiveOctober")
    meta["driveMgxInvoices"] = folder_url(cfg["mgxInvoices"]) if cfg.get("mgxInvoices") else ""
    meta["driveMode"] = "read"
    if extra:
        meta.update(extra)


def status() -> dict:
    idx = load_json(INDEX_PATH, {})
    cfg = roots()
    files = idx.get("files") or []
    return {
        "connected": connected(),
        "hasClient": has_client(),
        "pulledAt": idx.get("pulledAt") or "",
        "source": idx.get("source") or "LLC/docs · read only",
        "docs": folder_url(cfg["docs"]) if cfg.get("docs") else "",
        "excel": file_url(cfg["excel"]) if cfg.get("excel") else "",
        "calculator": file_url(cfg["calculator"]) if cfg.get("calculator") else "",
        "october": folder_url(cfg["october"]) if cfg.get("october") else "",
        "invoices": folder_url(cfg["mgxInvoices"]) if cfg.get("mgxInvoices") else "",
        "counts": {
            "files": len(files),
            "excel": sum(1 for f in files if f.get("kind") == "excel"),
            "calculator": sum(1 for f in files if f.get("kind") == "calculator"),
            "invoice": sum(1 for f in files if f.get("kind") == "invoice"),
            "folder": sum(1 for f in files if f.get("kind") == "folder"),
        },
        "files": [
            row
            for row in files
            if row.get("kind") in {"excel", "calculator", "invoice"} or row.get("path") in {
                "LLC/docs/CALC",
                "LLC/docs/_clients",
                "LLC/docs/_clients/SUPERPLAY",
            }
        ][:40],
    }


def pull(db: dict | None = None, hydrate: bool = True) -> dict:
    """Download working files. Live Drive is never written."""
    if not connected():
        raise DriveSyncError("Drive is not connected on this server")
    token = access_token()
    if not token:
        raise DriveSyncError("Drive token missing")
    cfg = roots()
    downloaded = []
    excel_id = str(cfg.get("excel") or "")
    calc_id = str(cfg.get("calculator") or "")
    if excel_id:
        blob = download_file(token, excel_id)
        _write_bytes(mirror_io.ORIGIN_XLSX, blob)
        downloaded.append("SP_MGX_check.xlsx")
    if calc_id:
        blob = download_file(token, calc_id)
        _write_bytes(finance_io.CALC_PATH, blob)
        downloaded.append("SUPERPLAY_MGX_Calculator.xlsx")

    index_rows = walk_docs(token)
    for line, row in _latest_templates(index_rows).items():
        fid = str(row.get("id") or "")
        if not fid:
            continue
        dest = finance_io.TEMPLATE_DIR / f"invoice{line}.docx"
        _write_bytes(dest, download_file(token, fid))
        downloaded.append(dest.name)

    mapped = map_project_folders(token)
    if mapped:
        save_json(mirror_io.FOLDERS_PATH, mapped)

    idx = {
        "pulledAt": utc_now(),
        "source": "LLC/docs + live Excel / October · read only",
        "root": folder_url(cfg["docs"]) if cfg.get("docs") else "",
        "files": index_rows,
        "projects": mapped,
        "downloaded": downloaded,
    }
    save_json(INDEX_PATH, idx)

    applied = False
    if db is not None:
        if excel_id and mirror_io.ORIGIN_XLSX.exists():
            mirror_io.restore_buffer_xlsx()
        if hydrate:
            mirror_io.sync_from_files(db)
        apply_meta(
            db,
            {
                "drivePulledAt": idx["pulledAt"],
                "mirrorSource": "SP_MGX_check.xlsx · Google Drive · read only",
            },
        )
        applied = True

    return {
        "ok": True,
        "connected": True,
        "pulledAt": idx["pulledAt"],
        "downloaded": downloaded,
        "projects": len(mapped),
        "files": len(index_rows),
        "applied": applied,
    }
