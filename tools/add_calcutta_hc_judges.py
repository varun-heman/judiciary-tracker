#!/usr/bin/env python3
"""
Add Calcutta High Court judges to courts.json.
Data sourced from: https://www.calcuttahighcourt.gov.in/Judges/CJ-and-Judges
Run: python3 tools/add_calcutta_hc_judges.py
"""
import json
from datetime import date

COURTS_PATH = "data/courts.json"

def retirement(dob_str):
    """Calculate HC judge retirement date (age 62)."""
    if not dob_str:
        return None
    d = date.fromisoformat(dob_str)
    return f"{d.year + 62}-{d.month:02d}-{d.day:02d}"

BASE_URL = "https://www.calcuttahighcourt.gov.in"
SOURCE_URL = "https://www.calcuttahighcourt.gov.in/Judges/CJ-and-Judges"
SOURCE_LABEL = "Calcutta High Court – Official Judges Page"

def make_judge(idx, name, addl_date, perm_date, dob, role="Judge",
               photo_id=None, notes="", parent_hc=None):
    """Build a judge entry."""
    id_str = f"HC-CAL-{idx:03d}" if role != "Chief Justice" else "HC-CAL-CJ"
    ret = retirement(dob) if role != "Additional Judge" else (retirement(dob) if dob else None)
    entry = {
        "id": id_str,
        "name": name,
        "court": "Calcutta High Court",
        "state": "West Bengal",
        "role": role,
        "type": "high_court",
        "date_initial_appointment": addl_date or "",
        "date_assumed_role": perm_date or "",
        "retirement_date": ret or "",
        "parent_high_court": parent_hc or "",
        "parent_id": "HC-CAL",
        "notes": notes,
        "photo_url": f"assets/photos/{id_str}/portrait.jpg" if photo_id else "",
        "photo_source": BASE_URL if photo_id else "",
        "photo_original_url": f"{BASE_URL}/Judge-Photo/{photo_id}" if photo_id else "",
        "source_url": SOURCE_URL,
        "source_label": SOURCE_LABEL,
        "date_of_birth": dob or "",
    }
    return entry

