"""Google Drive pull + always-on writes via service account or stored OAuth."""
from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import tempfile
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
BRIEFS_PATH = DATA / "mirror" / "live_briefs.json"
CLIENT_PATH = SECRETS / "google_client.json"
OAUTH_PATH = SECRETS / "google_oauth.json"
SA_PATH = SECRETS / "google_service.json"
TOKEN_PATH = SECRETS / "google_drive_token.txt"
BUILD = "2026-10-13e"
OAUTH_STATE_PATH = SECRETS / "drive_oauth_state.json"
SCOPE = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents"
API = "https://www.googleapis.com/drive/v3"
TOKEN_URL = "https://oauth2.googleapis.com/token"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
FOLDER_MIME = "application/vnd.google-apps.folder"
DOC_MIME = "application/vnd.google-apps.document"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
NAME_ID = re.compile(r"^([A-Z]{2}-[A-Z0-9]+-\d+(?:-\d+)?)", re.I)
INVOICE_DOC = re.compile(r"^invoice(DD|DX)_\d{4}\.\d{2}\.\d{2}\.(docx|pdf)$", re.I)
_TOKEN_MEM: dict = {"at": 0.0, "value": ""}
_EXCEL_FINGERPRINT = ""


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


def has_service_account() -> bool:
    blob = load_json(SA_PATH, {})
    return bool(blob.get("client_email") and blob.get("private_key"))


def connected() -> bool:
    if (os.environ.get("LG_DRIVE_TOKEN") or os.environ.get("GOOGLE_DRIVE_TOKEN") or "").strip():
        return True
    if has_service_account():
        return True
    if TOKEN_PATH.exists() and TOKEN_PATH.read_text(encoding="utf-8").strip():
        return True
    oauth = load_json(OAUTH_PATH, {})
    return bool(oauth.get("refresh_token") and (oauth.get("client_id") or has_client()))


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def service_account_token() -> str:
    blob = load_json(SA_PATH, {})
    email = str(blob.get("client_email") or "").strip()
    key = str(blob.get("private_key") or "")
    if not email or not key:
        return ""
    cached = str(_TOKEN_MEM.get("value") or "")
    if cached and _TOKEN_MEM.get("kind") == "sa" and time.time() - float(_TOKEN_MEM.get("at") or 0) < 3000:
        return cached
    now = int(time.time())
    header = _b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode("utf-8"))
    payload = _b64url(
        json.dumps(
            {
                "iss": email,
                "scope": SCOPE,
                "aud": TOKEN_URL,
                "iat": now,
                "exp": now + 3600,
            }
        ).encode("utf-8")
    )
    signing_input = f"{header}.{payload}".encode("ascii")
    with tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False) as tmp:
        tmp.write(key)
        key_path = tmp.name
    try:
        sig = subprocess.check_output(
            ["openssl", "dgst", "-sha256", "-sign", key_path],
            input=signing_input,
            stderr=subprocess.DEVNULL,
        )
    except (OSError, subprocess.CalledProcessError) as e:
        raise DriveSyncError(f"service account sign failed: {e}") from e
    finally:
        try:
            os.unlink(key_path)
        except OSError:
            pass
    assertion = f"{header}.{payload}.{_b64url(sig)}"
    out = _form(
        TOKEN_URL,
        {
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": assertion,
        },
    )
    token = str(out.get("access_token") or "").strip()
    if not token:
        raise DriveSyncError("Google did not return a service-account token")
    _TOKEN_MEM["value"] = token
    _TOKEN_MEM["at"] = time.time()
    _TOKEN_MEM["kind"] = "sa"
    return token


def save_client(raw: str) -> dict:
    text = (raw or "").strip()
    if not text:
        raise DriveSyncError("paste the Google OAuth client JSON")
    try:
        blob = json.loads(text)
    except json.JSONDecodeError as e:
        raise DriveSyncError("that is not JSON") from e
    if not isinstance(blob, dict):
        raise DriveSyncError("that JSON has no client_id")
    web = blob.get("web") or blob.get("installed") or blob
    if not isinstance(web, dict) or not str(web.get("client_id") or "").strip():
        raise DriveSyncError("that JSON has no client_id")
    packed = blob if ("web" in blob or "installed" in blob) else {"web": web}
    SECRETS.mkdir(parents=True, exist_ok=True)
    save_json(CLIENT_PATH, packed)
    cid, secret = client_creds()
    return {"hasClient": True, "clientId": cid, "hasSecret": bool(secret)}


