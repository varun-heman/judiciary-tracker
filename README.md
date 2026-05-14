# India Judiciary Tracker

**A public, open-source tracker for navigating information about India’s courts, judges, court administration, transfers, and public asset declarations.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/varun-heman/judiciary-tracker/update-metal-prices.yml?label=daily%20price%20update)](https://github.com/varun-heman/judiciary-tracker/actions)
[![GitHub Pages](https://img.shields.io/badge/live-GitHub%20Pages-brightgreen)](https://varun-heman.github.io/judiciary-tracker/)

---

## What this is

Information about sitting judges, appointments, transfers, administrative roles, and asset declarations is public, but scattered across many official websites with different formats and update patterns. India Judiciary Tracker pulls that material into one searchable, static interface so it is easier to find, compare, and verify.

The project is maintained by [Varun Hemachandran](https://pvt.is), whose work is closely tied to courts and access to justice. The first version was built over several days in May 2026 with substantial assistance from [OpenAI Codex](https://openai.com/codex) and [Anthropic Claude](https://claude.ai). It remains a personal project, updated from time to time as sources change and the data model improves.

**Accuracy warning:** this site is AI-assisted and not authoritative. AI and human error are both possible in the data, parsing, calculations, and interface. Use the linked official sources before quoting or relying on anything here. Where the tracker makes assumptions, especially around estimated net worth, the interface shows what was included, excluded, and assumed.

**Live site:** [varun-heman.github.io/judiciary-tracker](https://varun-heman.github.io/judiciary-tracker/)

---

## Coverage status

This is an ongoing project. Coverage varies significantly by court: some are detailed, some are roster-only, and several are still placeholders. Contributions to fill gaps are welcome.

| Court | Judges | Roster | Photos | Bios | Asset Declarations |
|---|:---:|:---:|:---:|:---:|:---:|
| Supreme Court of India | 32 | ✅ | ✅ | ✅ | ✅ |
| Allahabad High Court | 108 | ✅ | ✅ | ✅ | ⬜ |
| Madras High Court | 52 | ✅ | ✅ | 🟡 partial | ⬜ |
| Calcutta High Court | 42 | ✅ | ✅ | 🟡 partial | ⬜ |
| Andhra Pradesh High Court | 32 | ✅ | ✅ | 🟡 partial | ⬜ |
| Bombay High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Chhattisgarh High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Delhi High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Gauhati High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Gujarat High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Himachal Pradesh High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| J&K and Ladakh High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Jharkhand High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Karnataka High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Kerala High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Madhya Pradesh High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Manipur High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Meghalaya High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Orissa High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Patna High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Punjab & Haryana High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Rajasthan High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Sikkim High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Telangana High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Tripura High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |
| Uttarakhand High Court | — | ⬜ stub | ⬜ | ⬜ | ⬜ |

**Key:** ✅ Done &nbsp;·&nbsp; 🟡 Partial &nbsp;·&nbsp; ⬜ Not yet done

If you want to help fill in a court, start with the [contributing section](#how-to-contribute). Official judge rosters and asset declarations are usually available on court websites, though formats vary.

---

## Features

### Court & Judge Directory
- Full roster of sitting judges for completed courts; stub entries for courts in progress
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

**Accuracy caveat:** data is collected from public sources through scraping, parsing, and manual review. Do not treat anything here as definitive; verify against the linked official source.

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

## License

Copyright 2026 Varun Hemachandran and contributors.

Licensed under the **Apache License, Version 2.0**. You may use, copy, modify, and distribute this work — code and data — under the terms of that license.

See [LICENSE](LICENSE) for the full text.

---

## Acknowledgements

**Built by** Varun Hemachandran.

**Built with** [OpenAI Codex](https://openai.com/codex) and [Anthropic Claude](https://claude.ai). These tools assisted with coding, scraping, data structuring, and interface iteration.

**Data** is sourced exclusively from official and public records. Judge photographs, where present, are sourced from official court websites and reproduced here for identification purposes only.

If you find an error in a name, date, source, calculation, or interface, please open an issue or submit a pull request.
