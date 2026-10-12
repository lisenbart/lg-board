#!/usr/bin/env python3
"""One-time Google Drive read-only login for the VPS."""
from __future__ import annotations

import http.server
import json
import threading
import urllib.parse
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(ROOT))
import drive_sync

PORT = 8099


def main() -> None:
    if not drive_sync.has_client():
        print(
            "Put the Google OAuth client JSON at:\n"
            f"  {drive_sync.CLIENT_PATH}\n\n"
            "Google Cloud → APIs & Services → Enable Drive API → Credentials →\n"
            "Create OAuth client (Desktop or Web).\n"
            "Redirect URI: http://127.0.0.1:8099/callback"
        )
        raise SystemExit(1)
    redirect = f"http://127.0.0.1:{PORT}/callback"
    url = drive_sync.begin_oauth(redirect)
    print("Open this URL, sign in as dmytro@lisenbart.games:\n")
    print(url)
    print()
    got = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args) -> None:
            return

        def do_GET(self) -> None:
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            got["code"] = (qs.get("code") or [""])[0]
            got["state"] = (qs.get("state") or [""])[0]
            got["error"] = (qs.get("error") or [""])[0]
            body = b"Drive connected. You can close this tab."
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    httpd = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=httpd.handle_request, daemon=True).start()
    try:
        webbrowser.open(url)
    except Exception:
        pass
    print(f"Waiting on http://127.0.0.1:{PORT}/callback …")
    for _ in range(180):
        if got:
            break
        threading.Event().wait(1)
    httpd.server_close()
    if got.get("error"):
        raise SystemExit(got["error"])
    if not got.get("code"):
        raise SystemExit("No OAuth code — open the URL and allow Drive read access.")
    drive_sync.finish_oauth(got["code"], got["state"])
    print("Saved", drive_sync.OAUTH_PATH)
    print(json.dumps(drive_sync.pull(hydrate=False), indent=2))


if __name__ == "__main__":
    main()
