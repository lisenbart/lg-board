"""SUPERPLAY MGX calculator + Superplay invoice (Word), from the studio files."""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent
CALC_PATH = ROOT / "data" / "finance" / "SUPERPLAY_MGX_Calculator.xlsx"
TEMPLATE_DIR = ROOT / "data" / "finance" / "templates"
INVOICES_DIR = ROOT / "data" / "invoices"
ICLOUD_MGX = (
    Path.home()
    / "Library/Mobile Documents/com~apple~CloudDocs/Lisenbart"
    / "ACCOUNTING/LISENBART GAMES/LLC/docs/_clients/SUPERPLAY/invoice/MGX"
)
W_T = re.compile(r"(<w:t(?:\s[^>]*)?>)(.*?)(</w:t>)", re.DOTALL)
W_P = re.compile(r"<w:p[ >].*?</w:p>", re.DOTALL)
SOFFICE_BINS = [
    "/usr/bin/soffice",
    "/usr/bin/libreoffice",
    "/usr/bin/lowriter",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
]
NBU_URL = "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json"
TAX_PCT = 0.05
CLIENT_RATE = 35.0
MANAGER_RATE = 5.0
DESIGNER_RATE = 15.0
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


def default_pay_rate(person: dict | None, meta: dict | None = None) -> float:
    meta = meta or {}
    if person and person.get("role") == "manager":
        raw = meta.get("managerRateUsd")
        fallback = MANAGER_RATE
    else:
        raw = meta.get("designerRateUsd")
        fallback = DESIGNER_RATE
    if raw is None or raw == "":
        return fallback
    try:
        n = float(raw)
    except (TypeError, ValueError):
        return fallback
    return n if n >= 0 else fallback


def person_rate(person: dict | None, default: float | None = None, meta: dict | None = None) -> float:
    fallback = default if default is not None else default_pay_rate(person, meta)
    if not person:
        return fallback
    raw = person.get("rateUsd")
    if raw is None or raw == "":
        return fallback
    try:
        n = float(raw)
    except (TypeError, ValueError):
        return fallback
    return n if n >= 0 else fallback


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


def _pay_row(person: dict, meta: dict | None = None) -> dict:
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
        "rate": person_rate(person, meta=meta),
        "projects": 0,
        "shifts": 0.0,
        "hours": 0.0,
        "payUsd": 0.0,
    }


def snapshot(db: dict, month: str, nbu: dict | None = None) -> dict:
    meta = db.get("meta") or {}
    client_rate = float(meta.get("clientRateUsd") or CLIENT_RATE)
    tax = float(meta.get("taxPct") if meta.get("taxPct") is not None else TAX_PCT)
    shift_hours = float(meta.get("shiftHours") or 9)
    nbu = _nbu_from(db, nbu)
    fx = float(nbu.get("rate") or FALLBACK_NBU)
    tasks = [t for t in db.get("tasks") or [] if (t.get("month") or meta.get("month")) == month]
    people = {p["id"]: p for p in db.get("people") or []}
    lines = {k: {"line": k, "projects": 0, "shifts": 0.0, "hours": 0.0, "bill": 0.0} for k in ("DD", "DX", "DS")}
    pay = {p["id"]: _pay_row(p, meta) for p in pay_people(db)}
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
        row = pay.setdefault(pid, _pay_row(p, meta))
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


INVOICE_NAME = re.compile(r"^invoice[A-Z]{2}_\d{4}\.\d{2}\.\d{2}\.(docx|pdf)$")


def now_kyiv() -> datetime:
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo("Europe/Kyiv"))
    except Exception:
        return datetime.now(timezone(timedelta(hours=3)))


def month_folder_name(ym: str) -> str:
    y, m = [int(x) for x in ym.split("-")]
    return f"{m:02d}_{datetime(y, m, 1).strftime('%B')}"


def invoice_filename(line: str, when: datetime | None = None, ext: str = "docx") -> str:
    when = when or now_kyiv()
    return f"invoice{line}_{when.strftime('%Y.%m.%d')}.{ext}"


def _plain_wt(xml: str) -> str:
    return "".join(m.group(2) for m in W_T.finditer(xml))


