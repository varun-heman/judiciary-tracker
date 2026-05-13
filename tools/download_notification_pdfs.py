#!/usr/bin/env python3
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / "tmp" / "notification-pdfs"
CACHE.mkdir(parents=True, exist_ok=True)

notifications = json.loads((ROOT / "data" / "notifications.json").read_text())

for item in notifications:
    url = item.get("url", "")
    if not url.lower().split("?")[0].endswith(".pdf"):
        continue
    path = CACHE / f"{item['id']}.pdf"
    if path.exists() and path.stat().st_size > 1024:
        print(f"skip {item['id']} {path.stat().st_size}")
        continue
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            data = response.read()
        path.write_bytes(data)
        print(f"saved {item['id']} {len(data)}")
    except Exception as exc:
        print(f"failed {item['id']} {exc}")
