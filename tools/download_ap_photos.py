#!/usr/bin/env python3
"""
Download local Andhra Pradesh HC judge and registry staff photos.

Sources:
  - Judges: https://aphc.gov.in/profiles.php
  - Registry: https://aphc.gov.in/registry.php
"""
import json
import re
import time
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PHOTO_ROOT = ROOT / "assets" / "photos"
COURTS_JSON = ROOT / "data" / "courts.json"
ADMIN_JSON = ROOT / "data" / "admin-staff.json"
AP_BASE = "https://aphc.gov.in/"
REGISTRY_URL = urljoin(AP_BASE, "registry.php")

STAFF_IMAGE_MAP = {
    "ADMIN-AP-001": "images/300920241657596.png",
    "ADMIN-AP-002": "images/30092024165759.png",
    "ADMIN-AP-003": "images/30092024174222.png",
    "ADMIN-AP-004": "images/02102024112911.png",
    "ADMIN-AP-005": "images/01102024101259.png",
}


def download(url, local):
    local.parent.mkdir(parents=True, exist_ok=True)
    if local.exists() and local.stat().st_size > 1000:
        return False
    req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(req, timeout=30) as response:
        body = response.read()
    if len(body) <= 1000:
        raise RuntimeError(f"Downloaded file too small from {url}")
    local.write_bytes(body)
    return True


def set_photo(row, original_url, ext):
    local = PHOTO_ROOT / row["id"] / f"portrait{ext}"
    downloaded = download(original_url, local)
    row["photo_original_url"] = original_url
    row["photo_url"] = local.relative_to(ROOT).as_posix()
    row["photo_source"] = "Andhra Pradesh High Court"
    return downloaded


def update_judges():
    rows = json.loads(COURTS_JSON.read_text(encoding="utf-8"))
    total = downloaded = 0
    for row in rows:
        if row.get("parent_id") != "HC-AP" or row.get("type") != "high_court":
            continue
        original = row.get("photo_original_url") or row.get("photo_url")
        if not original or not original.startswith("http"):
            continue
        total += 1
        # AP serves these image URLs as JPEG bytes even when the remote path ends
        # with .webp, so keep the local extension honest for static hosting.
        if set_photo(row, original, ".jpg"):
            downloaded += 1
        time.sleep(0.1)
    COURTS_JSON.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"AP judge photos: {downloaded} downloaded, {total - downloaded} already local")


def update_staff():
    rows = json.loads(ADMIN_JSON.read_text(encoding="utf-8"))
    total = downloaded = 0
    for row in rows:
        rel = STAFF_IMAGE_MAP.get(row.get("id"))
        if not rel:
            continue
        total += 1
        original = urljoin(AP_BASE, rel)
        if set_photo(row, original, ".png"):
            downloaded += 1
        if row.get("id") == "ADMIN-AP-003":
            row["role_group"] = "Registrar Recruitment"
            row["designation"] = "Registrar (Recruitment)"
        time.sleep(0.1)
    ADMIN_JSON.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"AP registry photos: {downloaded} downloaded, {total - downloaded} already local")


def main():
    update_judges()
    update_staff()


if __name__ == "__main__":
    main()
