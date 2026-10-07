"""Read/write SP_MGX_check.xlsx as a calculator: hours stay = shifts × 9."""
from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent
XLSX_PATH = ROOT / "data" / "SP_MGX_check.xlsx"
NAME_ID = re.compile(r"^([A-Z]{2}-[A-Z0-9]+-\d+(?:-\d+)?)", re.I)

HEADER_FILL = PatternFill("solid", fgColor="D8D8D8")
DX_FILL = PatternFill("solid", fgColor="9DC3E6")
DD_FILL = PatternFill("solid", fgColor="BFBFBF")
DS_FILL = PatternFill("solid", fgColor="C6B19B")
THIN = Border(
    left=Side(style="hair", color="B4B4B4"),
    right=Side(style="hair", color="B4B4B4"),
    top=Side(style="hair", color="B4B4B4"),
    bottom=Side(style="hair", color="B4B4B4"),
)
CALIBRI = Font(name="Calibri", size=11)
CALIBRI_BOLD = Font(name="Calibri", size=11, bold=True)
CENTER = Alignment(horizontal="center", vertical="center")

LINE_FILL = {"DX": DX_FILL, "DD": DD_FILL, "DS": DS_FILL}


def _hex_fill(color: str) -> PatternFill:
    raw = (color or "92D050").replace("#", "")
    if len(raw) == 8:
        raw = raw[2:]
    return PatternFill("solid", fgColor=raw[:6] or "92D050")


def sheet_name_for(ym: str) -> str:
    y, m = [int(x) for x in ym.split("-")]
    return f"{datetime(y, m, 1).strftime('%B')} {str(y)[2:]}"


def find_sheet(wb, ym: str):
    want = sheet_name_for(ym).strip().lower()
    for name in wb.sheetnames:
        if name.strip().lower() == want:
            return wb[name]
    return None


def designers(db: dict) -> list[dict]:
    return [p for p in db.get("people") or [] if p.get("role") == "designer"]


def ensure_people(db: dict, names: list[str]) -> None:
    people = db.setdefault("people", [])
    current = designers(db)
    palette = ["#59BBFF", "#92D050", "#FFD966", "#C6B19B", "#B4A7D6", "#76D7C4", "#E67C73"]
    for i, name in enumerate(names):
        name = str(name or "").strip()
        if not name:
            continue
        if i < len(current):
            current[i]["name"] = name
            continue
        n = i + 1
        pid = "designer" if n == 1 else f"designer{n}"
        existing_ids = {p["id"] for p in people}
        while pid in existing_ids:
            n += 1
            pid = f"designer{n}"
        people.append(
            {
                "id": pid,
                "name": name,
                "role": "designer",
                "color": palette[i % len(palette)],
            }
        )


def _as_shift(value) -> float:
    if value in (None, ""):
        return 0.0
    if isinstance(value, str) and value.strip().startswith("="):
        return 0.0
    try:
        return float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return 0.0


def _hours_value(value, shifts: float) -> float:
    if isinstance(value, str) and value.strip().startswith("="):
        return round(shifts * 9, 1)
    try:
        if value not in (None, ""):
            return float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        pass
    return round(shifts * 9, 1) if shifts else 0.0


def _norm_name(name: str) -> str:
    return " ".join(str(name or "").strip().split()).lower()


def _id_key(name: str) -> str:
    m = NAME_ID.match(str(name or "").strip())
    return m.group(1).upper() if m else ""


def parse_workbook(path: Path, ym: str) -> dict:
    wb = load_workbook(path, data_only=False)
    ws = find_sheet(wb, ym)
    if ws is None:
        return {"people": [], "rows": [], "sheet": None}
    people = []
    for col in range(6, 20):
        name = ws.cell(1, col).value
        if name is None or str(name).strip() == "":
            if people:
                break
            continue
        people.append(str(name).strip())
    rows = []
    line = "DX"
    for r in range(2, ws.max_row + 1):
        a = ws.cell(r, 1).value
        b = ws.cell(r, 2).value
        if a and str(a).strip().upper() in {"DX", "DD", "DS"}:
            line = str(a).strip().upper()
            continue
        if a and str(a).strip().lower() == "total":
            break
        name = str(b or "").strip()
        if not name:
            continue
        shifts_n = _as_shift(ws.cell(r, 3).value)
        hours_n = _hours_value(ws.cell(r, 4).value, shifts_n)
        deadline = ws.cell(r, 5).value
        assignee = ""
        for i, _ in enumerate(people):
            val = ws.cell(r, 6 + i).value
            if val not in (None, ""):
                assignee = people[i]
                hours_n = _hours_value(val, shifts_n)
                break
        if isinstance(deadline, datetime):
            deadline_s = deadline.strftime("%Y-%m-%d")
        else:
            deadline_s = str(deadline or "").strip()
        prefix = name.split("-", 1)[0].upper()
        rows.append(
            {
                "name": name,
                "line": prefix if prefix in {"DD", "DX", "DS"} else line,
                "shifts": shifts_n,
                "hours": hours_n,
                "deadline": deadline_s,
                "assigneeName": assignee,
            }
        )
    return {"people": people, "rows": rows, "sheet": ws.title}


