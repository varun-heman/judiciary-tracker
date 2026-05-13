#!/usr/bin/env python3
"""
Download official person photos into local assets and rewrite JSON photo_url values.

Naming convention:
  assets/photos/<person-id>/portrait.<ext>

The original remote URL is preserved as photo_original_url.
Run from india-judiciary-tracker/:
  python3 tools/fetch_photos.py
"""
import json
import mimetypes
import os
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA_FILES = [
    ROOT / "data" / "courts.json",
    ROOT / "data" / "admin-staff.json",
    ROOT / "data" / "ministries.json",
]
PHOTO_ROOT = ROOT / "assets" / "photos"


def extension_for(url, content_type):
    parsed = urlparse(url)
    suffix = Path(parsed.path).suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".webp"}:
      return ".jpg" if suffix == ".jpeg" else suffix
    guessed = mimetypes.guess_extension((content_type or "").split(";")[0].strip())
    if guessed in {".jpg", ".jpeg", ".png", ".webp"}:
      return ".jpg" if guessed == ".jpeg" else guessed
    return ".jpg"


def download(url):
    req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(req, timeout=30) as response:
        body = response.read()
        content_type = response.headers.get("Content-Type", "")
    return body, extension_for(url, content_type)


def main():
    PHOTO_ROOT.mkdir(parents=True, exist_ok=True)
    total = 0
    downloaded = 0
    skipped = 0
    failed = []

    for data_file in DATA_FILES:
        rows = json.loads(data_file.read_text(encoding="utf-8"))
        changed = False

        for row in rows:
            person_id = row.get("id")
            photo_url = row.get("photo_url", "")
            original_url = row.get("photo_original_url") or photo_url

            if not person_id or not original_url.startswith("http"):
                continue

            total += 1
            person_dir = PHOTO_ROOT / person_id
            person_dir.mkdir(parents=True, exist_ok=True)

            existing = sorted(person_dir.glob("portrait.*"))
            if existing:
                local = existing[0]
                row["photo_original_url"] = original_url
                row["photo_url"] = local.relative_to(ROOT).as_posix()
                skipped += 1
                changed = True
                continue

            try:
                body, ext = download(original_url)
                local = person_dir / f"portrait{ext}"
                local.write_bytes(body)
                row["photo_original_url"] = original_url
                row["photo_url"] = local.relative_to(ROOT).as_posix()
                downloaded += 1
                changed = True
            except Exception as exc:
                failed.append((person_id, original_url, str(exc)))

        if changed:
            data_file.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"photo urls found: {total}")
    print(f"downloaded: {downloaded}")
    print(f"already local: {skipped}")
    if failed:
        print("failed:")
        for person_id, url, error in failed:
            print(f"  {person_id}: {url} ({error})")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
