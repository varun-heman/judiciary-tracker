#!/usr/bin/env python3
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
TEXT_DIR = ROOT / "tmp" / "notification-texts"
DATA = ROOT / "data" / "notifications.json"


def clean(value):
    value = re.sub(r"\s+", " ", value or "").strip(" .;:-")
    value = value.replace(" ,", ",")
    return value


def iso_date(value):
    if not value:
        return ""
    m = re.search(r"(\d{1,2})[-/](\d{1,2})[-/](\d{4})", value)
    if not m:
        return ""
    day, month, year = m.groups()
    return f"{year}-{int(month):02d}-{int(day):02d}"


def role_from_position(position):
    position = clean(position)
    if not position:
        return ""
    stop_words = [" at ", ", District ", ", J&K", ", Jammu", ", Srinagar", " vice ", " against "]
    idxs = [position.find(word) for word in stop_words if position.find(word) > 0]
    if idxs:
        return position[:min(idxs)].strip(" ,")
    return position.split(",")[0].strip()


def make_entry(notification_id, idx, name, from_position, to_position, effective_date="", role_type="Judicial Officer", notes=""):
    return {
        "id": f"{notification_id}-T{idx:03d}",
        "person_name": clean(name),
        "role_type": role_type,
        "from_position": clean(from_position),
        "to_position": clean(to_position),
        "assumed_role": role_from_position(to_position),
        "effective_date": effective_date,
        "notes": clean(notes),
    }


def gujarat_effective_date(text):
    m = re.search(r"effective date of taking charge.*?shall be\s+(\d{1,2}[-/]\d{1,2}[-/]\d{4})", text, re.I | re.S)
    return iso_date(m.group(1)) if m else ""


def gujarat_role_type(notification_id, text):
    label = f"{notification_id} {text[:1200]}".lower()
    if "district judge" in label:
        return "District Judge"
    if "senior civil judge" in label:
        return "Senior Civil Judge"
    if "civil judge" in label:
        return "Civil Judge"
    return "Judicial Officer"


def parse_gujarat_table(notification_id, text):
    effective_date = gujarat_effective_date(text)
    role_type = gujarat_role_type(notification_id, text)
    entries = []
    cur = None

    for line in text.splitlines():
        if re.search(r"By order|Copy for information|The High Court of Gujarat,", line):
            if cur:
                entries.append(cur)
            break
        if (
            "Notification - Transfer" in line
            or line.strip().startswith("Judicial Officer")
            or line.strip().startswith("[JO Code]")
            or "Present Posting" in line
            or "Present Place" in line
            or "Transferred & Posted" in line
            or "Posted as" in line
        ):
            continue

        m = re.match(r"^\s*(\d{1,3})\s{2,}(.*)$", line)
        if m:
            if cur:
                entries.append(cur)
            cur = {"sr": m.group(1), "name": [], "from": [], "to": []}
            cur["name"].append(line[7:39].strip())
            cur["from"].append(line[39:82].strip())
            cur["to"].append(line[82:].strip())
        elif cur and line.strip():
            cur["name"].append(line[7:39].strip())
            cur["from"].append(line[39:82].strip())
            cur["to"].append(line[82:].strip())

    output = []
    for i, row in enumerate(entries, 1):
        name = clean(" ".join(row["name"]))
        from_position = clean(" ".join(row["from"]))
        to_position = clean(" ".join(row["to"]))
        if not name or not to_position or len(name) < 3:
            continue
        row_effective = effective_date
        inline_date = iso_date(to_position)
        if inline_date:
            row_effective = inline_date
        output.append(make_entry(notification_id, i, name, from_position, to_position, row_effective, role_type))
    return output


def parse_gujarat_feb_ocr(notification_id, text):
    return [
        make_entry(
            notification_id,
            1,
            "Mr. Tarun Mohandas Shrimali [GJ01306]",
            "5th Additional Senior Civil Judge and Additional Chief Judicial Magistrate, Junagadh",
            "Additional Senior Civil Judge and Additional Chief Judicial Magistrate, Keshod, District Junagadh",
            "2026-03-02",
            "Senior Civil Judge",
        )
    ]


