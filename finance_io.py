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

import direction_io
import excel_io
import playables_io
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent
CALC_PATH = ROOT / "data" / "finance" / "SUPERPLAY_MGX_Calculator.xlsx"
TEMPLATE_DIR = ROOT / "data" / "finance" / "templates"
INVOICES_DIR = ROOT / "data" / "invoices"
W_T = re.compile(r"(<w:t(?:\s[^>]*)?>)(.*?)(</w:t>)", re.DOTALL)
W_P = re.compile(r"<w:p[ >].*?</w:p>", re.DOTALL)
SOFFICE_BINS = [
    "/usr/bin/soffice",
    "/usr/bin/libreoffice",
    "/usr/bin/lowriter",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
]
NBU_URL = "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json"
TAX_PCT = 0.06
CLIENT_RATE = 35.0
PLAYABLE_CLIENT_RATE = 40.0
MANAGER_RATE = 5.0
PLAYABLE_MANAGER_RATE = 7.0
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


def default_pay_rate(person: dict | None, meta: dict | None = None, direction: str = "mgx") -> float:
    meta = meta or {}
    if person and person.get("role") == "manager":
        if direction_io.norm_dir(direction) == direction_io.PLAYABLES:
            return PLAYABLE_MANAGER_RATE
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


def person_rate(person: dict | None, default: float | None = None, meta: dict | None = None, direction: str = "mgx") -> float:
    fallback = default if default is not None else default_pay_rate(person, meta, direction)
    if not person:
        return fallback
    return direction_io.person_rate_for(person, direction, fallback)


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


def _by_pay_order(people: list[dict]) -> list[dict]:
    return sorted(people, key=lambda p: (p.get("payOrder") or 99, p.get("name") or ""))


def hours_people(db: dict) -> list[dict]:
    """Performers: TL / MD on MGX, AD / Dev / Motion on Playables."""
    return _by_pay_order(
        [
            p
            for p in db.get("people") or []
            if p.get("role") in {"teamlead", "designer", "art_director", "programmer"}
        ]
    )


def empl_people(db: dict) -> list[dict]:
    """Calculator EMPL columns: manager, then performers."""
    mgr = [p for p in db.get("people") or [] if p.get("role") == "manager"]
    return _by_pay_order(mgr) + hours_people(db)


def pay_people(db: dict) -> list[dict]:
    return empl_people(db)


_STALE_BANK_CARDS = {
    "432345037851582": "4323345037851582",
}


def normalize_bank_card(raw) -> str:
    return re.sub(r"\D", "", str(raw or ""))


def normalize_iban(raw) -> str:
    return "".join(str(raw or "").split()).upper()


def apply_bank_card_fixes(db: dict) -> bool:
    """One-shot typo fixes so a later Employeers write does not undo a sheet edit."""
    dirty = False
    for person in db.get("people") or []:
        raw = normalize_bank_card(person.get("bankCard"))
        nxt = _STALE_BANK_CARDS.get(raw)
        if nxt:
            person["bankCard"] = nxt
            dirty = True
    return dirty


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
        "role": person.get("role") or "",
        "rate": person_rate(person, meta=meta),
        "projects": 0,
        "shifts": 0.0,
        "hours": 0.0,
        "payUsd": 0.0,
        "allHours": person.get("role") == "manager",
    }


