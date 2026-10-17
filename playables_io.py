"""Read/write SP_PLBL_check.xlsx — billed hours, not shifts × 9."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

import direction_io
import excel_io

ROOT = Path(__file__).resolve().parent
XLSX_PATH = ROOT / "data" / "SP_PLBL_check.xlsx"
LG_ID = excel_io.LG_ID
CALIBRI = Font(name="Calibri", size=11)
CALIBRI_BOLD = Font(name="Calibri", size=11, bold=True)
CENTER = Alignment(horizontal="center", vertical="center")
THIN = Border(
    left=Side(style="hair", color="B4B4B4"),
    right=Side(style="hair", color="B4B4B4"),
    top=Side(style="hair", color="B4B4B4"),
    bottom=Side(style="hair", color="B4B4B4"),
)
HEADER_FILL = PatternFill("solid", fgColor="D8D8D8")
LINE_MARKS = {"DX", "DD", "DS"}
ROW_LABELS = {"playableads", "plads", "hours", "producer", "project name", "d.line"}


def crew(db: dict) -> list[dict]:
    people = [
        p
        for p in db.get("people") or []
        if p.get("role") in {"art_director", "programmer", "designer"}
        and direction_io.person_on(p, direction_io.PLAYABLES)
    ]
    return sorted(people, key=lambda p: (p.get("payOrder") or 99, p.get("name") or ""))


def billed_hours(task: dict) -> float:
    return excel_io.round_hours(task.get("hours"))


def producer_hours(task: dict) -> float:
    raw = excel_io.round_hours(task.get("producerHours"))
    if raw:
        return raw
    total = 0.0
    total += excel_io.round_hours(task.get("assigneeHours"))
    for row in excel_io.help_entries(task):
        total += row["hours"]
    total += excel_io.round_hours(task.get("programmerHours"))
    total += excel_io.round_hours(task.get("motionHours"))
    return round(total, 1)


def hours_for_person(task: dict, person_id: str) -> float:
    pid = str(person_id or "").strip()
    if not pid:
        return 0.0
    if pid == str(task.get("programmerId") or "").strip():
        return excel_io.round_hours(task.get("programmerHours"))
    if pid == str(task.get("motionId") or "").strip():
        return excel_io.round_hours(task.get("motionHours"))
    if pid == str(task.get("assigneeId") or "").strip():
        ah = excel_io.round_hours(task.get("assigneeHours"))
        if ah:
            return ah
    for row in excel_io.help_entries(task):
        if row["id"] == pid:
            return row["hours"]
    return 0.0


def _cell_text(value) -> str:
    if value in (None, ""):
        return ""
    return str(value).strip()


def _num(value) -> float:
    if value in (None, ""):
        return 0.0
    if isinstance(value, str) and value.strip().startswith("="):
        return 0.0
    try:
        return float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return 0.0


def _kind_from_label(label: str) -> str:
    raw = str(label or "").strip().lower().replace(" ", "")
    if "prgm" in raw or raw in {"dev", "dev1", "programmer"}:
        return "programmer"
    if "producer" in raw or raw in {"lp", "empl1"}:
        return "producer"
    if "2dart" in raw or "art" in raw or "3dart" in raw:
        return "art"
    if "motion" in raw:
        return "motion"
    return ""


def _header_columns(ws) -> list[dict]:
    cols = []
    for col in range(4, 24):
        name = _cell_text(ws.cell(1, col).value)
        label = _cell_text(ws.cell(2, col).value)
        pid = excel_io._person_id_from_cell(ws.cell(1, col))
        if not name and not label and not pid:
            if cols:
                break
            continue
        cols.append(
            {
                "col": col,
                "name": name,
                "label": label,
                "id": pid,
                "kind": _kind_from_label(label) or _kind_from_label(name),
            }
        )
    return cols


def parse_workbook(path: Path, ym: str) -> dict:
    empty = {"people": [], "rows": [], "sheet": None}
    try:
        wb = load_workbook(path, data_only=False)
    except Exception as e:
        print(f"[playables] parse {path}: {e}", flush=True)
        return empty
    try:
        ws = excel_io.find_sheet(wb, ym)
        if ws is None:
            return empty
        headers = _header_columns(ws)
        people = [h["name"] for h in headers if h["name"]]
        rows = []
        line = "DS"
        for r in range(2, (ws.max_row or 1) + 1):
            a = _cell_text(ws.cell(r, 1).value)
            b = _cell_text(ws.cell(r, 2).value)
            if a.lower() == "total":
                continue
            if a.upper() in LINE_MARKS and (not b or b.lower().replace(" ", "") in ROW_LABELS):
                line = a.upper()
                continue
            name = excel_io._project_name(a, b)
            if not name:
                continue
            hours = _num(ws.cell(r, 3).value)
            art = []
            programmer = None
            motion = None
            for h in headers:
                if h.get("kind") == "producer":
                    continue
                val = _num(ws.cell(r, h["col"]).value)
                if val <= 0:
                    continue
                share = {"id": h.get("id") or "", "name": h.get("name") or "", "hours": val, "kind": h.get("kind") or "art"}
                if share["kind"] == "programmer":
                    programmer = share
                elif share["kind"] == "motion":
                    motion = share
                else:
                    art.append(share)
            lead = art[0] if art else {}
            help_rows = art[1:] if len(art) > 1 else []
            prefix = name.split("-", 1)[0].upper()
            rows.append(
                {
                    "name": name,
                    "line": prefix if prefix in LINE_MARKS else line,
                    "hours": hours,
                    "assigneeName": lead.get("name") or "",
                    "assigneeId": lead.get("id") or "",
                    "assigneeHours": lead.get("hours") or 0.0,
                    "help": help_rows,
                    "programmerName": (programmer or {}).get("name") or "",
                    "programmerId": (programmer or {}).get("id") or "",
                    "programmerHours": (programmer or {}).get("hours") or 0.0,
                    "motionName": (motion or {}).get("name") or "",
                    "motionId": (motion or {}).get("id") or "",
                    "motionHours": (motion or {}).get("hours") or 0.0,
                    "producerHours": round(sum(s["hours"] for s in art) + ((programmer or {}).get("hours") or 0) + ((motion or {}).get("hours") or 0), 1),
                }
            )
        return {"people": people, "rows": rows, "sheet": ws.title}
    finally:
        try:
            wb.close()
        except Exception:
            pass


def _resolve_id(share: dict, people: list[dict], by_name: dict) -> str:
    ids = {p["id"] for p in people}
    pid = str(share.get("id") or "").strip()
    if pid in ids:
        return pid
    person = by_name.get(excel_io._norm_name(share.get("name") or ""))
    return person["id"] if person else ""


def apply_to_db(db: dict, parsed: dict, ym: str) -> dict:
    people = [p for p in db.get("people") or [] if p.get("role") in direction_io.PLAY_CREW]
    by_name = excel_io.people_by_name(people)
    existing = {
        str(t.get("name") or "").strip(): t
        for t in db.get("tasks") or []
        if (t.get("month") or ym) == ym and direction_io.is_playables(t)
    }
    added = 0
    updated = 0
    for row in parsed.get("rows") or []:
        name = row["name"]
        assignee_id = _resolve_id(
            {"id": row.get("assigneeId"), "name": row.get("assigneeName")},
            people,
            by_name,
        )
        help_rows = []
        for share in row.get("help") or []:
            pid = _resolve_id(share, people, by_name)
            hours = excel_io.round_hours(share.get("hours"))
            if pid and hours and pid != assignee_id:
                help_rows.append({"id": pid, "hours": hours})
        programmer_id = _resolve_id(
            {"id": row.get("programmerId"), "name": row.get("programmerName")},
            people,
            by_name,
        )
        motion_id = _resolve_id(
            {"id": row.get("motionId"), "name": row.get("motionName")},
            people,
            by_name,
        )
        task = existing.get(name)
        if task:
            task["name"] = name
            task["hours"] = row["hours"]
            task["shifts"] = 0
            task["line"] = row["line"]
            task["department"] = "Playables"
            task["assigneeId"] = assignee_id or task.get("assigneeId") or ""
            task["assigneeHours"] = row.get("assigneeHours") or 0
            task["help"] = help_rows
            task["programmerId"] = programmer_id
            task["programmerHours"] = row.get("programmerHours") or 0
            task["motionId"] = motion_id
            task["motionHours"] = row.get("motionHours") or 0
            task["producerHours"] = row.get("producerHours") or 0
            task["month"] = ym
            updated += 1
        else:
            task = {
                "id": excel_io._next_task_id(db, "t-pl"),
                "name": name,
                "line": row["line"],
                "department": "Playables",
                "game": "",
                "shifts": 0,
                "hours": row["hours"],
                "assigneeHours": row.get("assigneeHours") or 0,
                "producerHours": row.get("producerHours") or 0,
                "programmerId": programmer_id,
                "programmerHours": row.get("programmerHours") or 0,
                "motionId": motion_id,
                "motionHours": row.get("motionHours") or 0,
                "deadline": "",
                "month": ym,
                "excelStatus": "",
                "studioStatus": "new",
                "mondayStatus": "Ready",
                "assigneeId": assignee_id,
                "help": help_rows,
                "brief": "",
                "folderUrl": "",
                "docUrl": "",
                "resultUrl": "",
                "source": "excel",
                "activity": [
                    {
                        "at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "text": "Pulled from SP_PLBL_check.xlsx",
                    }
                ],
            }
            db.setdefault("tasks", []).append(task)
            existing[name] = task
            added += 1
    return {
        "added": added,
        "updated": updated,
        "matched": added + updated,
        "parsed": len(parsed.get("rows") or []),
        "people": parsed.get("people") or [],
        "sheet": parsed.get("sheet"),
    }


def _stamp(cell, person: dict) -> None:
    cell.value = person.get("name") or cell.value
    cell.font = CALIBRI_BOLD
    cell.alignment = CENTER
    cell.comment = Comment(f"lg-id:{person['id']}", "LG")


def _role_label(person: dict, used: dict) -> str:
    role = person.get("role")
    if role == "programmer":
        n = used.get("dev", 0) + 1
        used["dev"] = n
        return f"PRGMM{n}"
    if role == "designer":
        return "MOTION"
    n = used.get("art", 0) + 1
    used["art"] = n
    return f"2DART {n}"


def write_month(db: dict, ym: str, path: Path | None = None) -> Path | None:
    path = Path(path or XLSX_PATH)
    if not path.exists():
        return None
    people = crew(db)
    tasks = direction_io.month_tasks(db, ym, direction_io.PLAYABLES)
    wb = load_workbook(path)
    try:
        ws = excel_io.find_sheet(wb, ym)
        y = ym.split("-")[0]
        if ws is None:
            ws = wb.create_sheet(excel_io.sheet_name_for(ym), 0)
        ws.cell(1, 2, f"{y} PROJECT NAME")
        ws.cell(1, 2).font = CALIBRI_BOLD
        used: dict = {}
        for i, person in enumerate(people):
            col = 5 + i
            _stamp(ws.cell(1, col), person)
            lab = ws.cell(2, col, _role_label(person, used))
            lab.fill = HEADER_FILL
            lab.font = CALIBRI_BOLD
            lab.alignment = CENTER
            lab.border = THIN
        if people:
            prod = ws.cell(1, 4, next((p.get("name") for p in db.get("people") or [] if p.get("role") == "manager"), "Anastasia"))
            prod.font = CALIBRI_BOLD
            prod.alignment = CENTER
            lab = ws.cell(2, 4, "Producer")
            lab.fill = HEADER_FILL
            lab.font = CALIBRI_BOLD
            lab.alignment = CENTER
        ws.cell(2, 1, "DX")
        ws.cell(2, 2, "PlayableADs")
        ws.cell(2, 3, "HOURS")
        for c in range(1, 5 + max(len(people), 1)):
            cell = ws.cell(2, c)
            cell.fill = HEADER_FILL
            cell.font = CALIBRI_BOLD
            cell.border = THIN
            cell.alignment = CENTER

        # Keep existing layout: rewrite matching rows, append unknown names under their line.
        by_name = {}
        line = "DX"
        last = 2
        total_row = None
        for r in range(2, (ws.max_row or 1) + 1):
            a = _cell_text(ws.cell(r, 1).value)
            b = _cell_text(ws.cell(r, 2).value)
            if a.lower() == "total":
                total_row = r
                last = max(last, r)
                continue
            if a.upper() in LINE_MARKS:
                line = a.upper()
                last = r
                continue
            name = excel_io._project_name(a, b)
            if name:
                by_name[excel_io._norm_name(name)] = r
                last = r
        for task in tasks:
            row = by_name.get(excel_io._norm_name(task.get("name") or ""))
            if not row:
                continue
            _write_task_row(ws, row, task, people)
        excel_io._atomic_save(wb, path)
        return path
    finally:
        try:
            wb.close()
        except Exception:
            pass


def _write_task_row(ws, row: int, task: dict, people: list[dict]) -> None:
    hours = billed_hours(task)
    ws.cell(row, 2, task.get("name") or "")
    ws.cell(row, 3, hours if hours else None)
    last = 5 + max(len(people) - 1, 0)
    if people:
        end = get_column_letter(4 + len(people))
        ws.cell(row, 4, f"=SUM(E{row}:{end}{row})")
    for i, person in enumerate(people):
        col = 5 + i
        last = max(last, col)
        cell = ws.cell(row, col)
        share = hours_for_person(task, person["id"])
        cell.value = share if share else None
        if share:
            cell.fill = excel_io._hex_fill(person.get("color") or "92D050")
        else:
            cell.fill = PatternFill(fill_type=None)
        cell.alignment = CENTER
        cell.border = THIN
        cell.font = CALIBRI
    for c in range(1, last + 1):
        ws.cell(row, c).border = THIN
        ws.cell(row, c).font = CALIBRI
    ws.cell(row, 2).alignment = Alignment(vertical="center")
    ws.cell(row, 3).alignment = CENTER