def save_access_token(token: str) -> None:
    raw = (token or "").strip()
    if not raw:
        raise DriveSyncError("paste a Drive access token")
    SECRETS.mkdir(parents=True, exist_ok=True)
    TOKEN_PATH.write_text(raw + "\n", encoding="utf-8")
    try:
        TOKEN_PATH.chmod(0o600)
    except OSError:
        pass
    _TOKEN_MEM["value"] = raw
    _TOKEN_MEM["at"] = time.time()


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
    if has_service_account():
        return service_account_token()
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


def _api(token: str, path: str, query: dict | None = None, raw: bool = False, timeout: int = 25):
    q = dict(query or {})
    url = f"{API}/{path}" + ("?" + urllib.parse.urlencode(q) if q else "")
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"}, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            data = res.read()
            return data if raw else json.loads(data.decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise DriveSyncError(f"Drive API {e.code}: {err[:300]}") from e
    except TimeoutError as e:
        raise DriveSyncError(f"Drive API timeout after {timeout}s") from e
    except urllib.error.URLError as e:
        raise DriveSyncError(f"Drive API: {e.reason or e}") from e


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
    """Latest bytes. Prefer headRevisionId so we do not get a stale cached xlsx."""
    mime = ""
    rev = ""
    try:
        meta = _api(
            token,
            f"files/{file_id}",
            {
                "fields": "mimeType,name,headRevisionId,modifiedTime,size",
                "supportsAllDrives": "true",
            },
            timeout=15,
        )
        mime = str((meta or {}).get("mimeType") or "")
        rev = str((meta or {}).get("headRevisionId") or "")
    except DriveSyncError:
        mime = ""
        rev = ""
    if mime == "application/vnd.google-apps.spreadsheet":
        return _api(
            token,
            f"files/{file_id}/export",
            {"mimeType": XLSX_MIME},
            raw=True,
            timeout=45,
        )
    if rev:
        try:
            return _api(
                token,
                f"files/{file_id}/revisions/{urllib.parse.quote(rev)}",
                {"alt": "media", "supportsAllDrives": "true"},
                raw=True,
                timeout=45,
            )
        except DriveSyncError as e:
            print(f"[drive] revision {rev}: {e}", flush=True)
    return _api(
        token,
        f"files/{file_id}",
        {"alt": "media", "supportsAllDrives": "true"},
        raw=True,
        timeout=45,
    )


def upload_media(file_id: str, blob: bytes, mime: str) -> dict:
    """Overwrite an existing Drive file by id (same files pull() downloads)."""
    token = access_token()
    if not token:
        raise DriveSyncError("Drive is not connected on this server")
    fid = str(file_id or "").strip()
    if not fid:
        raise DriveSyncError("Drive file id missing")
    if not blob:
        raise DriveSyncError("file is empty")
    url = (
        "https://www.googleapis.com/upload/drive/v3/files/"
        + urllib.parse.quote(fid)
        + "?uploadType=media&supportsAllDrives=true&fields=id,name,webViewLink"
    )
    req = urllib.request.Request(url, data=blob, method="PATCH")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", mime)
    req.add_header("Content-Length", str(len(blob)))
    try:
        with urllib.request.urlopen(req, timeout=90) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw else {"id": fid}
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise DriveSyncError(f"Drive upload {e.code}: {err[:300]}") from e


def _rfc3339_ts(raw: str) -> float:
    text = str(raw or "").strip()
    if not text:
        return 0.0
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text).timestamp()
    except ValueError:
        return 0.0


def drive_excel_is_newer_than_local() -> bool:
    """Do not push a stale VPS copy over rows someone just typed in Drive."""
    import excel_io

    path = excel_io.XLSX_PATH
    if not path.exists():
        return True
    token = access_token()
    fid = str(roots().get("excel") or "")
    if not token or not fid:
        return False
    try:
        meta = _api(
            token,
            f"files/{fid}",
            {"fields": "modifiedTime,size", "supportsAllDrives": "true"},
            timeout=12,
        )
    except DriveSyncError:
        return False
    drive_ts = _rfc3339_ts(str((meta or {}).get("modifiedTime") or ""))
    if not drive_ts:
        return False
    local_ts = path.stat().st_mtime
    return drive_ts > local_ts + 8


