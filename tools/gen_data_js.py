#!/usr/bin/env python3
"""
Run this script from the india-judiciary-tracker/ folder after editing JSON data:
    python3 tools/gen_data_js.py
It regenerates data/data.js so the site works when opened directly (no server needed).
"""
import json
import os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

with open(os.path.join(root, 'data', 'courts.json'), encoding='utf-8') as f:
    courts = json.load(f)

with open(os.path.join(root, 'data', 'ministries.json'), encoding='utf-8') as f:
    ministries = json.load(f)

js = f"""// AUTO-GENERATED - do not edit directly.
// Edit data/courts.json or data/ministries.json, then re-run: python3 tools/gen_data_js.py
window.COURTS_DATA = {json.dumps(courts, indent=2, ensure_ascii=False)};
window.MINISTRIES_DATA = {json.dumps(ministries, indent=2, ensure_ascii=False)};
"""

out = os.path.join(root, 'data', 'data.js')
with open(out, 'w', encoding='utf-8') as f:
    f.write(js)

print(f"Regenerated {out} ({len(courts)} court records, {len(ministries)} ministry records)")
