#!/usr/bin/env python3
"""
fetch_uttarakhand_notifications.py
===================================
Downloads Uttarakhand High Court constitutional-court judge movement
notification PDFs from the last 6 months, extracts movement entries,
and appends them to data/notifications.json.

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

# Uttarakhand notifications from Nov 2025 – May 2026 that are relevant to
# constitutional court judge movement. District judiciary, registry, staff and
# routine administrative transfer/posting documents are deliberately excluded
# from the app record.
# Format: (local_filename, cdn_path, date_iso, notification_number, title, category, movement_scope)
NOTIFICATIONS = [
    # January 2026
    ("2026/01/UTK-2026-01-06-05-oath-siddhartha-sah.pdf", "2026/01/20260106927110351.pdf", "2026-01-06", "No.05/UHC/Admin.A/2026", "Oath ceremony of Shri Siddhartha Sah as Additional Judge of the High Court of Uttarakhand", "HC Judge Movement", "constitutional_court_judges"),
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

    oath = re.search(
        r"Oath Ceremony of\s+(Shri|Smt\.?|Ms\.?|Justice)\s+([A-Z][A-Za-z\s\.\-]+?)\s+as\s+(.+?High Court of Uttarakhand)",
        full,
        re.IGNORECASE
    )
    if oath:
        name = f"{oath.group(1)} {oath.group(2)}".strip()
        to = oath.group(3).strip()
        entries.append({
            "id": f"{notif_id}-T001",
            "person_name": name,
            "role_type": "High Court Judge",
            "from_position": "Not stated in notification",
            "to_position": to,
            "assumed_role": to,
            "effective_date": "",
            "notes": "Oath ceremony notice"
        })
        return entries

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


def build_entry(local_path, date_iso, notif_num, title, transfer_entries, category="Transfer / Posting", movement_scope="district_judiciary"):
    stem = Path(local_path).stem
    return {
        "id": stem,
        "court_id": COURT_ID,
        "court": COURT_NAME,
        "date": date_iso,
        "category": category,
        "title": f"{notif_num} — {title}" if notif_num.startswith("No.") else title,
        "url": f"assets/notifications/pdfs/HC-UTK/{local_path}",
        "source_page": SOURCE_PAGE,
        "file_type": "pdf",
        "transfer_entries": transfer_entries,
        "transfer_entry_count": len(transfer_entries),
        "movement_scope": movement_scope,
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=== Uttarakhand HC Notification Fetcher ===\n")

    # Load existing notifications
    existing = json.loads(NOTIF_JSON.read_text(encoding="utf-8"))
    existing_ids = {e.get("id") for e in existing}

    new_entries = []

    for row in NOTIFICATIONS:
        local_path, cdn_path, date_iso, notif_num, title = row[:5]
        category = row[5] if len(row) > 5 else "Transfer / Posting"
        movement_scope = row[6] if len(row) > 6 else "district_judiciary"
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
        entry = build_entry(local_path, date_iso, notif_num, title, transfers, category, movement_scope)
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
