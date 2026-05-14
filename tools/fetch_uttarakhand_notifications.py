#!/usr/bin/env python3
"""
fetch_uttarakhand_notifications.py
===================================
Downloads Uttarakhand High Court transfer/posting notification PDFs
from the last 6 months, extracts transfer entries, and appends them
to data/notifications.json.

Run from the repo root:
    pip install requests pdfplumber
    python3 tools/fetch_uttarakhand_notifications.py

Requirements:
    pip install requests pdfplumber
"""

import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    sys.exit("ERROR: pdfplumber not installed. Run: pip install pdfplumber")

# ── Config ────────────────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parent.parent
PDF_BASE  = REPO_ROOT / "assets" / "notifications" / "pdfs" / "HC-UTK"
NOTIF_JSON = REPO_ROOT / "data" / "notifications.json"

SOURCE_PAGE = "https://highcourtofuttarakhand.gov.in/circulars-notifications/"
COURT_ID    = "HC-UTK"
COURT_NAME  = "Uttarakhand High Court"

CDN_BASE = "https://cdnbbsr.s3waas.gov.in/s3bc7f621451b4f5df308a8e098112185d/uploads"

# All Admin.A-2 transfer/posting notifications from Nov 2025 – May 2026
# Format: (local_filename, cdn_path, date_iso, notification_number, title)
NOTIFICATIONS = [
    # May 2026
    ("2026/05/UTK-2026-05-13-177.pdf",    "2026/05/20260513318689963.pdf",    "2026-05-13", "No.177/UHC/Admin.A-2/2026",       "Transfer and Posting of Judicial Officers"),
    ("2026/05/UTK-2026-05-05-159.pdf",    "2026/05/202605051742834785.pdf",   "2026-05-05", "No.159/UHC/Admin.A-2/2026",       "Transfer and Posting of Judicial Officers"),
    # April 2026
    ("2026/04/UTK-2026-04-30-158.pdf",    "2026/04/202604301287717167.pdf",   "2026-04-30", "No.158/UHC/Admin.A-2/2026",       "Transfer and Posting of Judicial Officers"),
    ("2026/04/UTK-2026-04-30-157.pdf",    "2026/04/202604301243204604.pdf",   "2026-04-30", "No.157/UHC/Admin.A-2/2026",       "Transfer and Posting of Judicial Officers"),
    ("2026/04/UTK-2026-04-23-140-151.pdf","2026/04/20260423126148812.pdf",    "2026-04-23", "No.140-151/UHC/Admin.A-2/2026",   "Transfer and Posting of Judicial Officers"),
    ("2026/04/UTK-2026-04-20-139.pdf",    "2026/04/20260420153505668.pdf",    "2026-04-20", "No.139/UHC/Admin.A-2/2026",       "Transfer and Posting of Judicial Officers"),
    ("2026/04/UTK-2026-04-18-133.pdf",    "2026/04/20260418630676703.pdf",    "2026-04-18", "No.133/UHC/Admin.A-2/2026",       "Transfer and Posting of Judicial Officers"),
    ("2026/04/UTK-2026-04-15-annual-jd.pdf", "2026/04/202604152097872430.pdf","2026-04-15", "Annual Transfers-2026 (JD)",      "Annual Transfers 2026 - Judicial/District Officers"),
    ("2026/04/UTK-2026-04-15-annual-sd.pdf", "2026/04/202604152113175629.pdf","2026-04-15", "Annual Transfers-2026 (SD)",      "Annual Transfers 2026 - Sub-Divisional Officers"),
    ("2026/04/UTK-2026-04-15-annual-hjs.pdf","2026/04/202604151962205852.pdf","2026-04-15", "Annual Transfers-2026 (HJS)",     "Annual Transfers 2026 - Higher Judicial Service Officers"),
    ("2026/04/UTK-2026-04-01-28.pdf",     "2026/04/20260401746504356.pdf",    "2026-04-01", "No.28/UHC/Admin.A-2/2026",        "Transfer and Posting of Judicial Officers"),
    # March 2026
    ("2026/03/UTK-2026-03-03-18.pdf",     "2026/03/20260303274236021.pdf",    "2026-03-03", "No.18/UHC/Admin.A-2/2026",        "Transfer and Posting of Judicial Officers"),
    # February 2026
    ("2026/02/UTK-2026-02-27-17.pdf",     "2026/02/20260227149237972.pdf",    "2026-02-27", "No.17/UHC/Admin.A-2/2026",        "Transfer and Posting of Judicial Officers"),
    ("2026/02/UTK-2026-02-27-16.pdf",     "2026/02/202602271501656723.pdf",   "2026-02-27", "No.16/UHC/Admin.A-2/2026",        "Transfer and Posting of Judicial Officers"),
    ("2026/02/UTK-2026-02-25-15.pdf",     "2026/02/20260225655595084.pdf",    "2026-02-25", "No.15/UHC/Admin.A-2/2026",        "Transfer and Posting of Judicial Officers"),
    ("2026/02/UTK-2026-02-17-13.pdf",     "2026/02/202602171056537587.pdf",   "2026-02-17", "No.13/UHC/Admin.A/2026",          "Transfer and Posting of Judicial Officers"),
    # January 2026
    ("2026/01/UTK-2026-01-31-11.pdf",     "2026/01/202601311203992147.pdf",   "2026-01-31", "No.11/UHC/Admin.A-2/2026",        "Transfer and Posting of Judicial Officers"),
    ("2026/01/UTK-2026-01-31-10.pdf",     "2026/01/20260131462095259.pdf",    "2026-01-31", "No.10/UHC/Admin.A-2/2026",        "Transfer and Posting of Judicial Officers"),
    ("2026/01/UTK-2026-01-13-09.pdf",     "2026/01/202601131093362873.pdf",   "2026-01-13", "No.09/UHC/Admin.A-2/2026",        "Transfer and Posting of Judicial Officers"),
    ("2026/01/UTK-2026-01-05-02-03.pdf",  "2026/01/202601051862793315.pdf",   "2026-01-05", "No.02-03/UHC/Admin.A-2/2026",     "Transfer and Posting of Judicial Officers"),
    ("2026/01/UTK-2026-01-05-01.pdf",     "2026/01/20260105914838609.pdf",    "2026-01-05", "No.01/UHC/Admin.A-2/2026",        "Transfer and Posting of Judicial Officers"),
    # December 2025
    ("2025/12/UTK-2025-12-22-379-380.pdf","2025/12/20251222629898363.pdf",    "2025-12-22", "No.379-380/UHC/Admin.A-2/2025",   "Transfer and Posting of Judicial Officers"),
    ("2025/12/UTK-2025-12-09-360-361.pdf","2025/12/202512091655869395.pdf",   "2025-12-09", "No.360-361/UHC/Admin.A-2/2025",   "Transfer and Posting of Judicial Officers"),
    # November 2025
    ("2025/11/UTK-2025-11-19-340.pdf",    "2025/11/202511191407554613.pdf",   "2025-11-19", "No.340/UHC/Admin.A-2/2025",       "Transfer and Posting of Judicial Officers"),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://highcourtofuttarakhand.gov.in/",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def download_pdf(local_path: str, cdn_path: str) -> bool:
    """Download a PDF from the S3WaaS CDN. Returns True on success."""
    dest = PDF_BASE / local_path
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        print(f"  [skip] {dest.name} (already downloaded)")
        return True
    url = f"{CDN_BASE}/{cdn_path}"
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        dest.write_bytes(data)
        print(f"  [ok]   {dest.name}  ({len(data)//1024}KB)")
        return True
    except Exception as e:
        print(f"  [err]  {dest.name}: {e}")
        return False


def extract_text(local_path: str) -> str:
    """Extract all text from a PDF using pdfplumber."""
    dest = PDF_BASE / local_path
    if not dest.exists():
        return ""
    try:
        with pdfplumber.open(dest) as pdf:
            return "\n".join(
                page.extract_text() or "" for page in pdf.pages
            )
    except Exception as e:
        print(f"  [warn] Could not extract text from {dest.name}: {e}")
        return ""


def parse_transfers(text: str, notif_id: str) -> list:
    """
    Parse transfer entries from PDF text.
    Uttarakhand HC orders follow patterns like:
      Shri/Smt/Ms. <Name>, <Current Post> is transferred and posted as <New Post>
    or tabular formats with officer name and posting details.
    """
    entries = []
    if not text:
        return entries

    lines = [l.strip() for l in text.split("\n") if l.strip()]
    idx = 0

    # Common title prefixes for judicial officers in Uttarakhand
    prefixes = r"(?:Shri|Smt\.?|Ms\.?|Sri|Dr\.?|Sh\.?)"
    # Pattern 1: "Shri X, <from> is transferred/posted as <to>"
    pat1 = re.compile(
        rf"({prefixes}\s+[A-Z][A-Za-z\s\.\-]+?),\s*(.+?)\s+(?:is|are)\s+(?:hereby\s+)?(?:transferred|posted)(?:\s+and\s+posted)?\s+(?:as|to)\s+(.+)",
        re.IGNORECASE
    )
    # Pattern 2: Numbered list "1. Shri X from Y to Z"
    pat2 = re.compile(
        rf"\d+\.\s*({prefixes}\s+[A-Z][A-Za-z\s\.\-]+?),\s*(?:presently\s+)?(?:working\s+as\s+)?(.+?)\s*(?:is\s+transferred|transferred|posted)\s+(?:as|to)\s+(.+)",
        re.IGNORECASE
    )
    # Pattern 3: Two-column table — name on one line, posting on next
    pat_name = re.compile(rf"^({prefixes}\s+[A-Z][A-Za-z\s\.\-]{{3,40}})$")
    pat_post = re.compile(r"^(?:is\s+)?(?:transferred\s+(?:and\s+)?)?(?:posted|appointed)\s+(?:as|to)\s+(.+)$", re.I)

    seen = set()

    def add(name, frm, to):
        name = name.strip().rstrip(",")
        frm  = frm.strip().rstrip(".")
        to   = to.strip().rstrip(".")
        key  = name.lower()
        if key in seen or len(name) < 5:
            return
        seen.add(key)
        t_id = f"{notif_id}-T{len(entries)+1:03d}"
        entries.append({
            "id": t_id,
            "person_name": name,
            "role_type": "Judicial Officer",
            "from_position": frm,
            "to_position": to,
            "assumed_role": to.split(",")[0].strip(),
            "effective_date": "",
            "notes": ""
        })

    full = " ".join(lines)
    for m in pat1.finditer(full):
        add(m.group(1), m.group(2), m.group(3))
    for m in pat2.finditer(full):
        add(m.group(1), m.group(2), m.group(3))

    # Table pattern: try line-by-line if no matches yet
    if not entries:
        for i, line in enumerate(lines):
            m = pat_name.match(line)
            if m and i + 1 < len(lines):
                mp = pat_post.match(lines[i + 1])
                if mp:
                    add(m.group(1), "Current posting", mp.group(1))

    return entries


def make_notif_id(local_path: str) -> str:
    """UTK-2026-04-15-annual-jd → UTK-2026-04-15-annual-jd"""
    return "UTK-" + Path(local_path).stem.replace("UTK-", "")


def build_entry(local_path, date_iso, notif_num, title, transfer_entries):
    stem = Path(local_path).stem
    return {
        "id": stem,
        "court_id": COURT_ID,
        "court": COURT_NAME,
        "date": date_iso,
        "category": "Transfer / Posting",
        "title": f"{notif_num} — {title}" if notif_num.startswith("No.") else title,
        "url": f"assets/notifications/pdfs/HC-UTK/{local_path}",
        "source_page": SOURCE_PAGE,
        "file_type": "pdf",
        "transfer_entries": transfer_entries,
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=== Uttarakhand HC Notification Fetcher ===\n")

    # Load existing notifications
    existing = json.loads(NOTIF_JSON.read_text(encoding="utf-8"))
    existing_ids = {e.get("id") for e in existing}

    new_entries = []

    for local_path, cdn_path, date_iso, notif_num, title in NOTIFICATIONS:
        stem = Path(local_path).stem
        if stem in existing_ids:
            print(f"[already indexed] {stem}")
            continue

        print(f"\n→ {stem} ({date_iso})")

        # 1. Download
        ok = download_pdf(local_path, cdn_path)

        # 2. Extract text & parse
        transfers = []
        if ok:
            text = extract_text(local_path)
            transfers = parse_transfers(text, stem)
            print(f"  [parsed] {len(transfers)} transfer entries")

        # 3. Build JSON entry
        entry = build_entry(local_path, date_iso, notif_num, title, transfers)
        new_entries.append(entry)
        time.sleep(0.5)  # be polite to the CDN

    if not new_entries:
        print("\nNothing new to add.")
        return

    # Prepend new entries (most recent first within Uttarakhand block)
    new_entries.sort(key=lambda e: e["date"], reverse=True)
    updated = existing + new_entries
    NOTIF_JSON.write_text(
        json.dumps(updated, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"\n✓ Added {len(new_entries)} entries to data/notifications.json")
    print(f"  PDFs stored under: assets/notifications/pdfs/HC-UTK/")


if __name__ == "__main__":
    main()