def parse_jkl_numbered(notification_id, text):
    body = re.split(r"\bNote:|\bBy Order", text, maxsplit=1)[0]
    chunks = re.split(r"\n\s*(?:\d{1,2}|[ivx]{1,4})[.)]\s+", "\n" + body, flags=re.I)[1:]
    entries = []
    for chunk in chunks:
        chunk = clean(chunk)
        m = re.search(
            r"^(Shri|Ms\.?|Mrs\.?|Smt\.?)\s+(.+?),\s+(.+?)\s+(?:is|are)\s+(?:transferred|repatriated|cosrerred|tran\s*sferred).*?posted as\s+(.+?)(?:\.|;|$)",
            chunk,
            re.I,
        )
        if not m:
            continue
        name = f"{m.group(1)} {m.group(2)}"
        from_position = m.group(3)
        to_position = m.group(4)
        effective = iso_date(chunk)
        entries.append(make_entry(notification_id, len(entries) + 1, name, from_position, to_position, effective, "Judicial Officer"))
    return entries


def parse_jkl_registry_posting(notification_id, text):
    rows = [
        ("Naseer Ahmad Dar", "", "Director, J&K Judicial Academy", "District Judge"),
        ("Ajay Kumar Gupta", "", "Registrar Inspection, Srinagar", "District Judge"),
        ("Faizan Ul Haq Iqbal", "", "Registrar Rules", "District Judge"),
        ("Ms. Swati Gupta", "", "Registrar Judicial Jammu", "District Judge"),
        ("Umesh Sharma", "", "Registrar Computers (I.T)", "District Judge"),
        ("Sunil Kumar", "", "Secretary, High Court Legal Services Committee", "Civil Judge (Senior Division)"),
        ("Touseef Ahmad Magrey", "", "Joint Registrar Inspection, Srinagar", "Civil Judge (Senior Division)"),
        ("Faizan I Nazar", "", "Sub Judge, LRP; look after CPC, e-Courts", "Civil Judge (Senior Division)"),
    ]
    return [
        make_entry(notification_id, i, name, frm, to, "", role_type)
        for i, (name, frm, to, role_type) in enumerate(rows, 1)
    ]