# ── Judge entries (seniority order, slides 1-41) ──────────────────────────────
# Format: (slide_idx, name, addl_date, perm_date, dob, role, photo_id, notes, parent_hc)
JUDGES = [
    # Slide 1
    (1,  "Justice Tapabrata Chakraborty",     "2013-10-30", "2016-03-14", "1966-11-27", "Judge",           43,  "", None),
    # Slide 2
    (2,  "Justice Arijit Banerjee",           "2013-10-30", "2016-03-14", "1967-03-07", "Judge",           45,  "", None),
    # Slide 3 — original appointment Oct 2013; later transferred & returned
    (3,  "Justice Debangsu Basak",            "2013-10-30", "",           "1966-06-19", "Judge",           46,  "Originally appointed Oct 2013; subsequently transferred to another HC and returned to Calcutta HC.", None),
    # Slide 4 — transferred from another HC in Nov 2023
    (4,  "Justice Madhuresh Prasad",          "2023-11-02", "",           "",           "Judge",          288,  "Transferred and appointed at Calcutta HC w.e.f. 02.11.2023.", None),
    # Slide 5
    (5,  "Justice Rajasekhar Mantha",         "2017-09-21", "2019-09-16", "1967-10-29", "Judge",           56,  "", None),
    # Slide 6
    (6,  "Justice Sabyasachi Bhattacharyya",  "2017-09-21", "2019-09-16", "1970-08-30", "Judge",           58,  "", None),
    # Slide 7
    (7,  "Justice Rajarshi Bharadwaj",        "2017-09-21", "2020-02-12", "1967-08-04", "Judge",           61,  "", None),
    # Slide 8
    (8,  "Justice Shampa Sarkar",             "2018-03-12", "2020-02-12", "1968-02-18", "Judge",          159,  "", None),
    # Slide 9
    (9,  "Justice Ravi Krishan Kapur",        "2018-03-12", "2020-02-12", "1971-10-05", "Judge",          160,  "", None),
    # Slide 10
    (10, "Justice Arindam Mukherjee",         "2018-03-12", "2020-02-12", "",           "Judge",          161,  "", None),
    # Slide 11
    (11, "Justice Amrita Sinha",              "2018-05-02", "2020-04-24", "",           "Judge",          164,  "", None),
    # Slide 12
    (12, "Justice Jay Sengupta",              "2018-05-02", "2020-05-04", "1970-10-30", "Judge",          166,  "Elevated from West Bengal Judicial Service.", None),
    # Slide 13
    (13, "Justice Suvra Ghosh",              "2018-11-19", "2020-05-04", "1968-04-23", "Judge",          171,  "", None),
    # Slide 14
    (14, "Justice Tirthankar Ghosh",          "2019-02-12", "2020-09-24", "",           "Judge",          173,  "", None),
    # Slide 15
    (15, "Justice Hiranmay Bhattacharyya",    "2019-02-12", "2020-09-24", "1968-12-18", "Judge",          175,  "", None),
    # Slide 16
    (16, "Justice Saugata Bhattacharyya",     "2019-02-12", "2020-09-24", "",           "Judge",          174,  "", None),
    # Slide 17
    (17, "Justice Kausik Chanda",             "2019-10-01", "2021-09-08", "1974-01-04", "Judge",          178,  "", None),
    # Slide 18
    (18, "Justice Aniruddha Roy",             "2020-05-05", "2022-01-17", "",           "Judge",          180,  "Elevated from West Bengal Judicial Service.", None),
    # Slide 19
    (19, "Justice Sugato Majumdar",           "2021-08-27", "2022-05-02", "1967-12-25", "Judge",          184,  "", None),
    # Slide 20
    (20, "Justice Bivas Pattanayak",          "2021-08-27", "2022-05-02", "",           "Judge",          185,  "", None),
    # Slide 21
    (21, "Justice Krishna Rao",               "2021-11-18", "2023-08-01", "",           "Judge",          190,  "", None),
    # Slide 22
    (22, "Dr. Justice Ajoy Kumar Mukherjee",  "2021-11-18", "2023-08-01", "1965-01-08", "Judge",          192,  "", None),
    # Slide 23 — appointed directly as Judge (no addl stage shown)
    (23, "Justice Dinesh Kumar Sharma",       "2025-04-07", "",           "",           "Judge",          294,  "", None),
    # Slide 24
    (24, "Justice Gaurang Kanth",             "2023-07-21", "",           "",           "Judge",          285,  "", None),
    # Slide 25
    (25, "Justice Ananya Bandyopadhyay",      "2022-05-18", "2024-02-06", "",           "Judge",          267,  "", None),
    # Slide 26
    (26, "Justice Rai Chattopadhyay",         "2022-05-18", "2024-02-06", "",           "Judge",          268,  "", None),
    # Slide 27 — elevated from Judicial Service
    (27, "Justice Shampa Dutt (Paul)",        "2022-06-06", "2024-02-06", "",           "Judge",          270,  "Elevated from West Bengal Judicial Service.", None),
    # Slide 28
    (28, "Justice Raja Basu Chowdhury",       "2022-06-09", "2024-02-06", "",           "Judge",          272,  "", None),
    # Slide 29
    (29, "Justice Partha Sarathi Sen",        "2022-08-31", "2025-08-26", "1969-07-03", "Judge",          276,  "", None),
    # Slide 30
    (30, "Justice Apurba Sinha Ray",          "2022-08-31", "",           "1964-11-25", "Judge",          282,  "", None),
    # ── Additional Judges ─────────────────────────────────────────────────────
    # Slide 31
    (31, "Justice Biswaroop Chowdhury",       "2022-08-31", "",           "1965-09-29", "Additional Judge", 275, "", None),
    # Slide 32
    (32, "Justice Prasenjit Biswas",          "2022-08-31", "",           "",           "Additional Judge", 277, "", None),
    # Slide 33
    (33, "Justice Uday Kumar",                "2022-08-31", "",           "",           "Additional Judge", 278, "Elevated from West Bengal Judicial Service.", None),
    # Slide 34
    (34, "Justice Ajay Kumar Gupta",          "2022-08-31", "",           "1970-03-25", "Additional Judge", 279, "", None),
    # Slide 35
    (35, "Justice Supratim Bhattacharya",     "2022-08-31", "",           "",           "Additional Judge", 280, "", None),
    # Slide 36 — Partha Sarathi Chatterjee (elevated from Judicial Service)
    (36, "Justice Partha Sarathi Chatterjee", "2022-08-31", "",           "",           "Additional Judge", 281, "Elevated from West Bengal Judicial Service.", None),
    # Slide 37 — Md. Shabbar Rashidi (born 1st February, year unknown)
    (37, "Justice Md. Shabbar Rashidi",       "2022-08-31", "",           "",           "Additional Judge", 283, "Born 1st February (year not available on official site).", None),
    # Slide 38
    (38, "Justice Chaitali Chatterjee Das",   "2025-02-14", "",           "",           "Additional Judge", 289, "Elevated from West Bengal Judicial Service.", None),
    # Slide 39
    (39, "Justice Smita Das De",              "2025-03-11", "",           "",           "Additional Judge", 290, "", None),
    # Slide 40
    (40, "Justice Reetobroto Kumar Mitra",    "2025-03-11", "",           "",           "Additional Judge", 291, "", None),
    # Slide 41
    (41, "Justice Om Narayan Rai",            "2025-03-11", "",           "",           "Additional Judge", 292, "Elevated from West Bengal Judicial Service.", None),
]


