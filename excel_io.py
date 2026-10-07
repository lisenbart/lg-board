"""Read/write SP_MGX_check.xlsx as a mirror of the portal month grid."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent
XLSX_PATH = ROOT / "data" / "SP_MGX_check.xlsx"

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


def parse_workbook(path: Path, ym: str) -> dict:
    wb = load_workbook(path, data_only=True)
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
        shifts = ws.cell(r, 3).value
        hours = ws.cell(r, 4).value
        deadline = ws.cell(r, 5).value
        assignee = ""
        for i, _ in enumerate(people):
            val = ws.cell(r, 6 + i).value
            if val not in (None, ""):
                assignee = people[i]
                try:
                    hours = float(str(val).replace(",", "."))
                except (TypeError, ValueError):
                    pass
                break
        try:
            shifts_n = float(str(shifts).replace(",", ".")) if shifts not in (None, "") else 0
        except (TypeError, ValueError):
            shifts_n = 0
        try:
            hours_n = float(str(hours).replace(",", ".")) if hours not in (None, "") else round(shifts_n * 9, 1)
        except (TypeError, ValueError):
            hours_n = round(shifts_n * 9, 1)
        if isinstance(deadline, datetime):
            deadline_s = deadline.strftime("%Y-%m-%d")
        else:
            deadline_s = str(deadline or "").strip()
        rows.append(
            {
                "name": name,
                "line": line if name.upper()[:2] not in {"DD", "DX", "DS"} else name.split("-", 1)[0].upper(),
                "shifts": shifts_n,
                "hours": hours_n,
                "deadline": deadline_s,
                "assigneeName": assignee,
            }
        )
        if rows[-1]["line"] not in {"DD", "DX", "DS"}:
            rows[-1]["line"] = line
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


def write_month(db: dict, ym: str, path: Path | None = None) -> Path:
    path = Path(path or XLSX_PATH)
    if not path.exists():
        raise FileNotFoundError(f"Excel workbook missing: {path}")
    wb = load_workbook(path)
    ws = find_sheet(wb, ym)
    if ws is None:
        ws = wb.create_sheet(sheet_name_for(ym), 0)
    people = designers(db)
    y = ym.split("-")[0]
    tasks = [t for t in db.get("tasks") or [] if (t.get("month") or ym) == ym]
    grouped = {line: [t for t in tasks if t.get("line") == line] for line in ("DX", "DD", "DS")}
    for line in grouped:
        grouped[line].sort(key=lambda t: str(t.get("name") or ""))

    max_col = 5 + max(len(people), 1)
    if ws.max_row:
        ws.delete_rows(1, ws.max_row)

    ws.cell(1, 2, f"{y} PROJECT NAME")
    for i, p in enumerate(people):
        cell = ws.cell(1, 6 + i, p.get("name") or f"EMPL {i + 1}")
        cell.font = CALIBRI_BOLD
        cell.alignment = CENTER
    _style_range(ws, 1, max_col)

    def write_section_header(row: int, line: str) -> int:
        labels = [line, "MGX", "SHIFTS", "HOURS", "DEADLINE"] + [f"EMPL {i + 1}" for i in range(len(people))]
        for c, label in enumerate(labels, 1):
            cell = ws.cell(row, c, label)
            cell.fill = HEADER_FILL
            cell.font = CALIBRI_BOLD
            cell.border = THIN
            cell.alignment = CENTER
        return row + 1

    r = write_section_header(2, "DX")
    totals = {p["id"]: 0.0 for p in people}
    shift_total = 0.0
    hour_total = 0.0

    def write_task_rows(row: int, line: str) -> int:
        nonlocal shift_total, hour_total
        fill_a = LINE_FILL.get(line, DX_FILL)
        for t in grouped.get(line) or []:
            ws.cell(row, 1).fill = fill_a
            ws.cell(row, 2, t.get("name") or "")
            ws.cell(row, 3, t.get("shifts") if t.get("shifts") not in (None, "") else None)
            ws.cell(row, 4, t.get("hours") if t.get("hours") not in (None, "") else None)
            deadline = t.get("deadline") or ""
            ws.cell(row, 5, deadline)
            who = t.get("assigneeId") or ""
            for i, p in enumerate(people):
                cell = ws.cell(row, 6 + i)
                if p["id"] == who and t.get("hours") not in (None, ""):
                    cell.value = t.get("hours")
                    cell.fill = _hex_fill(p.get("color") or "92D050")
                    totals[p["id"]] = totals.get(p["id"], 0) + float(t.get("hours") or 0)
            shift_total += float(t.get("shifts") or 0)
            hour_total += float(t.get("hours") or 0)
            _style_range(ws, row, max_col)
            ws.cell(row, 2).alignment = Alignment(vertical="center")
            row += 1
        return row

    r = write_task_rows(r, "DX")
    r += 3
    r = write_section_header(r, "DD")
    r = write_task_rows(r, "DD")
    if grouped.get("DS"):
        r += 2
        r = write_section_header(r, "DS")
        r = write_task_rows(r, "DS")
    r += 2
    ws.cell(r, 1, "total")
    ws.cell(r, 3, round(shift_total, 1))
    ws.cell(r, 4, round(hour_total, 1))
    for i, p in enumerate(people):
        ws.cell(r, 6 + i, round(totals.get(p["id"], 0), 1))
    _style_range(ws, r, max_col)
    for c in range(1, max_col + 1):
        ws.cell(r, c).fill = HEADER_FILL
        ws.cell(r, c).font = CALIBRI_BOLD

    ws.column_dimensions["A"].width = 11
    ws.column_dimensions["B"].width = 63
    for col in range(3, max_col + 1):
        ws.column_dimensions[get_column_letter(col)].width = 13
    wb.save(path)
    return path
