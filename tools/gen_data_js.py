#!/usr/bin/env python3
"""
Run this script from the india-judiciary-tracker/ folder after editing any CSV:
    python3 tools/gen_data_js.py
It regenerates data/data.js so the site works when opened directly (no server needed).
"""
import os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def esc(s):
    return s.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')

with open(os.path.join(root, 'data', 'courts.csv'))     as f: courts = f.read()
with open(os.path.join(root, 'data', 'ministries.csv')) as f: ministries = f.read()

js = f"""// AUTO-GENERATED — do not edit directly.
// Edit data/courts.csv or data/ministries.csv, then re-run: python3 tools/gen_data_js.py
window.COURTS_CSV_EMBEDDED = `{esc(courts)}`;
window.MINISTRIES_CSV_EMBEDDED = `{esc(ministries)}`;
"""

out = os.path.join(root, 'data', 'data.js')
with open(out, 'w') as f: f.write(js)
print(f"✓ Regenerated {out} ({len(js):,} chars)")
