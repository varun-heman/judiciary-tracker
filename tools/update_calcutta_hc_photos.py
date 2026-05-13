#!/usr/bin/env python3
"""
Download portrait photos for all Calcutta HC judges.
Photos are served at https://www.calcuttahighcourt.gov.in/Judge-Photo/{id}

Run from the repo root:
    python3 tools/update_calcutta_hc_photos.py

Requires: requests  (pip install requests)
"""
import time
import json
from pathlib import Path

try:
    import requests
except ImportError:
    print("pip install requests first")
    raise

PHOTO_MAP = {
    "HC-CAL-CJ":  295,
    "HC-CAL-001": 43,
    "HC-CAL-002": 45,
    "HC-CAL-003": 46,
    "HC-CAL-004": 288,
    "HC-CAL-005": 56,
    "HC-CAL-006": 58,
    "HC-CAL-007": 61,
    "HC-CAL-008": 159,
    "HC-CAL-009": 160,
    "HC-CAL-010": 161,
    "HC-CAL-011": 164,
    "HC-CAL-012": 166,
    "HC-CAL-013": 171,
    "HC-CAL-014": 173,
    "HC-CAL-015": 175,
    "HC-CAL-016": 174,
    "HC-CAL-017": 178,
    "HC-CAL-018": 180,
    "HC-CAL-019": 184,
    "HC-CAL-020": 185,
    "HC-CAL-021": 190,
    "HC-CAL-022": 192,
    "HC-CAL-023": 294,
    "HC-CAL-024": 285,
    "HC-CAL-025": 267,
    "HC-CAL-026": 268,
    "HC-CAL-027": 270,
    "HC-CAL-028": 272,
    "HC-CAL-029": 276,
    "HC-CAL-030": 282,
    "HC-CAL-031": 275,
    "HC-CAL-032": 277,
    "HC-CAL-033": 278,
    "HC-CAL-034": 279,
    "HC-CAL-035": 280,
    "HC-CAL-036": 281,
    "HC-CAL-037": 283,
    "HC-CAL-038": 289,
    "HC-CAL-039": 290,
    "HC-CAL-040": 291,
    "HC-CAL-041": 292,
}

BASE = "https://www.calcuttahighcourt.gov.in"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": BASE + "/",
    "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
}


def main():
    ok, skip, fail = 0, 0, 0
    session = requests.Session()
    session.headers.update(HEADERS)

    for judge_id, photo_num in PHOTO_MAP.items():
        dest = Path(f"assets/photos/{judge_id}/portrait.jpg")
        dest.parent.mkdir(parents=True, exist_ok=True)

        if dest.exists() and dest.stat().st_size > 1000:
            skip += 1
            continue

        url = f"{BASE}/Judge-Photo/{photo_num}"
        try:
            r = session.get(url, timeout=15)
            r.raise_for_status()
            content_type = r.headers.get("content-type", "")
            if "image" not in content_type and len(r.content) < 500:
                print(f"  SKIP {judge_id}: unexpected content-type {content_type}")
                fail += 1
                continue
            dest.write_bytes(r.content)
            print(f"  OK   {judge_id}  ({len(r.content):,} bytes)")
            ok += 1
            time.sleep(0.4)
        except Exception as e:
            print(f"  FAIL {judge_id} ({photo_num}): {e}")
            fail += 1

    print(f"\nDone: {ok} downloaded, {skip} already present, {fail} failed")


if __name__ == "__main__":
    main()