def main():
    with open(COURTS_PATH) as f:
        courts = json.load(f)

    # Update CJ photo URL
    for c in courts:
        if c["id"] == "HC-CAL-CJ":
            c["photo_url"] = "assets/photos/HC-CAL-CJ/portrait.jpg"
            c["photo_source"] = BASE_URL
            c["photo_original_url"] = f"{BASE_URL}/Judge-Photo/295"
            c["source_url"] = SOURCE_URL
            c["source_label"] = SOURCE_LABEL
            print(f"Updated HC-CAL-CJ with photo URL")
            break

    # Remove any existing HC-CAL judge entries (not the CJ, not the institution)
    courts = [
        c for c in courts
        if not (c.get("parent_id") == "HC-CAL" and c.get("type") == "high_court"
                and c["id"] != "HC-CAL-CJ")
    ]

    # Find CJ insertion position
    cj_idx = next(i for i, c in enumerate(courts) if c["id"] == "HC-CAL-CJ")
    print(f"Inserting {len(JUDGES)} judges after HC-CAL-CJ at index {cj_idx}")

    # Build and insert entries
    new_entries = []
    for (idx, name, addl, perm, dob, role, photo_id, notes, parent_hc) in JUDGES:
        entry = make_judge(idx, name, addl, perm, dob, role, photo_id, notes, parent_hc)
        new_entries.append(entry)

    for i, entry in enumerate(new_entries):
        courts.insert(cj_idx + 1 + i, entry)

    with open(COURTS_PATH, "w") as f:
        json.dump(courts, f, indent=2, ensure_ascii=False)
        f.write("\n")

    # Verify
    with open(COURTS_PATH) as f:
        courts2 = json.load(f)
    cal = [c for c in courts2 if "HC-CAL" in c.get("id", "")]
    print(f"Total HC-CAL entries now: {len(cal)}")
    print(f"Total courts entries: {len(courts2)}")
    for c in cal[:5]:
        print(f"  {c['id']:18s}  {c['name']:45s}  DOB:{c.get('date_of_birth',''):12s}  Ret:{c.get('retirement_date','')}")


if __name__ == "__main__":
    main()