def _replace_in_xml(xml: str, old: str, new: str) -> str:
    if not old or old == new:
        return xml
    if old in xml:
        return xml.replace(old, new)

    def para(match: re.Match) -> str:
        block = match.group(0)
        runs = list(W_T.finditer(block))
        joined = "".join(r.group(2) for r in runs)
        if old not in joined:
            return block
        joined = joined.replace(old, new)
        seen = 0

        def put(tm: re.Match) -> str:
            nonlocal seen
            seen += 1
            if seen == 1:
                return tm.group(1) + joined + tm.group(3)
            return tm.group(1) + tm.group(3)

        return W_T.sub(put, block)

    return W_P.sub(para, xml)


def _detect_tokens(xml: str) -> dict:
    plain = _plain_wt(xml)
    tok: dict = {}
    m = re.search(r"Invoice\s*/\s*№\s*([A-Z]{2}\s+\d{2}/\d{2})", plain)
    if m:
        tok["number"] = m.group(1)
    m = re.search(r"Date and Place:\s*(\d{2}\.\d{2}\.\d{4})", plain)
    if m:
        tok["date"] = m.group(1)
    m = re.search(r"not later than\s*(\d{2}\.\d{2}\.\d{4})", plain)
    if m:
        tok["pay_by"] = m.group(1)
    m = re.search(r"(\d+[.,]\d+)\s*h", plain)
    if m:
        tok["hours"] = m.group(0)
    m = re.search(
        r"goods/services\s*:?\s*(\d+(?:[.,]\d+)?)\s*USD",
        plain,
        re.I,
    )
    if m:
        tok["amount"] = f"{m.group(1)} USD"
    else:
        totals = [
            a
            for a in re.findall(r"(\d+(?:[.,]\d+)?)\s*USD", plain)
            if a not in {"35"} and "per hour" not in a
        ]
        if totals:
            tok["amount"] = f"{totals[-1]} USD"
    m = re.search(r"Total to pay/\s*(.+?United States dollars \d{2} cents)", plain)
    if m:
        tok["words"] = m.group(1).strip()
    m = re.search(r"Marketing video and design for ([A-Z]{2})", plain)
    if m:
        tok["line"] = m.group(1)
    return tok


def format_hours(hours: float, sample: str = "") -> str:
    sep = "," if "," in (sample or "0,0") else "."
    return f"{hours:.1f}".replace(".", sep) + " h"


def format_amount(amount: float) -> str:
    if abs(amount - round(amount)) < 0.005:
        return f"{int(round(amount))} USD"
    return f"{round(amount, 2):.2f} USD"


def template_path(line: str) -> Path:
    line = (line or "DD").upper()
    key = "DD" if line == "DS" else line
    if ICLOUD_MGX.exists():
        found = []
        for path in ICLOUD_MGX.rglob(f"invoice{key}_*.docx"):
            if path.name.startswith("~$"):
                continue
            m = re.search(r"_(\d{4}\.\d{2}\.\d{2})\.docx$", path.name)
            stamp = m.group(1) if m else "0000.00.00"
            found.append((stamp, path.stat().st_mtime, path))
        if found:
            found.sort()
            return found[-1][2]
    bundled = TEMPLATE_DIR / f"invoice{key}.docx"
    if bundled.exists():
        return bundled
    other = TEMPLATE_DIR / "invoiceDD.docx"
    if other.exists():
        return other
    raise FileNotFoundError(
        f"Superplay invoice template missing for {key}. Put invoice{key}.docx in {TEMPLATE_DIR}"
    )