def snapshot(db: dict, month: str, nbu: dict | None = None) -> dict:
    meta = db.get("meta") or {}
    tax = float(meta.get("taxPct") if meta.get("taxPct") is not None else TAX_PCT)
    shift_hours = float(meta.get("shiftHours") or 9)
    nbu = _nbu_from(db, nbu)
    fx = float(nbu.get("rate") or FALLBACK_NBU)
    tasks = excel_io.tasks_for_finance(db, month)
    hours_source = f"board · {excel_io.sheet_name_for(month)}"
    pay = {p["id"]: _pay_row(p, meta) for p in pay_people(db)}
    for row in pay.values():
        row["rateMgx"] = person_rate(next((p for p in db.get("people") or [] if p.get("id") == row["id"]), None), meta=meta, direction="mgx")
        row["ratePlay"] = person_rate(next((p for p in db.get("people") or [] if p.get("id") == row["id"]), None), meta=meta, direction="playables")
        row["hoursMgx"] = 0.0
        row["hoursPlay"] = 0.0
        row["payUsd"] = 0.0
        row["payUsdMgx"] = 0.0
        row["payUsdPlay"] = 0.0
        row["allHours"] = False
    unassigned = {"projects": 0, "shifts": 0.0, "hours": 0.0}
    by_line = []
    buckets = {}
    for dir_key, dir_label in ((direction_io.MGX, "MGX"), (direction_io.PLAYABLES, "Playable")):
        rate = direction_io.client_rate(dir_key, meta)
        for line in ("DX", "DD", "DS"):
            buckets[(dir_key, line)] = {
                "direction": dir_key,
                "label": f"{dir_label} {line}",
                "line": line,
                "projects": 0,
                "shifts": 0.0,
                "hours": 0.0,
                "bill": 0.0,
                "rate": rate,
            }
    mgr_hours = {direction_io.MGX: 0.0, direction_io.PLAYABLES: 0.0}
    mgr_projects = {direction_io.MGX: 0, direction_io.PLAYABLES: 0}
    for t in tasks:
        direction = direction_io.of_task(t)
        line = t.get("line") if t.get("line") in {"DD", "DX", "DS"} else "DD"
        h = hours_of(t, shift_hours)
        sh = float(t.get("shifts") or 0)
        rate = direction_io.client_rate(direction, meta)
        bucket = buckets[(direction, line)]
        bucket["projects"] += 1
        bucket["shifts"] += sh
        bucket["hours"] += h
        bucket["bill"] += h * rate
        if direction == direction_io.PLAYABLES:
            mgr_h = playables_io.producer_hours(t)
        else:
            mgr_h = h
        mgr_hours[direction] += mgr_h
        mgr_projects[direction] += 1
        allocated = 0.0
        for pid, row in list(pay.items()):
            if row.get("role") == "manager":
                continue
            ph = excel_io.hours_for_person(t, pid, shift_hours)
            if ph <= 0:
                continue
            pay_rate = person_rate(
                next((p for p in db.get("people") or [] if p.get("id") == pid), None),
                meta=meta,
                direction=direction,
            )
            row["projects"] += 1
            row["shifts"] += round(ph / shift_hours, 2) if shift_hours and direction == direction_io.MGX else 0
            row["hours"] += ph
            row["payUsd"] += ph * pay_rate
            if direction == direction_io.PLAYABLES:
                row["hoursPlay"] += ph
                row["payUsdPlay"] += ph * pay_rate
            else:
                row["hoursMgx"] += ph
                row["payUsdMgx"] += ph * pay_rate
            allocated = round(allocated + ph, 1)
        leftover = round(max(0.0, (mgr_h if direction == direction_io.PLAYABLES else h) - allocated), 1)
        if leftover > 0.05 and direction == direction_io.MGX:
            unassigned["projects"] += 1
            unassigned["shifts"] += round(leftover / shift_hours, 2) if shift_hours else sh
            unassigned["hours"] += leftover
    people_by_id = {p["id"]: p for p in db.get("people") or []}
    for row in pay.values():
        if row.get("role") != "manager":
            continue
        person = people_by_id.get(row["id"])
        mgx_h = round(mgr_hours[direction_io.MGX], 1)
        play_h = round(mgr_hours[direction_io.PLAYABLES], 1)
        row["hoursMgx"] = mgx_h
        row["hoursPlay"] = play_h
        row["hours"] = round(mgx_h + play_h, 1)
        row["projects"] = mgr_projects[direction_io.MGX] + mgr_projects[direction_io.PLAYABLES]
        pay_mgx = mgx_h * person_rate(person, meta=meta, direction="mgx")
        pay_play = play_h * person_rate(person, meta=meta, direction="playables")
        row["payUsdMgx"] = pay_mgx
        row["payUsdPlay"] = pay_play
        row["payUsd"] = pay_mgx + pay_play
        row["allHours"] = True
        row["rate"] = person_rate(person, meta=meta, direction="mgx")
    payroll = sorted(pay.values(), key=lambda r: (r.get("payOrder") or 99, r["name"]))
    for row in payroll:
        if not row.get("allHours"):
            row["rate"] = row.get("ratePlay") if row.get("hoursPlay") and not row.get("hoursMgx") else row.get("rateMgx") or row.get("rate")
        row["payUsdMgx"] = round(row.get("payUsdMgx") or 0, 2)
        row["payUsdPlay"] = round(row.get("payUsdPlay") or 0, 2)
        row["payUah"] = round(row["payUsd"] * fx, 2)
        row["payUsd"] = round(row["payUsd"], 2)
        row["hours"] = round(row["hours"], 1)
        row["hoursMgx"] = round(row.get("hoursMgx") or 0, 1)
        row["hoursPlay"] = round(row.get("hoursPlay") or 0, 1)
        row["shifts"] = round(row["shifts"], 2)
    for key in ((direction_io.MGX, "DX"), (direction_io.MGX, "DD"), (direction_io.MGX, "DS"),
                (direction_io.PLAYABLES, "DX"), (direction_io.PLAYABLES, "DD"), (direction_io.PLAYABLES, "DS")):
        row = buckets[key]
        row["hours"] = round(row["hours"], 1)
        row["shifts"] = round(row["shifts"], 2)
        row["bill"] = round(row["bill"], 2)
        keep = row["projects"] or (key[0] == direction_io.MGX and key[1] != "DS")
        if keep:
            by_line.append(row)
    hours = round(sum(r["hours"] for r in by_line), 1)
    shifts = round(sum(r["shifts"] for r in by_line), 2)
    client_in = round(sum(r["bill"] for r in by_line), 2)
    after_tax = round(client_in - client_in * tax, 2)
    empl = round(sum(r["payUsd"] for r in payroll), 2)
    studio = round(after_tax - empl, 2)
    mgx_in = round(sum(r["bill"] for r in by_line if r["direction"] == direction_io.MGX), 2)
    play_in = round(sum(r["bill"] for r in by_line if r["direction"] == direction_io.PLAYABLES), 2)
    return {
        "month": month,
        "hoursSource": hours_source,
        "clientRate": direction_io.client_rate(direction_io.MGX, meta),
        "playableClientRate": direction_io.client_rate(direction_io.PLAYABLES, meta),
        "taxPct": tax,
        "nbu": nbu,
        "hours": hours,
        "shifts": shifts,
        "projects": len(tasks),
        "byLine": by_line,
        "byDirection": [
            {"direction": direction_io.MGX, "label": "MGX", "hours": round(sum(r["hours"] for r in by_line if r["direction"] == direction_io.MGX), 1), "bill": mgx_in},
            {"direction": direction_io.PLAYABLES, "label": "Playable", "hours": round(sum(r["hours"] for r in by_line if r["direction"] == direction_io.PLAYABLES), 1), "bill": play_in},
        ],
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


INVOICE_NAME = re.compile(
    r"^(invoice[A-Z]{2}_\d{4}\.\d{2}\.\d{2}|invoice_Playable_[A-Z]{2}_\d{4}\.\d{2}\.\d{2})\.(docx|pdf)$"
)


def now_kyiv() -> datetime:
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo("Europe/Kyiv"))
    except Exception:
        return datetime.now(timezone(timedelta(hours=3)))


