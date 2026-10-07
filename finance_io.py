"""SUPERPLAY MGX calculator + Superplay invoice (Word), from the studio files."""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.shared import Cm, Pt, RGBColor
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent
CALC_PATH = ROOT / "data" / "finance" / "SUPERPLAY_MGX_Calculator.xlsx"
NBU_URL = "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json"
TAX_PCT = 0.05
CLIENT_RATE = 35.0
FALLBACK_NBU = 41.2
_NBU_CACHE: dict = {"at": 0.0, "data": None}

ONES = [
    "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen",
]
TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]


def _join(*parts: str) -> str:
    return " ".join(p for p in parts if p)


def _under_1000(n: int) -> str:
    if n < 20:
        return ONES[n]
    if n < 100:
        return _join(TENS[n // 10], ONES[n % 10]).replace(" ", "-") if n % 10 else TENS[n // 10]
    rest = n % 100
    return _join(ONES[n // 100], "hundred", _under_1000(rest) if rest else "")


def usd_in_words(amount: float) -> str:
    dollars = int(round(float(amount) + 1e-9))
    cents = int(round((float(amount) - int(float(amount))) * 100 + 1e-9)) % 100
    if dollars == 0:
        body = "Zero"
    else:
        chunks = []
        scales = [(1_000_000, "million"), (1_000, "thousand"), (1, "")]
        n = dollars
        for size, name in scales:
            q, n = divmod(n, size)
            if not q:
                continue
            chunks.append(_join(_under_1000(q), name))
        body = " ".join(chunks).strip()
        body = body[0].upper() + body[1:] if body else "Zero"
    return f"{body} United States dollars {cents:02d} cents"


def fetch_nbu(force: bool = False) -> dict:
    now = time.time()
    cached = _NBU_CACHE.get("data")
    if cached and not force:
        ttl = 3600 if cached.get("source") == "NBU" else 60
        if now - float(_NBU_CACHE.get("at") or 0) < ttl:
            return dict(cached)
    try:
        req = Request(NBU_URL, headers={"User-Agent": "LG-Board/1.0"})
        with urlopen(req, timeout=2) as res:
            import json

            rows = json.loads(res.read().decode("utf-8"))
        row = rows[0] if rows else {}
        rate = float(row.get("rate") or 0)
        if rate <= 0:
            raise ValueError("empty rate")
        data = {
            "rate": round(rate, 4),
            "date": row.get("exchangedate") or "",
            "source": "NBU",
        }
    except (URLError, TimeoutError, ValueError, OSError, IndexError):
        data = {
            "rate": FALLBACK_NBU,
            "date": "",
            "source": "fallback",
        }
    _NBU_CACHE["at"] = now
    _NBU_CACHE["data"] = data
    return dict(data)


def hours_of(task: dict, shift_hours: float = 9) -> float:
    try:
        h = float(task.get("hours") or 0)
    except (TypeError, ValueError):
        h = 0
    if h:
        return h
    try:
        return round(float(task.get("shifts") or 0) * shift_hours, 1)
    except (TypeError, ValueError):
        return 0.0


def person_rate(person: dict | None, default: float) -> float:
    if not person:
        return default
    raw = person.get("rateUsd")
    if raw is None or raw == "":
        return default
    try:
        n = float(raw)
    except (TypeError, ValueError):
        return default
    return n if n >= 0 else default


def _nbu_from(db: dict, nbu: dict | None = None) -> dict:
    if nbu and nbu.get("rate"):
        return nbu
    meta = db.get("meta") or {}
    if meta.get("nbuRate"):
        try:
            rate = float(meta.get("nbuRate"))
            if rate > 0:
                return {"rate": round(rate, 4), "date": "", "source": "manual"}
        except (TypeError, ValueError):
            pass
    return fetch_nbu()


def hours_people(db: dict) -> list[dict]:
    people = db.get("people") or []
    return [p for p in people if p.get("role") == "teamlead"] + [
        p for p in people if p.get("role") == "designer"
    ]


def pay_people(db: dict) -> list[dict]:
    return [
        p
        for p in db.get("people") or []
        if p.get("role") in {"manager", "teamlead", "designer"}
    ]


def _pay_row(person: dict, default_pay: float) -> dict:
    return {
        "id": person.get("id"),
        "name": person.get("name") or person.get("id"),
        "legalName": person.get("legalName") or "",
        "jobTitle": person.get("jobTitle") or "",
        "bank": person.get("bank") or "",
        "bankCard": person.get("bankCard") or "",
        "iban": person.get("iban") or "",
        "phone": person.get("phone") or "",
        "payOrder": person.get("payOrder") or 99,
        "rate": person_rate(person, default_pay),
        "projects": 0,
        "shifts": 0.0,
        "hours": 0.0,
        "payUsd": 0.0,
    }


def snapshot(db: dict, month: str, nbu: dict | None = None) -> dict:
    meta = db.get("meta") or {}
    client_rate = float(meta.get("clientRateUsd") or CLIENT_RATE)
    default_pay = float(meta.get("designerRateUsd") or 15)
    tax = float(meta.get("taxPct") if meta.get("taxPct") is not None else TAX_PCT)
    shift_hours = float(meta.get("shiftHours") or 9)
    nbu = _nbu_from(db, nbu)
    fx = float(nbu.get("rate") or FALLBACK_NBU)
    tasks = [t for t in db.get("tasks") or [] if (t.get("month") or meta.get("month")) == month]
    people = {p["id"]: p for p in db.get("people") or []}
    lines = {k: {"line": k, "projects": 0, "shifts": 0.0, "hours": 0.0, "bill": 0.0} for k in ("DD", "DX", "DS")}
    pay = {p["id"]: _pay_row(p, default_pay) for p in pay_people(db)}
    unassigned = {"projects": 0, "shifts": 0.0, "hours": 0.0}
    for t in tasks:
        line = t.get("line") if t.get("line") in lines else "DD"
        h = hours_of(t, shift_hours)
        sh = float(t.get("shifts") or 0)
        lines[line]["projects"] += 1
        lines[line]["shifts"] += sh
        lines[line]["hours"] += h
        lines[line]["bill"] += h * client_rate
        pid = t.get("assigneeId") or ""
        p = people.get(pid)
        if not p or p.get("id") not in pay:
            unassigned["projects"] += 1
            unassigned["shifts"] += sh
            unassigned["hours"] += h
            continue
        row = pay.setdefault(pid, _pay_row(p, default_pay))
        row["projects"] += 1
        row["shifts"] += sh
        row["hours"] += h
        row["payUsd"] += h * row["rate"]
    payroll = sorted(pay.values(), key=lambda r: (r.get("payOrder") or 99, r["name"]))
    for row in payroll:
        row["payUah"] = round(row["payUsd"] * fx, 2)
        row["payUsd"] = round(row["payUsd"], 2)
        row["hours"] = round(row["hours"], 1)
        row["shifts"] = round(row["shifts"], 2)
    by_line = []
    for key in ("DD", "DX", "DS"):
        row = lines[key]
        row["hours"] = round(row["hours"], 1)
        row["shifts"] = round(row["shifts"], 2)
        row["bill"] = round(row["bill"], 2)
        if key != "DS" or row["projects"]:
            by_line.append(row)
    hours = round(sum(r["hours"] for r in by_line), 1)
    shifts = round(sum(r["shifts"] for r in by_line), 2)
    client_in = round(hours * client_rate, 2)
    after_tax = round(client_in - client_in * tax, 2)
    empl = round(sum(r["payUsd"] for r in payroll), 2)
    studio = round(after_tax - empl, 2)
    return {
        "month": month,
        "clientRate": client_rate,
        "taxPct": tax,
        "nbu": nbu,
        "hours": hours,
        "shifts": shifts,
        "projects": len(tasks),
        "byLine": by_line,
        "payroll": payroll,
        "unassigned": {
            "projects": unassigned["projects"],
            "shifts": round(unassigned["shifts"], 2),
            "hours": round(unassigned["hours"], 1),
        },
        "clientIn": client_in,
        "afterTax": after_tax,
        "empl": empl,
        "studio": studio,
        "clientInUah": round(client_in * fx, 2),
        "afterTaxUah": round(after_tax * fx, 2),
        "emplUah": round(empl * fx, 2),
        "studioUah": round(studio * fx, 2),
    }


def _set_run_font(run, size=11, bold=False, name="Times New Roman"):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)


def _shade(cell, hex_color: str) -> None:
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), hex_color)
    shd.set(qn("w:val"), "clear")
    tcPr.append(shd)


def _set_cell(cell, text, *, bold=False, center=False, size=10):
    cell.text = ""
    p = cell.paragraphs[0]
    if center:
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(str(text))
    _set_run_font(run, size=size, bold=bold)


def build_invoice(line: str, hours: float, amount: float, when: datetime | None = None) -> bytes:
    line = (line or "DD").upper()
    when = when or datetime.now(timezone.utc)
    pay_by = when + timedelta(days=21)
    dmy = when.strftime("%d.%m.%Y")
    num = f"{line} {when.strftime('%d/%m')}"
    hours_s = f"{hours:.1f}".replace(".", ",")
    amt = int(round(amount)) if abs(amount - round(amount)) < 0.005 else round(amount, 2)
    amt_s = f"{amt} USD" if isinstance(amt, int) else f"{amt:.2f} USD"
    words = usd_in_words(amount if not isinstance(amt, int) else amt)
    desc = f"Marketing video and design for {line}"

    doc = Document()
    section = doc.sections[0]
    section.top_margin = Cm(1.6)
    section.bottom_margin = Cm(1.6)
    section.left_margin = Cm(1.8)
    section.right_margin = Cm(1.8)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run(f"Invoice / № {num}")
    _set_run_font(run, size=16, bold=True)

    head = doc.add_table(rows=8, cols=1)
    head.style = "Table Grid"
    blocks = [
        f"Date and Place: {dmy}, Kyiv",
        "Supplier Private Entrepreneur Dmytro Viacheslavovych Lisenbart ITN (Individual Taxpayer Number): 2750612938 SRN (State Registration Number): 20690000000046690 Address: vul.Pryrichna 9-А, kv.81, Kyiv 04213, Ukraine",
        "Customer: SuperPlay Ltd Israel",
        "Subject matter: Marketing animation video",
        "Currency: USD",
        f"Price (amount) of the goods/services : {amt_s}",
        "Terms of payments and acceptation: Postpayment of 100% upon the services delivery. The services being rendered at the location of the Customer.",
        "Customer Bank information: Beneficiary's bank: JSC UNIVERSAL BANK IBAN: UA723220010000026000300061506 SWIFT: UNJSUAUKXXX",
    ]
    for i, text in enumerate(blocks):
        _set_cell(head.cell(i, 0), text, center=True, size=10)

    doc.add_paragraph()
    grid = doc.add_table(rows=4, cols=5)
    grid.style = "Table Grid"
    headers = ["№", "Description", "Quantity", "Price, USD", "Amount, USD"]
    for i, h in enumerate(headers):
        _set_cell(grid.cell(0, i), h, bold=True, center=True, size=10)
        _shade(grid.cell(0, i), "D9D9D9")
    _set_cell(grid.cell(1, 0), "1", center=True)
    _set_cell(grid.cell(1, 1), desc, center=True)
    _set_cell(grid.cell(1, 2), f"{hours_s} h", center=True)
    _set_cell(grid.cell(1, 3), amt_s, center=True)
    _set_cell(grid.cell(1, 4), amt_s, center=True)
    _set_cell(grid.cell(2, 3), "Total", bold=True, center=True)
    _set_cell(grid.cell(2, 4), amt_s, bold=True, center=True)
    merged = grid.cell(3, 0).merge(grid.cell(3, 3))
    _set_cell(merged, f"Total to pay/ {words}", center=True, size=9)
    _set_cell(grid.cell(3, 4), amt_s, bold=True, center=True)

    notes = [
        "All charges of correspondent banks are at the Supplier’s expenses",
        f"This Invoice is an offer to enter into the agreement. Payment according hereto shall be deemed as an acceptation of the offer to enter into the agreement on the terms and conditions set out herein. Payment according hereto may be made not later than {pay_by.strftime('%d.%m.%Y')}",
        "Please note, that payment according hereto at the same time is the evidence of the work performance and the service delivery in full scope, acceptation thereof and the confirmation of final mutual installments between Parties",
        "Payment according hereto shall be also the confirmation that Parties have no claims to each other and have no intention to submit any claims. The agreement shall not include penalty and fine clauses",
        "The Parties shall not be liable for non-performance or improper performance of the obligations under the agreement during the term of insuperable force circumstances.",
        "Any disputes arising out of the agreement between the Parties shall be settled by the competent court at the location of a defendant.",
    ]
    for text in notes:
        p = doc.add_paragraph()
        run = p.add_run(text)
        _set_run_font(run, size=9)

    sign = doc.add_paragraph()
    run = sign.add_run("Supplier: _______________________ ( Lisenbart Dmytro )")
    _set_run_font(run, size=11)
    ver = doc.add_paragraph()
    ver.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = ver.add_run("v 1.0")
    _set_run_font(run, size=9)
    run.font.color.rgb = RGBColor(0x88, 0x88, 0x88)

    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


def invoice_filename(line: str, when: datetime | None = None) -> str:
    when = when or datetime.now(timezone.utc)
    return f"invoice{line}_{when.strftime('%Y.%m.%d')}.docx"


HEADER_FILL = PatternFill("solid", fgColor="D8D8D8")
THIN = Border(
    left=Side(style="hair", color="B4B4B4"),
    right=Side(style="hair", color="B4B4B4"),
    top=Side(style="hair", color="B4B4B4"),
    bottom=Side(style="hair", color="B4B4B4"),
)
CALIBRI = Font(name="Calibri", size=11)
CALIBRI_BOLD = Font(name="Calibri", size=11, bold=True)
CENTER = Alignment(horizontal="center", vertical="center")
LINE_FILL = {
    "DX": PatternFill("solid", fgColor="9DC3E6"),
    "DD": PatternFill("solid", fgColor="BFBFBF"),
    "DS": PatternFill("solid", fgColor="C6B19B"),
}


def sheet_name_for(ym: str) -> str:
    y, m = [int(x) for x in ym.split("-")]
    return f"{datetime(y, m, 1).strftime('%B')} {str(y)[2:]}"


def _style_row(ws, row: int, cols: int) -> None:
    for c in range(1, cols + 1):
        cell = ws.cell(row, c)
        cell.font = CALIBRI
        cell.border = THIN
        cell.alignment = CENTER if c != 2 else Alignment(vertical="center")


def write_month(db: dict, ym: str, nbu_rate: float | None = None, path: Path | None = None) -> Path:
    """Write this month into SUPERPLAY_MGX_Calculator.xlsx. Other months stay."""
    path = Path(path or CALC_PATH)
    if not path.exists():
        raise FileNotFoundError(f"Calculator missing: {path}")
    meta = db.get("meta") or {}
    client_rate = float(meta.get("clientRateUsd") or CLIENT_RATE)
    tax = float(meta.get("taxPct") if meta.get("taxPct") is not None else TAX_PCT)
    default_pay = float(meta.get("designerRateUsd") or 15)
    fx = float(nbu_rate or (meta.get("nbuRate") or FALLBACK_NBU))
    designers = hours_people(db)
    tasks = [t for t in db.get("tasks") or [] if (t.get("month") or ym) == ym]
    by_line = {k: [] for k in ("DX", "DD", "DS")}
    for t in tasks:
        line = t.get("line") if t.get("line") in by_line else "DD"
        by_line[line].append(t)
    for key in by_line:
        by_line[key].sort(key=lambda t: str(t.get("name") or ""))
    active_lines = [k for k in ("DX", "DD", "DS") if by_line[k] or k != "DS"]

    wb = load_workbook(path)
    name = sheet_name_for(ym)
    if name in wb.sheetnames:
        del wb[name]
    ws = wb.create_sheet(name, 0)
    n_empl = max(len(designers), 1)
    empl_start = 6
    total_empl_col = empl_start + n_empl
    client_col = total_empl_col + 1
    y, m = [int(x) for x in ym.split("-")]
    ws.cell(2, 2, datetime(y, m, 1).strftime("%Y %B").upper())
    ws.cell(2, 2).font = CALIBRI_BOLD
    for i, person in enumerate(designers):
        cell = ws.cell(2, empl_start + i, person.get("name") or f"EMPL {i + 1}")
        cell.font = CALIBRI_BOLD
        cell.alignment = CENTER

    def write_header(row: int, line: str) -> None:
        labels = [line, "MGX", "SHIFTS", "HOURS", "D.LINE"]
        labels += [f"EMPL {i + 1}" for i in range(n_empl)]
        labels += ["Total EMPL", "CLIENT IN"]
        for c, label in enumerate(labels, 1):
            cell = ws.cell(row, c, label)
            cell.fill = HEADER_FILL
            cell.font = CALIBRI_BOLD
            cell.border = THIN
            cell.alignment = CENTER
        ws.cell(row, 1).fill = LINE_FILL.get(line, HEADER_FILL)

    def write_task(row: int, task: dict) -> None:
        shifts = task.get("shifts")
        ws.cell(row, 2, task.get("name") or "")
        ws.cell(row, 3, shifts if shifts not in (None, "") else None)
        ws.cell(row, 4, f"=C{row}*9")
        who = task.get("assigneeId") or ""
        for i, person in enumerate(designers):
            cell = ws.cell(row, empl_start + i)
            if person["id"] == who:
                rate = person_rate(person, default_pay)
                cell.value = f"=D{row}*{rate:g}"
                raw = (person.get("color") or "92D050").replace("#", "")
                cell.fill = PatternFill("solid", fgColor=raw[:6] or "92D050")
        last_empl = get_column_letter(empl_start + n_empl - 1)
        first_empl = get_column_letter(empl_start)
        ws.cell(row, total_empl_col, f"=SUM({first_empl}{row}:{last_empl}{row})")
        ws.cell(row, client_col, f"=D{row}*{client_rate:g}")
        _style_row(ws, row, client_col)

    r = 5
    first_data = None
    for line in active_lines:
        write_header(r, line)
        r += 1
        if not by_line[line]:
            r += 1
            continue
        for task in by_line[line]:
            if first_data is None:
                first_data = r
            write_task(r, task)
            r += 1
        r += 1
    if first_data is None:
        first_data = 6
    last_data = max(r - 2, first_data)
    total_row = r
    ws.cell(total_row, 1, "total")
    ws.cell(total_row, 3, f"=SUM(C{first_data}:C{last_data})")
    ws.cell(total_row, 4, f"=SUM(D{first_data}:D{last_data})")
    for i in range(n_empl):
        col = get_column_letter(empl_start + i)
        ws.cell(total_row, empl_start + i, f"=SUM({col}{first_data}:{col}{last_data})")
    first_empl = get_column_letter(empl_start)
    last_empl = get_column_letter(empl_start + n_empl - 1)
    ws.cell(total_row, total_empl_col, f"=SUM({first_empl}{total_row}:{last_empl}{total_row})")
    ws.cell(total_row, client_col, f"=SUM({get_column_letter(client_col)}{first_data}:{get_column_letter(client_col)}{last_data})")
    _style_row(ws, total_row, client_col)
    for c in range(1, client_col + 1):
        ws.cell(total_row, c).fill = HEADER_FILL
        ws.cell(total_row, c).font = CALIBRI_BOLD

    uah_row = total_row + 1
    ws.cell(total_row, client_col + 2, "UAH").font = CALIBRI_BOLD
    ws.cell(total_row, client_col + 3, "USD").font = CALIBRI_BOLD
    for i in range(n_empl + 2):
        src = get_column_letter(empl_start + i)
        ws.cell(uah_row, empl_start + i, f"={src}{total_row}*{fx:g}")

    label_col = client_col + 1
    usd_col = client_col + 3
    uah_col = client_col + 2
    rows = [
        (uah_row, "CLIENT IN", f"={get_column_letter(client_col)}{total_row}"),
        (uah_row + 1, "STUDIO (TAX)", f"={get_column_letter(usd_col)}{uah_row}-{get_column_letter(usd_col)}{uah_row}*{tax:g}"),
        (uah_row + 2, "EMPL", f"={get_column_letter(total_empl_col)}{total_row}"),
        (uah_row + 3, "STUDIO", f"={get_column_letter(usd_col)}{uah_row + 1}-{get_column_letter(usd_col)}{uah_row + 2}"),
    ]
    for row, label, formula in rows:
        ws.cell(row, label_col, label).font = CALIBRI_BOLD
        ws.cell(row, usd_col, formula)
        ws.cell(row, uah_col, f"={get_column_letter(usd_col)}{row}*{fx:g}")

    ws.column_dimensions["A"].width = 11
    ws.column_dimensions["B"].width = 72
    for col in range(3, usd_col + 1):
        ws.column_dimensions[get_column_letter(col)].width = 14
    _write_employeers_sheet(wb, db)
    wb.save(path)
    return path


def _write_employeers_sheet(wb, db: dict) -> None:
    name = next((n for n in wb.sheetnames if n.strip().lower() == "employeers"), None)
    ws = wb[name] if name else wb.create_sheet("Employeers")
    for r in range(6, 31):
        for c in range(1, 9):
            ws.cell(r, c).value = None
    ws["E4"] = "LISENBART FILM CREW"
    headers = ["", "name", "phone", "email", "name of bank", "bank card", "IBAN", "ІПН"]
    fills = ["D9EAD3", "D9EAD3", "FCE4D6", "C9DAF8", "D9D9D9", "D9D9D9", "D9D9D9", "D9D9D9"]
    for i, (label, fill) in enumerate(zip(headers, fills), 1):
        cell = ws.cell(6, i, label or None)
        if label:
            cell.fill = PatternFill("solid", fgColor=fill)
            cell.font = CALIBRI_BOLD
    crew = sorted(pay_people(db), key=lambda p: p.get("payOrder") or 99)
    numbers = [1, 2, 3, 5, 6, 7]
    for i, person in enumerate(crew):
        r = 7 + i
        title = person.get("jobTitle") or ""
        legal = person.get("legalName") or person.get("name") or ""
        shown = f"{legal} - {title}" if title else legal
        ws.cell(r, 1, numbers[i] if i < len(numbers) else i + 1)
        ws.cell(r, 2, shown)
        ws.cell(r, 3, person.get("phone") or None)
        mail = person.get("email") or ""
        if mail.endswith("lisenbart.games"):
            mail = ""
        ws.cell(r, 4, mail or None)
        ws.cell(r, 5, person.get("bank") or None)
        ws.cell(r, 6, person.get("bankCard") or None)
        ws.cell(r, 7, person.get("iban") or None)
        ws.cell(r, 8, person.get("taxId") or None)


def write_employeers(db: dict, path: Path | None = None) -> Path:
    path = Path(path or CALC_PATH)
    wb = load_workbook(path)
    _write_employeers_sheet(wb, db)
    wb.save(path)
    return path
