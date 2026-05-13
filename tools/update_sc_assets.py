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


def clean_item(text, limit=240):
    text = re.sub(r"\s+", " ", text).strip(" -–;,.")
    text = re.sub(r"\b(?:NIL|-NA-)\b", "", text, flags=re.I).strip(" -–;,.")
    if not text:
        return ""
    return text[:limit].rstrip() + ("..." if len(text) > limit else "")


def split_asset_items(text):
    text = re.sub(r"See\s*:\s*Sl\.\s*No\.[^.]+", " ", text, flags=re.I)
    text = re.sub(r"(?:SELF/JOINT FAMILY|SPOUSE/JOINT FAMILY|DEPENDENT\(S\), IF ANY)", " ", text, flags=re.I)
    parts = re.split(r"(?=\b\d+\.\s+|\([a-z]\)\s+)", text)
    items = []
    for part in parts:
        item = clean_item(part)
        if item and not re.fullmatch(r"(?:nil|na|-)+", item, flags=re.I):
            items.append(item)
    return items


def amount_contexts(text):
    pattern = r"(?:Rs\.?|₹)\s*[0-9][0-9,]*(?:\.[0-9]+)?(?:\s*(?:cr\.?|crores?|lakhs?|lacs?))?"
    seen = set()
    items = []
    candidates = split_asset_items(text)
    if not candidates:
        candidates = re.split(r"(?<=[.;])\s+", text)
    for candidate in candidates:
        if not re.search(pattern, candidate, flags=re.I):
            continue
        marker = re.search(r"(?:Investments\s+)?Shares\s*/\s*Mutual|FDRs?\s*:", candidate, flags=re.I)
        if marker and marker.start() > 0:
            candidate = candidate[marker.start():]
        candidate = re.split(r"\s+Movable\s+Property\s+", candidate, maxsplit=1, flags=re.I)[0]
        candidate = re.split(r"\s+Real\s+Estate\s+", candidate, maxsplit=1, flags=re.I)[0]
        context = clean_item(candidate, 260)
        key = re.sub(r"\s+", " ", context.lower())
        if context and key not in seen:
            seen.add(key)
            items.append(context)
    return items


def metal_weight(text, metal):
    total_g = 0.0
    patterns = [
        rf"{metal}[^\n]{{0,60}}?([0-9][0-9,.]*)\s*(kgs?|kilograms?|gms?|grams?)",
        rf"([0-9][0-9,.]*)\s*(kgs?|kilograms?|gms?|grams?)\s+{metal}",
    ]
    for pattern in patterns:
        for amount, unit in re.findall(pattern, text, flags=re.I):
            value = float(amount.replace(",", ""))
            if unit.lower().startswith(("kg", "kilogram")):
                value *= 1000
            total_g += value
    return round(total_g)


def acres_total(text):
    total = 0.0
    for raw in re.findall(r"([0-9][0-9,.]*)\s*(?:&\s*half\s*)?acres?", text, flags=re.I):
        total += float(raw.replace(",", ""))
    for raw in re.findall(r"([0-9][0-9,.]*)\s*&\s*half\s+acres?", text, flags=re.I):
        total += 0.5
    return round(total, 2)


def vehicle_items(text):
    brand_pattern = r"(?:Volkswagen|Honda|Toyota|Maruti|Mahindra|Hyundai|Tata|Ford|Renault|Skoda|Kia|BMW|Mercedes|Audi|Scooter|Motor\s*cycle|Motorcycle)[^.;\n]*"
    items = []
    for match in re.finditer(brand_pattern, text, flags=re.I):
        item = clean_item(match.group(0), 180)
        if item and not re.search(r"\bnil\b", item, flags=re.I):
            items.append(item)
    if items:
        return list(dict.fromkeys(items))
    for part in re.split(r"(?=Vehicle\s*:|Car\s*:|Motor\s+)", text, flags=re.I):
        if re.match(r"\s*(?:vehicle|car|motor)", part, flags=re.I):
            item = clean_item(part, 180)
            if item and not re.search(r"vehicle\s*:\s*nil|car\s*:\s*nil", item, flags=re.I):
                items.append(item)
    return list(dict.fromkeys(items))


