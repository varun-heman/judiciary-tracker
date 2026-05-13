#!/usr/bin/env python3
"""
Update Allahabad High Court present judge records from the official service pages.

Sources:
  - https://www.allahabadhighcourt.in/service/judgeListSeni.jsp
  - https://www.allahabadhighcourt.in/service/judgeDetail.jsp?id={id}

Only the present Chief Justice and present judges listed on the service page are
added/updated. Former judges are not scraped.
"""
import html
import json
import re
import socket
import subprocess
import time
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import URLError
from urllib.parse import quote, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
COURTS_JSON = ROOT / "data" / "courts.json"
PHOTO_ROOT = ROOT / "assets" / "photos"
CACHE_ROOT = ROOT / ".cache" / "allahabad-hc"
BASE_URL = "https://www.allahabadhighcourt.in/service/"
LIST_URL = urljoin(BASE_URL, "judgeListSeni.jsp")
DETAIL_URL = urljoin(BASE_URL, "judgeDetail.jsp?id={id}")

socket.setdefaulttimeout(25)


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.in_a = False
        self.href = ""
        self.text = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "a":
            self.in_a = True
            self.href = attrs.get("href", "")
            self.text = []

    def handle_data(self, data):
        if self.in_a:
            self.text.append(data)

    def handle_endtag(self, tag):
        if tag == "a":
            label = clean_space("".join(self.text))
            match = re.search(r"judgeDetail\.jsp\?id=(\d+)", self.href)
            if match:
                self.links.append({"official_id": match.group(1), "list_label": label})
            self.in_a = False


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
    return clean_space(" ".join(parser.parts))


def clean_space(value):
    return " ".join((value or "").replace("\xa0", " ").split())


def fetch(url):
    last_error = None
    for attempt in range(1, 9):
        try:
            req = Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0",
                    "Connection": "close",
                    "Referer": LIST_URL,
                },
            )
            return urlopen(req, timeout=25).read().decode("utf-8", "replace")
        except Exception as exc:
            last_error = exc
            time.sleep(min(10, attempt * 1.5))
    raise URLError(last_error)


def fetch_list():
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_ROOT / "judgeListSeni.html"
    fallback = Path("/tmp/allahabad_judges.html")
    if cache_file.exists():
        page = cache_file.read_text(encoding="utf-8")
    elif fallback.exists():
        page = fallback.read_text(encoding="utf-8", errors="replace")
        cache_file.write_text(page, encoding="utf-8")
    else:
        page = fetch(LIST_URL)
        cache_file.write_text(page, encoding="utf-8")
    parser = LinkParser()
    parser.feed(page)
    chief_match = re.search(r"judgeDetail\.jsp\?id=(\d+).*?>Chief Justice<", page, re.S)
    if not chief_match:
        # The current page uses an onClick on a heading rather than a normal link.
        chief_match = re.search(r"Chief Justice[\s\S]{0,200}?judgeDetail\.jsp\?id=(\d+)", page)
    return chief_match.group(1) if chief_match else "381", parser.links


def parse_label(html_page, label):
    pattern = (
        r"<strong>\s*" + re.escape(label) + r"\s*</strong>[\s\S]*?</div>\s*"
        r'<div class="col-md-6[^"]*"[^>]*>\s*<p>([\s\S]*?)</p>'
    )
    match = re.search(pattern, html_page, re.I)
    return textify(match.group(1)) if match else ""


def parse_name(html_page):
    raw = parse_label(html_page, "Name")
    if not raw:
        match = re.search(r'<img[^>]+ALT="([^"]+)"', html_page, re.I)
        raw = textify(match.group(1)) if match else ""
    raw = re.sub(r"Member,\s*Administrative Committee.*$", "", raw, flags=re.I).strip()
    raw = re.sub(r"Chairman,\s*Administrative Committee.*$", "", raw, flags=re.I).strip()
    raw = re.sub(r"Administrative Judge for the District:.*$", "", raw, flags=re.I).strip()
    return normalize_judge_name(raw)


def normalize_judge_name(raw):
    name = html.unescape(raw or "").replace("\xa0", " ")
    name = re.sub(r"\(.*?\)", "", name)
    name = re.sub(r"^Hon[’']?ble\s+", "", name, flags=re.I).strip()
    name = re.sub(r"^(Mr\.?|Mrs\.?|Ms\.?)\s+", "", name, flags=re.I).strip()
    name = re.sub(r"^Dr\.\s+Justice", "Dr. Justice", name, flags=re.I)
    name = re.sub(r"^Justice\s+", "Justice ", name, flags=re.I)
    if not re.match(r"^(Justice|Dr\. Justice|Mrs\. Justice|Ms\. Justice)\b", name):
        name = "Justice " + name
    return clean_space(name)


def parse_image_url(html_page):
    match = re.search(r'<img[^>]+class="[^"]*\bjimg\b[^"]*"[^>]+src="([^"]+)"', html_page, re.I)
    return safe_url(urljoin("https://www.allahabadhighcourt.in", html.unescape(match.group(1)))) if match else ""


