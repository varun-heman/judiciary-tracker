#!/usr/bin/env python3
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
FILES = [
    ROOT / "data" / "courts.json",
    ROOT / "data" / "admin-staff.json",
    ROOT / "data" / "ministries.json",
    ROOT / "data" / "notifications.json",
]

BAD_PATTERNS = [
    r"Consequential",
    r"Lordship",
    r"Judicial Officers working",
    r"Posting Effec",
    r"\bEffec\b",
    r"\b(Judge|Magistrate|Court|Posting|Additional|Principal|District|Civil)\b.*\[GJ",
]


def suspect_name(name):
    if not name:
        return False
    if len(name) > 110:
        return True
    if name.count("[GJ") > 1:
        return True
    return any(re.search(pattern, name, re.I) for pattern in BAD_PATTERNS)


def main():
    bad = []
    for path in FILES:
        rows = json.loads(path.read_text())
        for row in rows:
            if suspect_name(row.get("name", "")):
                bad.append((path.name, row.get("id"), row["name"]))
            for entry in row.get("transfer_entries", []):
                if suspect_name(entry.get("person_name", "")):
                    bad.append((path.name, entry.get("id"), entry["person_name"]))

    if bad:
        for filename, item_id, name in bad:
            print(f"{filename}: {item_id}: {name}")
        print(f"\n{name} suspect names found.")
        return 1
    print("No suspect names found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