def parse_jkl_manual(notification_id):
    manual = {
        "JKL-2026-05-04-651": [
            ("Ms. Renu Dogra", "Principal Judge, Family Court, Srinagar", "Presiding Officer, Fast Track Court (POCSO), Jammu", "Judicial Officer"),
            ("Shri Sandeep Gandotra", "District Judge, Leave Reserve, High Court Wing, Jammu", "Presiding Officer, Labour and Industrial Tribunal, J&K", "Judicial Officer"),
            ("Shri Manoj Parihar", "Presiding Officer, Labour and Industrial Tribunal, J&K", "One Man Forest Authority", "Judicial Officer"),
            ("Shri Ahsan Ullah Parvez Malik", "Principal District and Sessions Judge, Poonch", "Additional District and Sessions Judge, Bandipora", "Judicial Officer"),
            ("Shri Sushil Singh", "Additional District and Sessions Judge, Poonch", "Principal District and Sessions Judge, Poonch", "Judicial Officer"),
            ("Shri Mir Wajahat", "Additional District and Sessions Judge, Bandipora", "Additional District and Sessions Judge, Poonch", "Judicial Officer"),
            ("Ms. Mehreen Mushtaq", "Additional Sessions Judge, Anti Corruption, Srinagar", "Principal Judge, Family Court, Srinagar", "Judicial Officer"),
            ("Ms. Tabasum", "Chief Judicial Magistrate, Srinagar", "Sub Judge, LRP, High Court Wing, Srinagar", "Judicial Officer"),
            ("Shri Touseef Ahmad Magrey", "Joint Registrar Inspection, High Court Wing, Srinagar", "Chief Judicial Magistrate, Srinagar", "Judicial Officer"),
            ("Shri Shafeeq Ahmad", "Special Mobile Magistrate, Poonch", "Secretary DLSA, Samba", "Judicial Officer"),
            ("Ms. Asma Chowdhary", "Secretary DLSA, Samba", "Special Mobile Magistrate, Poonch", "Judicial Officer"),
        ],
        "JKL-2025-12-03-1779": [
            ("Shri Sandeep Gandotra", "Presiding Officer, Fast Track Court, Jammu", "District Judge, Leave Reserve", "Judicial Officer"),
            ("Shri Amit Sharma", "District Judge, Leave Reserve", "Additional Judge, Family Court, Jammu", "Judicial Officer"),
            ("Shri Prem Sagar", "Additional Judge, Family Court, Jammu", "Presiding Officer, Fast Track Court, Jammu", "Judicial Officer"),
        ],
        "JKL-2025-11-19-1672": [
            ("Ms. Shilpa Dogra", "Munsiff/Additional Special Mobile Magistrate, Ramban", "Principal Magistrate, Juvenile Justice Board, Doda", "Civil Judge (Junior Division)"),
            ("Ms. Poonam Gupta", "Munsiff/Additional Special Mobile Magistrate, Billawar", "District Mobile Magistrate (T), Kathua", "Civil Judge (Junior Division)"),
            ("Ms. Neena Thakur", "District Mobile Magistrate (T), Kathua", "Munsiff, Udhampur", "Civil Judge (Junior Division)"),
            ("Ms. Himani Parihar", "Munsiff, Samba", "Principal Magistrate, Juvenile Justice Board, Jammu", "Civil Judge (Junior Division)"),
            ("Shri Raja Arshad Hamid", "Additional Mobile Magistrate (T), Srinagar", "Principal Magistrate, Juvenile Justice Board, Srinagar", "Civil Judge (Junior Division)"),
            ("Ms. Mainaaz Qadir", "Principal Magistrate, Juvenile Justice Board, Srinagar", "Munsiff/Additional Special Mobile Magistrate, Pantha Chowk", "Civil Judge (Junior Division)"),
            ("Ms. Shazia Chowdhary", "Munsiff/Additional Special Magistrate, Doda", "Munsiff, R.S. Pura", "Civil Judge (Junior Division)"),
            ("Shri Lakshay Badyal", "Munsiff, Nobra", "Munsiff, Hiranagar", "Civil Judge (Junior Division)"),
            ("Ms. Deldan Angmo", "Munsiff, Sankoo", "Munsiff/Additional Special Mobile Magistrate, Khalsti", "Civil Judge (Junior Division)"),
            ("Ms. Arusa Chowdhary", "Principal Magistrate, Juvenile Justice Board, Jammu", "Principal Magistrate, Juvenile Justice Board, Rajouri", "Civil Judge (Junior Division)"),
            ("Shri Adnan Manzoor", "4th Additional Munsiff, Srinagar", "Principal Magistrate, Juvenile Justice Board, Baramulla", "Civil Judge (Junior Division)"),
            ("Ms. Mufti Nahida", "Munsiff, Kangan", "Additional Mobile Magistrate (T), Srinagar", "Civil Judge (Junior Division)"),
            ("Ms. Nazia Hassan", "Munsiff, Chadoora", "4th Additional Munsiff, Srinagar", "Civil Judge (Junior Division)"),
            ("Ms. Isha Jerath", "Munsiff, Gandoh Bhaleesa", "2nd Additional Munsiff, Jammu", "Civil Judge (Junior Division)"),
            ("Ms. Ritika Jamwal", "Munsiff, Mahore", "Munsiff, Samba", "Civil Judge (Junior Division)"),
            ("Shri Himanshoo Attri", "Munsiff/Additional Special Mobile Magistrate, Pahalgam", "Munsiff, Mahore", "Civil Judge (Junior Division)"),
            ("Shri Mansoor Ahmad Mir", "Munsiff, Tangdhar", "Munsiff/Additional Special Mobile Magistrate, Kralpora", "Civil Judge (Junior Division)"),
            ("Shri Ashutosh Sharma", "Munsiff, Bani", "Munsiff, Ramban", "Civil Judge (Junior Division)"),
            ("Shri Sadiq Ali Wazir", "Munsiff/Additional Special Mobile Magistrate, Drass", "Munsiff, Sankoo", "Civil Judge (Junior Division)"),
            ("Shri Moonis Wahid", "Munsiff/Additional Special Mobile Magistrate, Ganderbal", "Munsiff, Kangan", "Civil Judge (Junior Division)"),
            ("Shri Syed Tyoub Bukhari", "Munsiff/Additional Special Mobile Magistrate, Khalsti", "Munsiff, Chadoora", "Civil Judge (Junior Division)"),
            ("Ms. Shivani Attri", "Munsiff/Additional Special Mobile Magistrate, Pantha Chowk", "Munsiff, Bani", "Civil Judge (Junior Division)"),
            ("Ms. Andleeb Singh", "Munsiff, Budhal", "Munsiff, Majalta", "Civil Judge (Junior Division)"),
        ],
    }
    return [
        make_entry(notification_id, i, name, frm, to, "", role_type)
        for i, (name, frm, to, role_type) in enumerate(manual.get(notification_id, []), 1)
    ]