def month_folder_name(ym: str) -> str:
    y, m = [int(x) for x in ym.split("-")]
    return f"{m:02d}_{datetime(y, m, 1).strftime('%B')}"


def invoice_filename(line: str, when: datetime | None = None, ext: str = "docx", direction: str = "mgx") -> str:
    when = when or now_kyiv()
    line = (line or "DD").upper()
    if direction_io.norm_dir(direction) == direction_io.PLAYABLES:
        return f"invoice_Playable_{line}_{when.strftime('%Y.%m.%d')}.{ext}"
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
    bundled = TEMPLATE_DIR / f"invoice{key}.docx"
    if bundled.exists():
        return bundled
    other = TEMPLATE_DIR / "invoiceDD.docx"
    if other.exists():
        return other
    raise FileNotFoundError(
        f"Superplay invoice template missing for {key}. Put invoice{key}.docx in {TEMPLATE_DIR}"
    )


def clone_invoice(line: str, hours: float, amount: float, when: datetime | None = None, direction: str = "mgx") -> bytes:
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
            (
                f"Playable ads for {line}"
                if direction_io.norm_dir(direction) == direction_io.PLAYABLES
                else f"Marketing video and design for {line}"
            ),
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


def build_invoice(line: str, hours: float, amount: float, when: datetime | None = None, direction: str = "mgx") -> bytes:
    return clone_invoice(line, hours, amount, when, direction=direction)


