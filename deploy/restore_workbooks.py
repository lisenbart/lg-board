#!/usr/bin/env python3
"""After git reset, put the live Excel/calculator back from Drive if local copies were clobbered."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import drive_sync  # noqa: E402


def main() -> int:
    if not drive_sync.connected():
        print("restore-workbooks: Drive not connected, keeping disk files", flush=True)
        return 0
    try:
        out = drive_sync.download_workbooks()
    except drive_sync.DriveSyncError as e:
        print(f"restore-workbooks: {e}", flush=True)
        return 0
    names = ", ".join(out.get("downloaded") or []) or "nothing"
    print(f"restore-workbooks: {names}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
