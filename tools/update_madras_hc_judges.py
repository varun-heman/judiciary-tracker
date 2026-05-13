#!/usr/bin/env python3
"""
Update Madras High Court judge records from the official present judges page.

The Madras HC page keeps judge profiles inline and serves photos through
admin/view_image.php. This script updates data/courts.json with official
photo URLs, source links, and parsed dates of birth where available.
"""
import html
import json
import re
import subprocess
import time
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
COURTS_JSON = ROOT / "data" / "courts.json"
PHOTO_ROOT = ROOT / "assets" / "photos"
SOURCE_URL = "https://hcmadras.tn.gov.in/present_judges.php"


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def textify(value):
    value = value or ""
    for _ in range(2):
        value = html.unescape(value)
    parser = TextExtractor()
    parser.feed(value)
    return " ".join(" ".join(parser.parts).split())


def fetch_html():
    for attempt in range(1, 6):
        result = subprocess.run(
            [
                "curl",
                "-L",
                SOURCE_URL,
                "-H",
                "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
                "-H",
                "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "--compressed",
                "--silent",
                "--show-error",
                "--max-time",
                "30",
            ],
            check=True,
            capture_output=True,
        )
        page = result.stdout.decode("utf-8", "replace")
        if page.count("prof_pic") >= 40:
            return page
        time.sleep(attempt)
    raise RuntimeError("Madras HC page fetched but did not contain the expected judge entries")


ENTRY_RE = re.compile(
    r'<a[^>]+class="prof_pic"[\s\S]*?'
    r'data-content="(.*?)"[\s\S]*?'
    r'<img[^>]+src="([^"]+)"[^>]+alt="([^"]+)"[\s\S]*?'
    r'</a>[\s\S]*?<div class="jname_text">([\s\S]*?)</div>',
    re.S,
)


def parse_entries(page):
    entries = []
    for match in ENTRY_RE.finditer(page):
        profile_html, image_src, alt, name_html = match.groups()
        name = textify(name_html) or textify(alt)
        profile_text = textify(profile_html)
        entries.append(
            {
                "official_name": name,
                "profile_text": profile_text,
                "photo_original_url": urljoin(SOURCE_URL, html.unescape(image_src)),
                "date_of_birth": parse_dob(profile_text),
            }
        )
    return entries


def parse_dob(text):
    # Prefer explicitly labelled dates where the profile has multiple dates.
    labelled_patterns = [
        r"DOB as per records\s*[:\-]?\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})",
        r"Date of Birth\s*(?:Born on)?\s*[:\-]?\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})",
        r"DATE OF BIRTH\s*([0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+[0-9]{4})",
        r"Date of Birth\s*(?:Born on)?\s*[:\-]?\s*([0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+[0-9]{4})",
        r"Date of Birth\s*(?:Born on)?\s*[:\-]?\s*([A-Za-z]+\s+[0-9]{1,2}(?:st|nd|rd|th)?,?\s+[0-9]{4})",
    ]
    generic_patterns = [
        r"was born on\s+([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})",
        r"born on\s+([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})",
        r"born on\s+([0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+[0-9]{4})",
        r"born on\s+([A-Za-z]+\s+[0-9]{1,2}(?:st|nd|rd|th)?,?\s+[0-9]{4})",
    ]
    for pattern in labelled_patterns + generic_patterns:
        match = re.search(pattern, text, re.I)
        if match:
            parsed = normalize_date(match.group(1))
            if parsed:
                return parsed
    return ""


def normalize_date(value):
    value = re.sub(r"(\d)(st|nd|rd|th)", r"\1", value.strip(), flags=re.I)
    value = value.replace(",", "")
    for fmt in ("%d.%m.%Y", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%y", "%d-%m-%y", "%d/%m/%y",
                "%d %B %Y", "%d %b %Y", "%B %d %Y", "%b %d %Y"):
        try:
            return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return ""


def madras_sort_key(row):
    if row["id"] == "HC-MAD-CJ":
        return -1
    match = re.match(r"HC-MAD-(\d+)$", row["id"])
    return int(match.group(1)) if match else 999


def download_photo(person_id, url):
    person_dir = PHOTO_ROOT / person_id
    person_dir.mkdir(parents=True, exist_ok=True)
    local = person_dir / "portrait.jpg"
    if local.exists() and local.stat().st_size > 1000:
        return local.relative_to(ROOT).as_posix(), False

    subprocess.run(
        [
            "curl",
            "-L",
            url,
            "-H",
            "User-Agent: Mozilla/5.0",
            "--fail",
            "--silent",
            "--show-error",
            "--max-time",
            "20",
            "--retry",
            "2",
            "--output",
            str(local),
        ],
        check=True,
    )
    return local.relative_to(ROOT).as_posix(), True


def main():
    rows = json.loads(COURTS_JSON.read_text(encoding="utf-8"))
    entries = parse_entries(fetch_html())
    judges = sorted(
        [
            row
            for row in rows
            if row.get("parent_id") == "HC-MAD" and row.get("type") == "high_court"
        ],
        key=madras_sort_key,
    )

    if len(entries) != len(judges):
        raise SystemExit(f"Official entries ({len(entries)}) do not match local records ({len(judges)})")

    updated_dob = 0
    updated_photos = 0
    downloaded_photos = 0
    failed_photos = []
    for row, entry in zip(judges, entries):
        row["source_url"] = SOURCE_URL
        row["source_label"] = "Madras HC present judges page"
        row["photo_source"] = "Madras High Court"
        row["photo_original_url"] = entry["photo_original_url"]
        try:
            local_photo, downloaded = download_photo(row["id"], entry["photo_original_url"])
            row["photo_url"] = local_photo
            updated_photos += 1
            if downloaded:
                downloaded_photos += 1
        except subprocess.CalledProcessError as exc:
            failed_photos.append((row["id"], row["name"], entry["photo_original_url"], exc.returncode))

        if entry["date_of_birth"] and row.get("date_of_birth") != entry["date_of_birth"]:
            row["date_of_birth"] = entry["date_of_birth"]
            updated_dob += 1

    COURTS_JSON.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Madras HC official entries parsed: {len(entries)}")
    print(f"Local photo URLs updated: {updated_photos}")
    print(f"Photos downloaded: {downloaded_photos}")
    print(f"Dates of birth updated: {updated_dob}")
    if failed_photos:
        print("Photo downloads failed:")
        for person_id, name, url, code in failed_photos:
            print(f"  {person_id} {name}: curl exit {code} ({url})")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