def invoice_destinations(ym: str, direction: str = "mgx") -> list[Path]:
    folder = "Playable" if direction_io.norm_dir(direction) == direction_io.PLAYABLES else "MGX"
    return [INVOICES_DIR / folder / month_folder_name(ym)]


def primary_invoice_dir(ym: str, direction: str = "mgx") -> Path:
    dests = invoice_destinations(ym, direction)
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


_PDF_ENGINE: dict | None = None


def pdf_engine() -> dict:
    global _PDF_ENGINE
    if _PDF_ENGINE is None:
        word = sys.platform == "darwin" and Path("/Applications/Microsoft Word.app").exists()
        soffice = ""
        for binary in SOFFICE_BINS:
            found = _which(binary)
            if found:
                soffice = found
                break
        _PDF_ENGINE = {"ready": bool(word or soffice), "word": bool(word), "soffice": soffice}
    return dict(_PDF_ENGINE)


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
    raise FileNotFoundError(
        "PDF needs LibreOffice on the studio server: sudo apt-get install -y libreoffice-writer-nogui"
    )


def issue_invoice(
    line: str,
    hours: float,
    amount: float,
    month: str,
    when: datetime | None = None,
    direction: str = "mgx",
) -> dict:
    line = (line or "DD").upper()
    direction = direction_io.norm_dir(direction)
    when = when or now_kyiv()
    docx_bytes = clone_invoice(line, hours, amount, when, direction=direction)
    docx_name = invoice_filename(line, when, "docx", direction)
    pdf_name = invoice_filename(line, when, "pdf", direction)
    dests = invoice_destinations(month, direction)
    written: list[Path] = []
    pdf_bytes = b""
    pdf_error = ""
    for dest in dests:
        dest.mkdir(parents=True, exist_ok=True)
        docx_path = dest / docx_name
        docx_path.write_bytes(docx_bytes)
        written.append(docx_path)
        pdf_path = dest / pdf_name
        if not pdf_bytes and not pdf_error:
            try:
                pdf_bytes = docx_to_pdf(docx_bytes, pdf_path)
            except FileNotFoundError as e:
                pdf_error = str(e)
        elif pdf_bytes:
            pdf_path.write_bytes(pdf_bytes)
        if pdf_path.exists() and pdf_path.stat().st_size > 200:
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
        "pdfError": pdf_error,
        "files": files,
        "paths": [str(p) for p in written],
        "written": [str(p) for p in written],
        "urls": urls,
        "hours": hours,
        "amount": round(float(amount), 2),
        "date": when.strftime("%d.%m.%Y"),
        "pdfReady": bool(pdf_bytes),
        "direction": direction,
        "line": line,
    }


def list_invoices(month: str) -> dict:
    folder = month_folder_name(month)
    dest = primary_invoice_dir(month)
    play = primary_invoice_dir(month, direction_io.PLAYABLES)
    files = []
    for folder_path in (dest, play):
        if not folder_path.exists():
            continue
        for path in sorted(folder_path.iterdir()):
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
        "playableFolderPath": str(play),
        "exists": dest.exists() or play.exists(),
        "files": files,
    }


def resolve_invoice_file(month: str, name: str) -> Path:
    name = Path(name).name
    if not INVOICE_NAME.match(name):
        raise ValueError("bad invoice file name")
    for dest in invoice_destinations(month) + invoice_destinations(month, direction_io.PLAYABLES):
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
    crew = _by_pay_order(
        [p for p in db.get("people") or [] if p.get("role") == "manager"]
        + [p for p in db.get("people") or [] if p.get("role") in {"teamlead", "designer"}]
    )
    tasks = [
        t
        for t in db.get("tasks") or []
        if (t.get("month") or ym) == ym and direction_io.is_mgx(t)
    ]
    by_line = {k: [] for k in ("DX", "DD", "DS")}
    for t in tasks:
        line = t.get("line") if t.get("line") in by_line else "DD"
        by_line[line].append(t)
    for key in by_line:
        by_line[key].sort(key=lambda t: str(t.get("name") or ""))
    active_lines = [k for k in ("DX", "DD", "DS") if by_line[k] or k != "DS"]

    wb = load_workbook(path)
    try:
        return _write_month_body(db, ym, path, wb, client_rate, tax, fx, crew, by_line, active_lines)
    finally:
        try:
            wb.close()
        except Exception:
            pass