def parse_mp(notification_id):
    manual = {
        "MP-2026-02-25-209": [
            ("Smt. Sakshi Kapoor", "II Civil Judge, Senior Division, Dewas", "V Civil Judge, Senior Division, Indore", "Civil Judge, Senior Division"),
            ("Sushri Anjana Yadav", "II Civil Judge, Senior Division, Dewas", "I Civil Judge, Senior Division, Khaniyadhana (Shivpuri)", "Civil Judge, Senior Division"),
        ],
        "MP-2026-02-25-211": [
            ("Sushri Monita Wankhede", "I Civil Judge, Junior Division, Dewas", "XX Civil Judge, Junior Division, Indore", "Civil Judge, Junior Division"),
        ],
        "MP-2026-02-25-213": [
            ("Smt. Gita Uikey", "I Civil Judge, Junior Division, Sirmaur (Rewa)", "II Civil Judge, Junior Division, Seoni", "Civil Judge, Junior Division"),
        ],
    }
    return [
        make_entry(notification_id, i, name, frm, to, "2026-03-09", role_type)
        for i, (name, frm, to, role_type) in enumerate(manual.get(notification_id, []), 1)
    ]


def main():
    notifications = json.loads(DATA.read_text())
    for item in notifications:
        notification_id = item["id"]
        text_path = TEXT_DIR / f"{notification_id}.txt"
        text = text_path.read_text(errors="ignore") if text_path.exists() else ""
        entries = []
        notes = ""

        if notification_id == "GUJ-2026-02-23-SCJ":
            entries = parse_gujarat_feb_ocr(notification_id, text)
            notes = "Extracted from OCR text."
        elif notification_id.startswith("GUJ-"):
            entries = parse_gujarat_table(notification_id, text)
            notes = "Extracted from Gujarat tabular PDF text. Long tables may need spot-checking against the source PDF."
        elif notification_id in {"JKL-2026-05-04-651", "JKL-2025-12-03-1779", "JKL-2025-11-19-1672"}:
            entries = parse_jkl_manual(notification_id)
            notes = "Manually normalized from the numbered J&K transfer order text after OCR/text extraction."
        elif notification_id == "JKL-2025-11-19-1664":
            entries = parse_jkl_registry_posting(notification_id, text)
            notes = "Registry posting table extracted from the order."
        elif notification_id.startswith("JKL-"):
            entries = parse_jkl_numbered(notification_id, text)
            notes = "Extracted from numbered transfer/posting order text."
        elif notification_id.startswith("MP-"):
            entries = parse_mp(notification_id)
            notes = "Extracted from OCR text and manually normalized from the small transfer table."

        item["transfer_entries"] = entries
        item["transfer_entry_count"] = len(entries)
        item["extraction_notes"] = notes if entries else "No transfer rows extracted yet; inspect the source PDF."

    DATA.write_text(json.dumps(notifications, indent=2, ensure_ascii=False) + "\n")
    print("updated", sum(n.get("transfer_entry_count", 0) for n in notifications), "transfer entries")
    for n in notifications:
        print(n["id"], n.get("transfer_entry_count", 0))


if __name__ == "__main__":
    main()