def push_workbooks(*, excel: bool = True, calculator: bool = False) -> dict:
    """Write local SP_MGX_check / calculator onto the live Drive files."""
    import excel_io

    if not connected():
        return {"ok": False, "skipped": True, "reason": "Drive is not connected"}
    cfg = roots()
    uploaded = []
    if excel:
        path = excel_io.XLSX_PATH
        fid = str(cfg.get("excel") or "")
        if not path.exists():
            raise DriveSyncError(f"Excel missing: {path}")
        if not fid:
            raise DriveSyncError("live Excel id is not configured")
        if drive_excel_is_newer_than_local():
            print("[drive] skip Excel push — Drive file is newer than the desk copy", flush=True)
        else:
            out = upload_media(fid, path.read_bytes(), XLSX_MIME)
            uploaded.append(
                {
                    "name": "SP_MGX_check.xlsx",
                    "id": out.get("id") or fid,
                    "url": out.get("webViewLink") or file_url(fid),
                }
            )
    if calculator:
        path = finance_io.CALC_PATH
        fid = str(cfg.get("calculator") or "")
        if path.exists() and fid:
            out = upload_media(fid, path.read_bytes(), XLSX_MIME)
            uploaded.append(
                {
                    "name": "SUPERPLAY_MGX_Calculator.xlsx",
                    "id": out.get("id") or fid,
                    "url": out.get("webViewLink") or file_url(fid),
                }
            )
    return {"ok": True, "uploaded": uploaded, "count": len(uploaded)}


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
    for key in ("octoberDD", "octoberDX", "octoberDS"):
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


def export_plain(token: str, file_id: str) -> str:
    data = _api(
        token,
        f"files/{file_id}/export",
        {"mimeType": "text/plain", "supportsAllDrives": "true"},
        raw=True,
    )
    return (data or b"").decode("utf-8-sig", errors="replace").strip()


def _pick_doc(children: list[dict], folder_name: str) -> dict | None:
    docs = [row for row in children if row.get("mimeType") == DOC_MIME]
    if not docs:
        return None
    want = (folder_name or "").strip().lower()
    for row in docs:
        if str(row.get("name") or "").strip().lower() == want:
            return row
    for row in docs:
        title = str(row.get("name") or "").strip().lower()
        if want and (title in want or want in title):
            return row
    return docs[0]


def load_brief_packs() -> dict:
    raw = load_json(BRIEFS_PATH, {})
    return raw if isinstance(raw, dict) else {}


def scan_october_packs(token: str, need_keys: set[str] | None = None) -> tuple[dict, dict]:
    """Read-only: October DD/DX/DS folders + the Google Doc inside each one."""
    cfg = roots()
    packs = load_brief_packs()
    mapped: dict[str, str] = {}
    for key in ("octoberDD", "octoberDX", "octoberDS"):
        parent = str(cfg.get(key) or "")
        if not parent:
            continue
        for item in list_children(token, parent):
            if item.get("mimeType") != FOLDER_MIME:
                continue
            name = str(item.get("name") or "").strip()
            code = NAME_ID.match(name)
            if not code:
                continue
            kid = code.group(1).upper()
            fid = str(item.get("id") or "")
            mapped[kid] = folder_url(fid)
            prev = packs.get(kid) if isinstance(packs.get(kid), dict) else {}
            if need_keys is not None and kid not in need_keys:
                rec = dict(prev)
                rec.update({"folderId": fid, "folderUrl": mapped[kid], "name": name})
                packs[kid] = rec
                continue
            if prev.get("docId") and prev.get("brief") and prev.get("docUrl"):
                rec = dict(prev)
                rec.update({"folderId": fid, "folderUrl": mapped[kid], "name": name})
                packs[kid] = rec
                continue
            kids = list_children(token, fid) if fid else []
            doc = _pick_doc(kids, name)
            rec = {
                "folderId": fid,
                "folderUrl": mapped[kid],
                "name": name,
                "docId": str(prev.get("docId") or ""),
                "docUrl": str(prev.get("docUrl") or ""),
                "brief": str(prev.get("brief") or ""),
            }
            if doc:
                rec["docId"] = str(doc.get("id") or "")
                rec["docUrl"] = str(doc.get("webViewLink") or "") or (
                    f"https://docs.google.com/document/d/{rec['docId']}/edit" if rec["docId"] else ""
                )
                if not rec["brief"] and rec["docId"]:
                    try:
                        rec["brief"] = export_plain(token, rec["docId"])
                    except DriveSyncError as e:
                        print(f"[drive] export brief failed for {name}: {e}", flush=True)
            packs[kid] = rec
    if mapped:
        save_json(mirror_io.FOLDERS_PATH, mapped)
    save_json(BRIEFS_PATH, packs)
    return mapped, packs