def apply_to_db(db: dict, parsed: dict, ym: str) -> dict:
    ensure_people(db, parsed.get("people") or [])
    people = designers(db)
    by_name = {p["name"].strip().lower(): p for p in people}
    existing = {str(t.get("name") or "").strip(): t for t in db.get("tasks") or []}
    added = 0
    updated = 0
    for row in parsed.get("rows") or []:
        name = row["name"]
        assignee_id = ""
        if row.get("assigneeName"):
            person = by_name.get(row["assigneeName"].strip().lower())
            if person:
                assignee_id = person["id"]
        task = existing.get(name)
        if task:
            task["shifts"] = row["shifts"]
            task["hours"] = row["hours"]
            task["line"] = row["line"]
            task["deadline"] = row.get("deadline") or task.get("deadline") or ""
            task["assigneeId"] = assignee_id
            task["month"] = ym
            updated += 1
        else:
            task = {
                "id": f"t-xl-{len(db.get('tasks') or [])}",
                "name": name,
                "line": row["line"],
                "department": "MGX",
                "game": "",
                "shifts": row["shifts"],
                "hours": row["hours"],
                "deadline": row.get("deadline") or "",
                "month": ym,
                "studioStatus": "new",
                "mondayStatus": "Ready to Start",
                "assigneeId": assignee_id,
                "brief": "",
                "folderUrl": "",
                "docUrl": "",
                "resultUrl": "",
                "source": "excel",
                "activity": [{"at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), "text": "Pulled from SP_MGX_check.xlsx"}],
            }
            db.setdefault("tasks", []).append(task)
            existing[name] = task
            added += 1
    return {"added": added, "updated": updated, "people": parsed.get("people") or []}


def _style_range(ws, row: int, cols: int) -> None:
    for c in range(1, cols + 1):
        cell = ws.cell(row, c)
        cell.font = CALIBRI
        cell.border = THIN
        cell.alignment = CENTER if c != 2 else Alignment(vertical="center")


def _write_task_row(ws, row: int, task: dict, people: list[dict]) -> None:
    shifts = task.get("shifts")
    ws.cell(row, 2, task.get("name") or "")
    ws.cell(row, 3, shifts if shifts not in (None, "") else None)
    ws.cell(row, 4, f"=C{row}*9")
    deadline = task.get("deadline") or ""
    if isinstance(deadline, datetime):
        ws.cell(row, 5, deadline)
        ws.cell(row, 5).number_format = "DD.MM"
    elif deadline:
        try:
            ws.cell(row, 5, datetime.strptime(str(deadline)[:10], "%Y-%m-%d"))
            ws.cell(row, 5).number_format = "DD.MM"
        except ValueError:
            ws.cell(row, 5, deadline)
    who = task.get("assigneeId") or ""
    for i, person in enumerate(people):
        cell = ws.cell(row, 6 + i)
        if person["id"] == who:
            cell.value = f"=C{row}*9"
            cell.fill = _hex_fill(person.get("color") or "92D050")
        else:
            cell.value = None
            cell.fill = PatternFill(fill_type=None)
    _style_range(ws, row, 5 + max(len(people), 1))
    ws.cell(row, 2).alignment = Alignment(vertical="center")
    ws.cell(row, 4).alignment = CENTER


def _scan_sheet(ws) -> dict:
    headers = {}
    rows = {}
    total_row = None
    line = "DX"
    last_used = 1
    for r in range(2, (ws.max_row or 1) + 1):
        a = ws.cell(r, 1).value
        b = ws.cell(r, 2).value
        if a and str(a).strip().lower() == "total":
            total_row = r
            last_used = r
            break
        if a and str(a).strip().upper() in {"DX", "DD", "DS"}:
            line = str(a).strip().upper()
            headers[line] = r
            last_used = r
            continue
        if b:
            rows[_norm_name(b)] = {"row": r, "line": line, "name": str(b).strip()}
            last_used = r
    return {"headers": headers, "rows": rows, "total_row": total_row, "last_used": last_used}


def _insert_in_section(ws, scan: dict, line: str) -> int:
    headers = scan["headers"]
    total_row = scan["total_row"]
    start = headers.get(line)
    later = [r for key, r in headers.items() if start and r > start]
    if later:
        bound = min(later)
    elif total_row:
        bound = total_row
    else:
        bound = (scan["last_used"] or 1) + 1
    last_data = start or 1
    for r in range((start or 1) + 1, bound):
        if ws.cell(r, 2).value:
            last_data = r
    insert_at = last_data + 1
    ws.insert_rows(insert_at)
    if total_row and total_row >= insert_at:
        scan["total_row"] = total_row + 1
    for key, r in list(headers.items()):
        if r >= insert_at:
            headers[key] = r + 1
    for item in scan["rows"].values():
        if item["row"] >= insert_at:
            item["row"] += 1
    scan["last_used"] = max(scan.get("last_used") or 1, insert_at)
    return insert_at


def _refresh_total(ws, scan: dict, people: list[dict]) -> None:
    total_row = scan.get("total_row")
    if not total_row:
        return
    end = total_row - 1
    ws.cell(total_row, 1, "total")
    ws.cell(total_row, 3, f"=SUM(C3:C{end})")
    ws.cell(total_row, 4, f"=SUM(D3:D{end})")
    for i, _ in enumerate(people):
        col = get_column_letter(6 + i)
        ws.cell(total_row, 6 + i, f"=SUM({col}3:{col}{end})")
    max_col = 5 + max(len(people), 1)
    _style_range(ws, total_row, max_col)
    for c in range(1, max_col + 1):
        ws.cell(total_row, c).fill = HEADER_FILL
        ws.cell(total_row, c).font = CALIBRI_BOLD


def write_month(db: dict, ym: str, path: Path | None = None) -> Path:
    """Update the month tab in place. Keep formulas (=C*9) and other sheets."""
    path = Path(path or XLSX_PATH)
    if not path.exists():
        raise FileNotFoundError(f"Excel workbook missing: {path}")
    wb = load_workbook(path)
    ws = find_sheet(wb, ym)
    people = designers(db)
    y = ym.split("-")[0]
    if ws is None:
        ws = wb.create_sheet(sheet_name_for(ym), 0)
        ws.cell(1, 2, f"{y} PROJECT NAME")
        for i, person in enumerate(people):
            cell = ws.cell(1, 6 + i, person.get("name") or f"EMPL {i + 1}")
            cell.font = CALIBRI_BOLD
            cell.alignment = CENTER
        labels = ["DX", "MGX", "SHIFTS", "HOURS", "DEADLINE"] + [f"EMPL {i + 1}" for i in range(len(people))]
        for c, label in enumerate(labels, 1):
            cell = ws.cell(2, c, label)
            cell.fill = HEADER_FILL
            cell.font = CALIBRI_BOLD
            cell.border = THIN
            cell.alignment = CENTER
        dd_row = 6
        labels[0] = "DD"
        for c, label in enumerate(labels, 1):
            cell = ws.cell(dd_row, c, label)
            cell.fill = HEADER_FILL
            cell.font = CALIBRI_BOLD
            cell.border = THIN
            cell.alignment = CENTER
        ws.cell(10, 1, "total")
        ws.column_dimensions["A"].width = 11
        ws.column_dimensions["B"].width = 63
        for col in range(3, 6 + max(len(people), 1)):
            ws.column_dimensions[get_column_letter(col)].width = 13

    scan = _scan_sheet(ws)
    if "DX" not in scan["headers"]:
        scan["headers"]["DX"] = 2
    id_index = {
        _id_key(item["name"]): item for item in scan["rows"].values() if _id_key(item["name"])
    }
    tasks = [t for t in db.get("tasks") or [] if (t.get("month") or ym) == ym]
    for task in tasks:
        key = _norm_name(task.get("name"))
        found = scan["rows"].get(key)
        if not found:
            kid = _id_key(task.get("name") or "")
            found = id_index.get(kid) if kid else None
        if found:
            _write_task_row(ws, found["row"], task, people)
            continue
        line = (task.get("line") or "DD").upper()
        if line not in {"DX", "DD", "DS"}:
            line = "DD"
        if line not in scan["headers"]:
            line = "DD" if "DD" in scan["headers"] else next(iter(scan["headers"]), "DX")
        row = _insert_in_section(ws, scan, line)
        _write_task_row(ws, row, task, people)
        scan["rows"][key] = {"row": row, "line": line, "name": task.get("name")}
    _refresh_total(ws, scan, people)
    wb.save(path)
    return path