def clone_invoice(line: str, hours: float, amount: float, when: datetime | None = None) -> bytes:
    line = (line or "DD").upper()
    when = when or now_kyiv()
    src = template_path(line).read_bytes()
    zin = zipfile.ZipFile(BytesIO(src))
    xmls = {}
    for name in zin.namelist():
        if name.startswith("word/") and name.endswith(".xml"):
            xmls[name] = zin.read(name).decode("utf-8")
    body = xmls.get("word/document.xml", "")
    tok = _detect_tokens(body)
    amt_s = format_amount(amount)
    hours_s = format_hours(hours, tok.get("hours") or "")
    words = usd_in_words(amount)
    replacements = [
        (tok.get("words") or "", words),
        (tok.get("hours") or "", hours_s),
        (tok.get("amount") or "", amt_s),
        (tok.get("number") or "", f"{line} {when.strftime('%d/%m')}"),
        (tok.get("date") or "", when.strftime("%d.%m.%Y")),
        (tok.get("pay_by") or "", (when + timedelta(days=21)).strftime("%d.%m.%Y")),
        (
            f"Marketing video and design for {tok.get('line') or line}",
            f"Marketing video and design for {line}",
        ),
    ]
    replacements.sort(key=lambda p: len(p[0]), reverse=True)
    for name, xml in list(xmls.items()):
        for old, new in replacements:
            xml = _replace_in_xml(xml, old, new)
        xmls[name] = xml
    out = BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = xmls[item.filename].encode("utf-8") if item.filename in xmls else zin.read(item.filename)
            zout.writestr(item, data)
    return out.getvalue()


def build_invoice(line: str, hours: float, amount: float, when: datetime | None = None) -> bytes:
    return clone_invoice(line, hours, amount, when)


def invoice_destinations(ym: str) -> list[Path]:
    return [INVOICES_DIR / month_folder_name(ym)]


def reveal_invoice_dir(ym: str) -> dict:
    dest = INVOICES_DIR / month_folder_name(ym)
    dest.mkdir(parents=True, exist_ok=True)
    if sys.platform == "darwin":
        cmds = [["open", str(dest)]]
    elif sys.platform == "win32":
        cmds = [["explorer", str(dest)]]
    else:
        cmds = [
            ["xdg-open", str(dest)],
            ["gio", "open", str(dest)],
            ["nautilus", "--browser", str(dest)],
        ]
    for cmd in cmds:
        try:
            subprocess.run(cmd, check=True, timeout=8, capture_output=True)
            return {"ok": True, "opened": True, "folderPath": str(dest)}
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError, OSError):
            continue
    return {"ok": True, "opened": False, "folderPath": str(dest)}


def zip_invoice_dir(ym: str) -> tuple[str, bytes]:
    dest = INVOICES_DIR / month_folder_name(ym)
    dest.mkdir(parents=True, exist_ok=True)
    folder = month_folder_name(ym)
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(dest.iterdir()):
            if path.is_file() and INVOICE_NAME.match(path.name):
                zf.write(path, f"{folder}/{path.name}")
    return f"{folder}.zip", buf.getvalue()


def primary_invoice_dir(ym: str) -> Path:
    dests = invoice_destinations(ym)
    for path in dests:
        if path.exists():
            return path
    return dests[-1]


def _which(path: str) -> str | None:
    p = Path(path)
    if p.exists():
        return str(p)
    found = shutil.which(path)
    return found


def _word_mac_pdf(src: Path, dest: Path) -> bytes:
    if sys.platform != "darwin":
        return b""
    word = Path("/Applications/Microsoft Word.app")
    if not word.exists():
        return b""
    script = (
        f'set inFile to POSIX file "{src}"\n'
        f'set outFile to POSIX file "{dest}"\n'
        "tell application \"Microsoft Word\"\n"
        "  open inFile\n"
        "  save as active document file name outFile file format format PDF\n"
        "  close active document saving no\n"
        "end tell\n"
    )
    try:
        subprocess.run(["osascript", "-e", script], check=True, timeout=60, capture_output=True)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        return b""
    if dest.exists() and dest.stat().st_size > 200:
        return dest.read_bytes()
    return b""