def apply_brief_packs(db: dict, packs: dict | None = None) -> int:
    import excel_io
    import drive_io

    packs = packs if packs is not None else load_brief_packs()
    filled = 0
    for task in db.get("tasks") or []:
        if str(task.get("source") or "") == "portal":
            continue
        key = excel_io._id_key(task.get("name") or "")
        pack = packs.get(key) if key else None
        if not isinstance(pack, dict):
            continue
        changed = False
        if pack.get("folderUrl") and not str(task.get("folderUrl") or "").strip():
            task["folderUrl"] = pack["folderUrl"]
            changed = True
        if pack.get("docUrl") and not str(task.get("docUrl") or "").strip():
            task["docUrl"] = pack["docUrl"]
            changed = True
        if pack.get("brief") and not str(task.get("brief") or "").strip():
            task["brief"] = pack["brief"]
            changed = True
        if changed:
            filled += 1
            drive_io.apply_work_folder(task)
            task.setdefault("activity", []).append(
                {
                    "at": utc_now(),
                    "text": "Linked folder + brief Doc from live October Drive",
                }
            )
    return filled


def missing_brief_keys(db: dict) -> set[str]:
    import excel_io

    month = str((db.get("meta") or {}).get("month") or "2026-10")
    need: set[str] = set()
    for task in db.get("tasks") or []:
        if str(task.get("source") or "") == "portal":
            continue
        if str(task.get("month") or month) != month:
            continue
        if str(task.get("studioStatus") or "") == "closed":
            continue
        if str(task.get("brief") or "").strip() and str(task.get("docUrl") or "").strip():
            continue
        key = excel_io._id_key(task.get("name") or "")
        if key:
            need.add(key)
    return need


def attach_missing_briefs(db: dict) -> int:
    """Fill empty card brief/doc from the live October folder + Google Doc. Never writes Drive."""
    cached = load_brief_packs()
    filled = apply_brief_packs(db, cached)
    need = missing_brief_keys(db)
    if not need:
        return filled
    if not connected():
        return filled
    token = access_token()
    if not token:
        return filled
    _mapped, packs = scan_october_packs(token, need)
    return filled + apply_brief_packs(db, packs)


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


STALE_META_KEYS = (
    "driveSandbox",
    "driveSandboxOctober",
    "driveSandboxExcel",
    "driveOctoberDD",
    "driveOctoberDX",
)


def apply_meta(db: dict, extra: dict | None = None) -> bool:
    cfg = roots()
    meta = db.setdefault("meta", {})
    stripped = False
    for key in STALE_META_KEYS:
        if key in meta:
            meta.pop(key, None)
            stripped = True
    meta["driveDocs"] = folder_url(cfg["docs"]) if cfg.get("docs") else ""
    meta["driveLiveExcel"] = file_url(cfg["excel"]) if cfg.get("excel") else meta.get("driveLiveExcel")
    meta["driveCalculator"] = file_url(cfg["calculator"]) if cfg.get("calculator") else meta.get("driveCalculator")
    meta["driveLiveOctober"] = folder_url(cfg["october"]) if cfg.get("october") else meta.get("driveLiveOctober")
    if cfg.get("octoberDD"):
        meta["driveLiveDD"] = folder_url(cfg["octoberDD"])
    if cfg.get("octoberDX"):
        meta["driveLiveDX"] = folder_url(cfg["octoberDX"])
    if cfg.get("octoberDS"):
        meta["driveLiveDS"] = folder_url(cfg["octoberDS"])
        meta["driveOctoberDS"] = meta["driveLiveDS"]
    meta["driveMgxInvoices"] = folder_url(cfg["mgxInvoices"]) if cfg.get("mgxInvoices") else ""
    meta["driveMode"] = "live"
    if extra:
        meta.update(extra)
    return stripped


