# India Judiciary Tracker

**A public, open-source tool for navigating information about India's courts — because transparency is the first step toward accountability.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/varun-heman/judiciary-tracker/update-metal-prices.yml?label=daily%20price%20update)](https://github.com/varun-heman/judiciary-tracker/actions)
[![GitHub Pages](https://img.shields.io/badge/live-GitHub%20Pages-brightgreen)](https://varun-heman.github.io/judiciary-tracker/)

---

## What this is

India's courts touch nearly every aspect of public life — land, liberty, labour, environment, family, and more. Yet basic information about sitting judges, their appointments, their assets, and their institutional roles is scattered across dozens of official websites with no consistent format, no central search, and no easy way to track changes over time.

This tracker is a small attempt to fix that. It pulls together publicly available information on the Supreme Court of India, all High Courts, and selected administrative staff into a single, searchable, open-source interface — with no login, no paywall, and no agenda beyond making public information easier to find.

**Live site:** [varun-heman.github.io/judiciary-tracker](https://varun-heman.github.io/judiciary-tracker/)

---

## Features

### Court & Judge Directory
- Complete roster of sitting and recently retired judges across the Supreme Court and all 25 High Courts
- Role badges: Chief Justice, Judge, Additional Judge, Acting Chief Justice
- Appointment dates, assumed-role dates, and calculated retirement dates (HC judges retire at 62; SC judges at 65)
- Retirement countdown with colour-coded urgency indicators
- Transfer history and parent-court tracking where available

### Asset Declarations
- Structured breakdown of publicly declared assets from official affidavits: monetary holdings (FDs, shares, bank balances, insurance, PPF/GPF), land and property, jewellery, and vehicles
- Per-row notes with a hover/click tooltip and copy-to-clipboard
- Estimated market value of declared gold and silver, calculated from live international spot rates (see below)
- Net worth estimate combining monetary declarations with metal valuations — with a full disclosure of methodology and limitations

### Live Metal Pricing
- Gold (XAU/USD) and silver (XAG/USD) spot prices sourced daily from [stooq.com](https://stooq.com), converted to INR using the live USD/INR rate
- Updated automatically at 11:30 AM IST every day via GitHub Actions — no manual work required
- Values committed to the repository as `data/metal-prices.json`, served as a static file alongside all other data
- Assumptions are disclosed in-app: 22-karat gold purity (91.67%), 92.5% sterling silver purity; making charges, GST, and local market premiums are excluded

### Wealth Rankings
- Judges are ranked by estimated net worth (monetary + metals) within their court and across all tracked courts
- Rankings update automatically as new data and fresh metal prices are added
- All rankings carry an explicit disclaimer about methodology and the limits of declared-asset data

### Search & Navigation
- Full-text search across all judges, courts, roles, and names
- Filter by court, role, and tenure window
- Retirement timeline panel: see who is retiring in the next 12 months across all courts
- Responsive layout; works on mobile and desktop

---

## Data sources

All data is sourced from official and public records:

| Source | What it covers |
|---|---|
| Supreme Court of India — official website | SC judge roster and profiles |
| High Court official websites | HC judge rosters, Chief Justices, Additional Judges |
| Election Commission of India — affidavits | Asset declarations filed by judges at time of appointment |
| Official Gazette / Collegium notifications | Transfer and appointment dates |
| stooq.com | Daily gold and silver spot prices (XAU/USD, XAG/USD) |
| open.er-api.com | USD to INR exchange rate |

**Accuracy caveat:** Data is collected by scraping public sources. Both AI-assisted extraction and human review introduce the possibility of error. Do not treat anything on this tracker as definitive. Always verify against the underlying official source before quoting or relying on this data.

---

## Architecture

The tracker is a fully static single-page application (SPA). There is no server, no database, and no backend.

```
india-judiciary-tracker/
├── index.html                  # Shell HTML
├── css/
│   └── styles.css              # All styles; CSS custom properties for theming
├── js/
│   └── app.js                  # All application logic (~2000 lines of vanilla JS)
├── data/
│   ├── courts.json             # Judge and court records (~310+ entries)
│   ├── judge-details.json      # Per-judge bios and structured asset declarations
│   ├── ministries.json         # Ministry and senior official data
│   ├── admin-staff.json        # Court registry and administrative staff
│   ├── metal-prices.json       # Live-refreshed gold/silver/INR rates
│   └── judge-sources.json      # Canonical source URLs per court
├── assets/
│   └── photos/                 # Judge portrait photos (where available)
├── tools/
│   ├── fetch_metal_prices.py   # Daily price-fetch script (run by GitHub Actions)
│   ├── add_calcutta_hc_judges.py
│   └── gen_data_js.py          # Regenerates embedded data.js fallback
└── .github/
    └── workflows/
        └── update-metal-prices.yml  # Scheduled daily GitHub Action
```

**Tech stack:** HTML · CSS · Vanilla JavaScript · Python (tooling only) · GitHub Actions · GitHub Pages

No npm. No build step. No framework. Open the HTML file in a browser and it works.

---

## How to contribute

Contributions are very welcome — whether you're fixing a data error, adding a judge profile, improving the interface, or extending coverage to a court not yet tracked.

### Data corrections
If you spot an error in a judge's name, appointment date, court, or asset declaration, please open an issue or submit a pull request editing `data/courts.json` or `data/judge-details.json` directly.

### Adding a new court or judge
Each judge entry in `courts.json` follows a consistent schema:

```json
{
  "id": "HC-BOM-001",
  "name": "Justice Example Name",
  "court": "Bombay High Court",
  "state": "Maharashtra",
  "role": "Judge",
  "type": "high_court",
  "date_initial_appointment": "2019-06-10",
  "date_assumed_role": "2021-04-01",
  "retirement_date": "2031-08-15",
  "date_of_birth": "1969-08-15",
  "parent_id": "HC-BOM",
  "source_url": "https://bombayhighcourt.nic.in/judges",
  "source_label": "Bombay High Court — Official Judges Page"
}
```

Asset declarations go in `judge-details.json`. See existing entries for the full schema, including the structured `items` arrays for each asset category.

### Interface improvements
The entire UI lives in `js/app.js` and `css/styles.css`. There is no build pipeline — edit and refresh.

### Tools
`tools/` contains standalone Python scripts for bulk data operations. Each script has a docstring explaining what it does and how to run it. Python 3.8+ and no external dependencies beyond `requests` (for photo downloading).

---

## Running locally

```bash
git clone https://github.com/varun-heman/judiciary-tracker.git
cd judiciary-tracker

# Serve over HTTP (required for fetch() to load the JSON data files)
python3 -m http.server 8080
# Then open http://localhost:8080
```

The app also works with `file://` by falling back to an embedded `data/data.js` snapshot. Regenerate the snapshot after data changes with:

```bash
python3 tools/gen_data_js.py
```

---

## Daily price update (GitHub Actions)

The workflow at `.github/workflows/update-metal-prices.yml` runs every day at 06:00 UTC. It:

1. Fetches gold and silver spot prices from `stooq.com` (XAU/USD, XAG/USD)
2. Fetches the USD/INR rate from `stooq.com` (USDINR)
3. Applies purity assumptions (22K gold, 92.5% silver) to compute per-gram INR values
4. Writes the result to `data/metal-prices.json` and commits it if the data changed

The workflow can also be triggered manually from the GitHub Actions tab. No secrets or API keys are required.

---

## Why this matters

India has over 18,000 pending judicial appointments and a chronic backlog of cases. Judicial tenure, transfers, and asset declarations are all matters of public record — yet they are genuinely hard to navigate for journalists, researchers, advocates, and citizens who need this information to do their work.

This tracker does not editorialize. It does not rank judges by performance or comment on their decisions. It simply tries to make scattered public data easier to find, compare, and monitor — so that the people who need it can do more with it.

Court transparency is not a partisan issue. Open data builds the foundation for informed public conversation, better reporting, and, over time, more accountable institutions.

---

## License

Copyright 2026 Varun Hemachandran and contributors.

Licensed under the **Apache License, Version 2.0**. You may use, copy, modify, and distribute this work — code and data — under the terms of that license.

See [LICENSE](LICENSE) for the full text.

---

## Acknowledgements

Built by Varun Hemachandran with AI assistance from [Anthropic Claude](https://claude.ai) and [OpenAI Codex](https://openai.com/codex) for data extraction, structuring, and interface development.

Data is sourced exclusively from official and public records. Judge photographs, where present, are sourced from official court websites and are reproduced here for identification purposes only.

Corrections, additions, and pull requests are gratefully received.