def _write_month_body(db, ym, path, wb, client_rate, tax, fx, crew, by_line, active_lines):
    meta = db.get("meta") or {}
    name = sheet_name_for(ym)
    if name in wb.sheetnames:
        del wb[name]
    ws = wb.create_sheet(name, 0)
    n_empl = max(len(crew), 1)
    empl_start = 6
    total_empl_col = empl_start + n_empl
    client_col = total_empl_col + 1
    y, m = [int(x) for x in ym.split("-")]
    ws.cell(2, 2, datetime(y, m, 1).strftime("%Y %B").upper())
    ws.cell(2, 2).font = CALIBRI_BOLD
    for i, person in enumerate(crew):
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
        help_rows = excel_io.help_entries(task)
        for i, person in enumerate(crew):
            cell = ws.cell(row, empl_start + i)
            rate = person_rate(person, meta=meta)
            share = excel_io.hours_for_person(task, person["id"])
            on_row = person.get("role") == "manager" or share > 0
            if person.get("role") == "manager":
                cell.value = f"=D{row}*{rate:g}"
            elif share > 0:
                cell.value = f"={share:g}*{rate:g}" if help_rows or person["id"] != who else f"=D{row}*{rate:g}"
            if on_row:
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
    tax_row = uah_row + 1
    tax_col = usd_col + 1
    tax_cell = ws.cell(tax_row, tax_col, tax)
    tax_cell.number_format = "0.00%"
    tax_cell.font = CALIBRI_BOLD
    tax_cell.alignment = CENTER
    ws.cell(uah_row, tax_col, "TAX").font = CALIBRI_BOLD
    tax_ref = f"{get_column_letter(tax_col)}{tax_row}"
    rows = [
        (uah_row, "CLIENT IN", f"={get_column_letter(client_col)}{total_row}"),
        (tax_row, "STUDIO (TAX)", f"={get_column_letter(usd_col)}{uah_row}-{get_column_letter(usd_col)}{uah_row}*{tax_ref}"),
        (uah_row + 2, "EMPL", f"={get_column_letter(total_empl_col)}{total_row}"),
        (uah_row + 3, "STUDIO", f"={get_column_letter(usd_col)}{tax_row}-{get_column_letter(usd_col)}{uah_row + 2}"),
    ]
    for row, label, formula in rows:
        ws.cell(row, label_col, label).font = CALIBRI_BOLD
        ws.cell(row, usd_col, formula)
        ws.cell(row, uah_col, f"={get_column_letter(usd_col)}{row}*{fx:g}")

    ws.column_dimensions["A"].width = 11
    ws.column_dimensions["B"].width = 72
    for col in range(3, tax_col + 1):
        ws.column_dimensions[get_column_letter(col)].width = 14
    _write_employeers_sheet(wb, db)
    _atomic_save(wb, path)
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
        card = normalize_bank_card(person.get("bankCard"))
        card_cell = ws.cell(r, 6, card or None)
        if card:
            card_cell.number_format = "@"
        iban = normalize_iban(person.get("iban"))
        iban_cell = ws.cell(r, 7, iban or None)
        if iban:
            iban_cell.number_format = "@"
        ws.cell(r, 8, person.get("taxId") or None)


def write_employeers(db: dict, path: Path | None = None) -> Path:
    path = Path(path or CALC_PATH)
    wb = load_workbook(path)
    try:
        _write_employeers_sheet(wb, db)
        _atomic_save(wb, path)
        return path
    finally:
        try:
            wb.close()
        except Exception:
            pass


def _atomic_save(wb, path: Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(suffix=".xlsx", dir=str(path.parent))
    os.close(fd)
    tmp_path = Path(tmp)
    try:
        wb.save(tmp_path)
        tmp_path.replace(path)
    except Exception:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass
        raise