def safe_url(url):
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, quote(parts.path, safe="/%"), parts.query, parts.fragment))


def parse_date(value):
    value = clean_space(value)
    if not value:
        return ""
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y", "%d-%m-%y", "%d.%m.%y"):
        try:
            return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return ""


def parse_detail(official_id):
    url = DETAIL_URL.format(id=official_id)
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_ROOT / f"judgeDetail-{official_id}.html"
    if cache_file.exists():
        page = cache_file.read_text(encoding="utf-8")
    else:
        page = fetch(url)
        cache_file.write_text(page, encoding="utf-8")
    return {
        "official_id": official_id,
        "name": parse_name(page),
        "source": parse_label(page, "Source"),
        "date_of_birth": parse_date(parse_label(page, "Date of Birth")),
        "date_initial_appointment": parse_date(parse_label(page, "Initial Joining")),
        "date_assumed_role": parse_date(parse_label(page, "Joining at Allahabad")),
        "retirement_date": parse_date(parse_label(page, "Date of Retirement")),
        "sitting_at": parse_label(page, "Sitting at"),
        "email_prefix": parse_label(page, "E-mail Id"),
        "source_url": url,
        "photo_original_url": parse_image_url(page),
    }


def download_photo(person_id, url):
    if not url:
        return ""
    url = safe_url(url)
    person_dir = PHOTO_ROOT / person_id
    person_dir.mkdir(parents=True, exist_ok=True)
    local = person_dir / "portrait.jpg"
    if local.exists() and local.stat().st_size > 1000:
        return local.relative_to(ROOT).as_posix()
    for attempt in range(1, 5):
        try:
            body = urlopen(
                Request(url, headers={"User-Agent": "Mozilla/5.0", "Connection": "close"}),
                timeout=25,
            ).read()
            if len(body) > 1000:
                local.write_bytes(body)
                subprocess.run(["sips", "-Z", "900", str(local)], check=False, capture_output=True)
                return local.relative_to(ROOT).as_posix()
        except Exception:
            time.sleep(attempt * 2)
    print(f"Photo download failed for {person_id}: {url}", flush=True)
    return url


def make_record(detail, role, sequence):
    person_id = "HC-ALD-CJ" if role == "Chief Justice" else f"HC-ALD-{sequence:03d}"
    photo_url = download_photo(person_id, detail["photo_original_url"])
    notes = []
    if detail["sitting_at"]:
        notes.append(f"Sitting at {detail['sitting_at']}.")
    if detail["source"]:
        notes.append(f"Source: {detail['source']}.")
    if detail["email_prefix"]:
        notes.append("Email prefix published on official profile; domain is rendered as an image on source page.")
    return {
        "id": person_id,
        "name": detail["name"],
        "court": "Allahabad High Court",
        "state": "Uttar Pradesh",
        "role": role,
        "type": "high_court",
        "date_initial_appointment": detail["date_initial_appointment"],
        "date_assumed_role": detail["date_assumed_role"],
        "retirement_date": detail["retirement_date"],
        "parent_high_court": detail["source"] if detail["source"] not in {"Bar", "Service"} else "",
        "parent_id": "HC-ALD",
        "notes": " ".join(notes),
        "photo_url": photo_url,
        "photo_source": "Allahabad High Court",
        "photo_original_url": detail["photo_original_url"],
        "source_url": detail["source_url"],
        "source_label": "Allahabad HC judge profile",
        "date_of_birth": detail["date_of_birth"],
    }


def main():
    print("Fetching Allahabad HC present judge list...", flush=True)
    chief_id, links = fetch_list()
    print(f"Present judge links found: {len(links)}")
    if len(links) < 50:
        raise SystemExit("Too few present judges found; refusing to update.")

    rows = json.loads(COURTS_JSON.read_text(encoding="utf-8"))
    existing_by_id = {row.get("id"): row for row in rows}

    chief_detail = parse_detail(chief_id)
    new_records = [make_record(chief_detail, "Chief Justice", 0)]

    for index, link in enumerate(links, 1):
        print(f"{index:03d}/{len(links)} {link['official_id']} {link['list_label']}", flush=True)
        detail = parse_detail(link["official_id"])
        new_records.append(make_record(detail, "Judge", index))

    for record in new_records:
        if record["id"] in existing_by_id:
            existing_by_id[record["id"]].update(record)

    existing_ids = {record["id"] for record in new_records}
    rows = [
        row for row in rows
        if not (row.get("parent_id") == "HC-ALD" and row.get("type") == "high_court" and row.get("id") not in existing_ids)
    ]

    institution_index = next(i for i, row in enumerate(rows) if row.get("id") == "HC-ALD")
    existing_rows = {row.get("id"): row for row in rows}
    for record in reversed(new_records):
        if record["id"] not in existing_rows:
            rows.insert(institution_index + 1, record)

    COURTS_JSON.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Updated Allahabad HC records: {len(new_records)} including Chief Justice")


if __name__ == "__main__":
    main()