def jewellery_items(text):
    items = []
    for metal in ("gold", "silver"):
        grams = metal_weight(text, metal)
        if grams:
            amount = f"{grams / 1000:g} kg" if grams >= 1000 else f"{grams:g} g"
            items.append(f"{amount} {metal}")
    if items:
        return list(dict.fromkeys(items))
    for part in re.split(r"(?=Jewellery\s*:|Gold|Silver|Ornaments|Watch)", text, flags=re.I):
        if re.match(r"\s*(?:jewellery|gold|silver|ornaments|watch)", part, flags=re.I):
            item = clean_item(part, 200)
            if item and not re.search(r"jewellery\s*:\s*nil", item, flags=re.I):
                items.append(item)
    return list(dict.fromkeys(items))


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
    movable_block = investments_text + "\n" + movable_text
    movable_values = rupee_values(movable_block)
    family_values = rupee_values("\n".join(family_lines))
    money_items = amount_contexts(movable_block)
    property_items = split_asset_items(immovable_text)
    land_items = [item for item in property_items if re.search(r"acre|agricultural|land|bigha", item, flags=re.I)]
    residential_items = [item for item in property_items if item not in land_items]
    jewellery = jewellery_items(movable_text)
    vehicles = vehicle_items(movable_text)
    gold_g = metal_weight(movable_text, "gold")
    silver_g = metal_weight(movable_text, "silver")
    acres = acres_total(immovable_text)
    real_estate_count = len([item for item in property_items if re.search(r"house|apartment|flat|bungalow|plot|property|land|acre|bigha", item, flags=re.I)])

    return {
        "total_value": sum(all_values) if all_values else None,
        "total_value_type": "Disclosed monetary amounts only; excludes unvalued real estate, jewellery and vehicles.",
        "metrics": {
            "monetary_total": sum(all_values) if all_values else None,
            "gold_grams": gold_g or None,
            "silver_grams": silver_g or None,
            "vehicles_count": len(vehicles),
            "real_estate_count": real_estate_count,
            "land_acres": acres or None
        },
        "movable": [{
            "category": "money",
            "emoji": "💰",
            "label": "Money, deposits and investments",
            "owner": "Self/spouse/dependents as disclosed",
            "description": "Bank balances, FDRs, GPF/PPF, insurance, securities and similar monetary assets disclosed in the declaration.",
            "items": money_items[:10],
            "value": sum(movable_values) if movable_values else None
        }, {
            "category": "jewellery",
            "emoji": "🏅",
            "label": "Jewellery and valuables",
            "owner": "Self/spouse/dependents as disclosed",
            "description": "Gold, silver, watches and other valuables where declared.",
            "items": jewellery[:10],
            "value": None,
            "gold_grams": gold_g or None,
            "silver_grams": silver_g or None
        }, {
            "category": "vehicles",
            "emoji": "🚗",
            "label": "Vehicles",
            "owner": "Self/spouse/dependents as disclosed",
            "description": "Cars or other vehicles where declared.",
            "items": vehicles[:8],
            "value": None,
            "count": len(vehicles)
        }],
        "immovable": [{
            "category": "property",
            "emoji": "🏠",
            "label": "Homes, flats, plots and buildings",
            "owner": "Self/joint family/spouse/dependents as disclosed",
            "description": "Residential and built-property interests listed in the declaration.",
            "items": residential_items[:12],
            "value": None
        }, {
            "category": "land",
            "emoji": "🌾",
            "label": "Agricultural / landed property",
            "owner": "Self/joint family/spouse/dependents as disclosed",
            "description": "Agricultural land and other land interests listed in the declaration.",
            "items": land_items[:12],
            "value": None,
            "acres": acres or None
        }],
        "family": [{
            "category": "family",
            "emoji": "👪",
            "label": "Family and dependent entries",
            "owner": "Spouse/joint family/dependents as disclosed",
            "description": "Family, HUF, spouse and dependent references visible in the public declaration.",
            "items": [clean_item(line, 220) for line in family_lines if clean_item(line, 220)][:12],
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
            "metrics": parsed["metrics"],
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