def _soffice_pdf(src: Path, dest: Path, tmp_p: Path) -> bytes:
    for binary in SOFFICE_BINS:
        exe = _which(binary)
        if not exe:
            continue
        profile = tmp_p / "lo-profile"
        profile.mkdir(exist_ok=True)
        try:
            subprocess.run(
                [
                    exe,
                    "--headless",
                    "--norestore",
                    "--nolockcheck",
                    f"-env:UserInstallation={profile.as_uri()}",
                    "--convert-to",
                    "pdf:writer_pdf_Export",
                    "--outdir",
                    str(tmp_p),
                    str(src),
                ],
                check=True,
                timeout=90,
                capture_output=True,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
            continue
        produced = tmp_p / (src.stem + ".pdf")
        if produced.exists() and produced.stat().st_size > 200:
            data = produced.read_bytes()
            dest.write_bytes(data)
            return data
    return b""


def docx_to_pdf(docx_bytes: bytes, pdf_path: Path) -> bytes:
    """Export the cloned Word form. Never rebuild as HTML — that changes the table."""
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_p = Path(tmp)
        src = tmp_p / "invoice.docx"
        src.write_bytes(docx_bytes)
        word_pdf = tmp_p / "invoice-word.pdf"
        data = _word_mac_pdf(src, word_pdf)
        if data:
            pdf_path.write_bytes(data)
            return data
        data = _soffice_pdf(src, pdf_path, tmp_p)
        if data:
            return data
    return b""


def issue_invoice(
    line: str,
    hours: float,
    amount: float,
    month: str,
    when: datetime | None = None,
) -> dict:
    line = (line or "DD").upper()
    when = when or now_kyiv()
    docx_bytes = clone_invoice(line, hours, amount, when)
    docx_name = invoice_filename(line, when, "docx")
    pdf_name = invoice_filename(line, when, "pdf")
    dests = invoice_destinations(month)
    written: list[Path] = []
    pdf_bytes = b""
    for dest in dests:
        dest.mkdir(parents=True, exist_ok=True)
        docx_path = dest / docx_name
        docx_path.write_bytes(docx_bytes)
        written.append(docx_path)
        pdf_path = dest / pdf_name
        if not pdf_bytes:
            pdf_bytes = docx_to_pdf(docx_bytes, pdf_path)
        elif pdf_bytes:
            pdf_path.write_bytes(pdf_bytes)
        if pdf_path.exists():
            written.append(pdf_path)
    primary = dests[0] if dests[0].exists() else dests[-1]
    files = [
        {
            "name": docx_name,
            "url": f"/api/finance/invoice/file?month={month}&name={docx_name}",
            "kind": "docx",
        }
    ]
    if pdf_bytes:
        files.append(
            {
                "name": pdf_name,
                "url": f"/api/finance/invoice/file?month={month}&name={pdf_name}",
                "kind": "pdf",
            }
        )
    urls = {
        "docx": f"/api/finance/invoice/file?month={month}&name={docx_name}",
    }
    if pdf_bytes:
        urls["pdf"] = f"/api/finance/invoice/file?month={month}&name={pdf_name}"
    return {
        "ok": True,
        "folder": month_folder_name(month),
        "folderPath": str(primary),
        "docxName": docx_name,
        "pdfName": pdf_name if pdf_bytes else "",
        "files": files,
        "paths": [str(p) for p in written],
        "written": [str(p) for p in written],
        "urls": urls,
        "hours": hours,
        "amount": round(float(amount), 2),
        "date": when.strftime("%d.%m.%Y"),
        "pdfReady": bool(pdf_bytes),
    }


def list_invoices(month: str) -> dict:
    folder = month_folder_name(month)
    dest = primary_invoice_dir(month)
    files = []
    if dest.exists():
        for path in sorted(dest.iterdir()):
            if path.is_file() and INVOICE_NAME.match(path.name):
                files.append(
                    {
                        "name": path.name,
                        "url": f"/api/finance/invoice/file?month={month}&name={path.name}",
                        "size": path.stat().st_size,
                    }
                )
    return {
        "folder": folder,
        "folderPath": str(dest),
        "exists": dest.exists(),
        "files": files,
    }


def resolve_invoice_file(month: str, name: str) -> Path:
    name = Path(name).name
    if not INVOICE_NAME.match(name):
        raise ValueError("bad invoice file name")
    for dest in invoice_destinations(month):
        cand = dest / name
        if cand.is_file():
            return cand
    raise FileNotFoundError(name)


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
                rate = person_rate(person, meta=meta)
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
