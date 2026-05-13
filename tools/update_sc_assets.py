#!/usr/bin/env python3
import html
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX_URL = "https://www.sci.gov.in/assets-of-judges/"
ALIASES = {
    "jamshed burjor pardiwala": "j b pardiwala",
    "s venkatanarayana bhatti": "sarasa venkatanarayana bhatti",
    "vipul m pancholi": "vipul manubhai pancholi",
}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8", errors="replace")


def clean_text(raw):
    raw = re.sub(r"<script\b.*?</script>", " ", raw, flags=re.I | re.S)
    raw = re.sub(r"<style\b.*?</style>", " ", raw, flags=re.I | re.S)
    raw = re.sub(r"<br\s*/?>", "\n", raw, flags=re.I)
    raw = re.sub(r"</(p|tr|td|th|li|h[1-6])>", "\n", raw, flags=re.I)
    raw = re.sub(r"<[^>]+>", " ", raw)
    text = html.unescape(raw)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def normalize_name(name):
    name = html.unescape(name)
    name = re.sub(r"\bHon.?ble\b|\bMr\.?\b|\bMrs\.?\b|\bMs\.?\b|\bDr\.?\b|Chief Justice of India", "", name, flags=re.I)
    name = re.sub(r"\bJustice\b", "", name, flags=re.I)
    name = re.sub(r"[^A-Za-z ]+", " ", name)
    return re.sub(r"\s+", " ", name).strip().lower()


def rupee_values(text):
    values = []
    pattern = r"(?:Rs\.?|₹)\s*([0-9][0-9,]*(?:\.[0-9]+)?)(?:\s*(cr\.?|crores?|lakhs?|lacs?))?"
    for match in re.finditer(pattern, text, flags=re.I):
        raw = match.group(1).replace(",", "")
        unit = (match.group(2) or "").lower()
        amount = float(raw)
        if unit.startswith("cr") or unit.startswith("crore"):
            amount *= 10000000
        elif unit.startswith("lakh") or unit.startswith("lac"):
            amount *= 100000
        values.append(int(round(amount)))
    return values


def section_between(text, start, end_markers):
    start_match = re.search(start, text, flags=re.I)
    if not start_match:
        return ""
    rest = text[start_match.end():]
    end_positions = [m.start() for marker in end_markers for m in [re.search(marker, rest, flags=re.I)] if m]
    end = min(end_positions) if end_positions else len(rest)
    return rest[:end].strip()


def compact_excerpt(text, limit=900):
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit].rstrip() + ("..." if len(text) > limit else "")


def parse_index(html_text):
    rows = re.findall(
        r"<tr>\s*<td[^>]*>\s*\d+\s*</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>\s*<a[^>]+href=[\"']([^\"']+)[\"']",
        html_text,
        flags=re.I | re.S,
    )
    return [(clean_text(name), url) for name, url in rows]


def parse_asset_page(page_html):
    text = clean_text(page_html)
    title_match = re.search(r"Assets\s+[–-]\s+(.+?)(?:\n|PARTICULARS)", text, flags=re.I)
    declaration_text = text
    if "PARTICULARS / VALUE" in text:
      declaration_text = text.split("PARTICULARS / VALUE", 1)[1]
    if "Accessibility" in declaration_text:
      declaration_text = declaration_text.split("Accessibility", 1)[0]

    immovable_text = section_between(declaration_text, r"Real Estate\s*\(Immovable Property\)", [r"Investments", r"Movable Property", r"Liabilities"])
    investments_text = section_between(declaration_text, r"Investments", [r"Movable Property", r"Liabilities"])
    movable_text = section_between(declaration_text, r"Movable Property", [r"Liabilities"])
    family_lines = [
        line.strip() for line in declaration_text.splitlines()
        if re.search(r"spouse|daughter|son|dependent|joint family|HUF", line, flags=re.I)
    ]
    all_values = rupee_values(declaration_text)
    movable_values = rupee_values(investments_text + "\n" + movable_text)
    family_values = rupee_values("\n".join(family_lines))

    return {
        "total_value": sum(all_values) if all_values else None,
        "total_value_type": "Disclosed monetary amounts only; excludes unvalued real estate, jewellery and vehicles.",
        "movable": [{
            "label": "Investments and movable property",
            "owner": "Self/spouse/dependents as disclosed",
            "description": compact_excerpt((investments_text + " " + movable_text).strip()),
            "value": sum(movable_values) if movable_values else None
        }],
        "immovable": [{
            "label": "Real estate / immovable property",
            "owner": "Self/joint family/spouse/dependents as disclosed",
            "description": compact_excerpt(immovable_text),
            "value": None
        }],
        "family": [{
            "label": "Family and dependent entries",
            "owner": "Spouse/joint family/dependents as disclosed",
            "description": compact_excerpt(" ".join(family_lines)),
            "value": sum(family_values) if family_values else None
        }] if family_lines else [],
        "raw_title": title_match.group(1).strip() if title_match else ""
    }


def main():
    courts = json.load(open(ROOT / "data/courts.json", encoding="utf-8"))
    details_path = ROOT / "data/judge-details.json"
    details = json.load(open(details_path, encoding="utf-8"))
    details_by_id = {d["id"]: d for d in details}
    judges_by_name = {
        normalize_name(j["name"]): j
        for j in courts
        if j.get("type") == "supreme_court"
    }

    index_html = fetch(INDEX_URL)
    rows = parse_index(index_html)
    updated = 0
    for display_name, url in rows:
        key = normalize_name(display_name)
        key = ALIASES.get(key, key)
        judge = judges_by_name.get(key)
        if not judge:
            print(f"Unmatched: {display_name}")
            continue
        parsed = parse_asset_page(fetch(url))
        detail = details_by_id.get(judge["id"])
        if not detail:
            continue
        detail.setdefault("assets", {})
        detail["assets"].update({
            "currency": "INR",
            "source_url": url,
            "source_label": "Supreme Court asset declaration",
            "last_verified": "2026-05-13",
            "total_value": parsed["total_value"],
            "total_value_type": parsed["total_value_type"],
            "movable": parsed["movable"],
            "immovable": parsed["immovable"],
            "family": parsed["family"],
            "notes": "Official Supreme Court disclosure. Monetary total is computed from rupee amounts visible in the declaration text and does not estimate unvalued immovable property, jewellery, vehicles or other non-monetary declarations."
        })
        updated += 1

    with open(details_path, "w", encoding="utf-8") as f:
        json.dump(details, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"Updated {updated} Supreme Court asset declarations")


if __name__ == "__main__":
    main()
