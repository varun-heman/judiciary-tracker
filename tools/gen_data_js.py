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

with open(os.path.join(root, 'data', 'admin-staff.json'), encoding='utf-8') as f:
    admin_staff = json.load(f)

with open(os.path.join(root, 'data', 'notifications.json'), encoding='utf-8') as f:
    notifications = json.load(f)

with open(os.path.join(root, 'data', 'notification-sources.json'), encoding='utf-8') as f:
    notification_sources = json.load(f)

js = f"""// AUTO-GENERATED - do not edit directly.
// Edit JSON files in data/, then re-run: python3 tools/gen_data_js.py
window.COURTS_DATA = {json.dumps(courts, indent=2, ensure_ascii=False)};
window.MINISTRIES_DATA = {json.dumps(ministries, indent=2, ensure_ascii=False)};
window.ADMIN_STAFF_DATA = {json.dumps(admin_staff, indent=2, ensure_ascii=False)};
window.NOTIFICATIONS_DATA = {json.dumps(notifications, indent=2, ensure_ascii=False)};
window.NOTIFICATION_SOURCES_DATA = {json.dumps(notification_sources, indent=2, ensure_ascii=False)};
"""

out = os.path.join(root, 'data', 'data.js')
with open(out, 'w', encoding='utf-8') as f:
    f.write(js)

print(
    f"Regenerated {out} "
    f"({len(courts)} court records, {len(ministries)} ministry records, "
    f"{len(admin_staff)} admin staff records, {len(notifications)} notifications)"
)