def status() -> dict:
    idx = load_json(INDEX_PATH, {})
    cfg = roots()
    files = idx.get("files") or []
    cid, secret = client_creds()
    return {
        "build": BUILD,
        "connected": connected(),
        "serviceAccount": has_service_account(),
        "hasClient": has_client(),
        "clientId": cid,
        "hasSecret": bool(secret),
        "pulledAt": idx.get("pulledAt") or "",
        "source": idx.get("source") or "LLC/docs",
        "docs": folder_url(cfg["docs"]) if cfg.get("docs") else "",
        "excel": file_url(cfg["excel"]) if cfg.get("excel") else "",
        "calculator": file_url(cfg["calculator"]) if cfg.get("calculator") else "",
        "october": folder_url(cfg["october"]) if cfg.get("october") else "",
        "octoberDD": folder_url(cfg["octoberDD"]) if cfg.get("octoberDD") else "",
        "octoberDX": folder_url(cfg["octoberDX"]) if cfg.get("octoberDX") else "",
        "octoberDS": folder_url(cfg["octoberDS"]) if cfg.get("octoberDS") else "",
        "octoberDDId": str(cfg.get("octoberDD") or ""),
        "octoberDXId": str(cfg.get("octoberDX") or ""),
        "octoberDSId": str(cfg.get("octoberDS") or ""),
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


def excel_fingerprint() -> str:
    """modifiedTime + checksum of the live SP_MGX_check so we skip unchanged downloads."""
    token = access_token()
    if not token:
        return ""
    fid = str(roots().get("excel") or "")
    if not fid:
        return ""
    meta = _api(
        token,
        f"files/{fid}",
        {
            "fields": "modifiedTime,md5Checksum,mimeType,size",
            "supportsAllDrives": "true",
        },
        timeout=12,
    )
    return "|".join(
        [
            str((meta or {}).get("modifiedTime") or ""),
            str((meta or {}).get("md5Checksum") or ""),
            str((meta or {}).get("size") or ""),
            str((meta or {}).get("mimeType") or ""),
        ]
    )


def download_excel() -> dict:
    """Live SP_MGX_check.xlsx onto origin + buffer."""
    import excel_io

    if not connected():
        raise DriveSyncError("Drive is not connected on this server")
    token = access_token()
    if not token:
        raise DriveSyncError("Drive token missing")
    excel_id = str(roots().get("excel") or "")
    if not excel_id:
        return {"ok": True, "downloaded": []}
    blob = download_file(token, excel_id)
    if not blob:
        raise DriveSyncError("Drive Excel download was empty")
    _write_bytes(mirror_io.ORIGIN_XLSX, blob)
    _write_bytes(excel_io.XLSX_PATH, blob)
    return {"ok": True, "downloaded": ["SP_MGX_check.xlsx"], "bytes": len(blob)}


def download_excel_if_changed(*, force: bool = False) -> dict:
    """Skip the xlsx download when Drive says the file has not changed."""
    global _EXCEL_FINGERPRINT
    fp = ""
    try:
        fp = excel_fingerprint()
    except DriveSyncError as e:
        print(f"[drive] excel fingerprint: {e}", flush=True)
        fp = ""
    if not force and fp and fp == _EXCEL_FINGERPRINT:
        return {"ok": True, "changed": False, "downloaded": []}
    if not force and not fp and _EXCEL_FINGERPRINT:
        return {"ok": True, "changed": False, "downloaded": [], "unchecked": True}
    out = download_excel()
    _EXCEL_FINGERPRINT = fp or excel_fingerprint() or _EXCEL_FINGERPRINT or "ok"
    out["changed"] = True
    out["fingerprint"] = _EXCEL_FINGERPRINT
    return out


def download_workbooks() -> dict:
    """Excel + calculator only. Deploy restore uses this after git reset."""
    out = download_excel()
    downloaded = list(out.get("downloaded") or [])
    token = access_token()
    calc_id = str(roots().get("calculator") or "")
    if calc_id and token:
        blob = download_file(token, calc_id)
        _write_bytes(finance_io.CALC_PATH, blob)
        downloaded.append("SUPERPLAY_MGX_Calculator.xlsx")
    return {"ok": True, "downloaded": downloaded}


def pull(db: dict | None = None, hydrate: bool = True) -> dict:
    """Download working files into the portal. Excel writes go the other way via push_workbooks."""
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

    applied = False
    briefs = 0
    if db is not None:
        if excel_id and mirror_io.ORIGIN_XLSX.exists():
            mirror_io.restore_buffer_xlsx()
        if hydrate:
            mirror_io.sync_from_files(db)
        applied = True

    mapped, packs = scan_october_packs(token, missing_brief_keys(db) if db is not None else None)
    if db is not None:
        briefs = apply_brief_packs(db, packs)
        apply_meta(
            db,
            {
                "drivePulledAt": utc_now(),
                "mirrorSource": "SP_MGX_check.xlsx · Google Drive · read only",
            },
        )

    idx = {
        "pulledAt": utc_now(),
        "source": "LLC/docs + live Excel / October · read only",
        "root": folder_url(cfg["docs"]) if cfg.get("docs") else "",
        "files": index_rows,
        "projects": mapped,
        "downloaded": downloaded,
    }
    save_json(INDEX_PATH, idx)
    if db is not None:
        apply_meta(db, {"drivePulledAt": idx["pulledAt"]})

    return {
        "ok": True,
        "connected": True,
        "pulledAt": idx["pulledAt"],
        "downloaded": downloaded,
        "projects": len(mapped),
        "files": len(index_rows),
        "briefs": briefs,
        "applied": applied,
    }
