#!/usr/bin/env python3
"""
Fetch current gold and silver spot prices and write data/metal-prices.json.
Called by .github/workflows/update-metal-prices.yml — runs on GitHub Actions.
"""
import json
import datetime
import urllib.request
import sys

TROY_OZ_GRAMS = 31.1035
GOLD_PURITY   = 22 / 24   # 22-karat
SILVER_PURITY = 0.925     # Sterling silver (92.5%)


def fetch(url):
    req = urllib.request.Request(
        url, headers={"User-Agent": "india-judiciary-tracker/1.0"}
    )
    return json.loads(urllib.request.urlopen(req, timeout=15).read())


def main():
    print("Fetching spot prices from metals.live …")
    metals = fetch("https://metals.live/api/v1/latest")
    m = metals[0] if isinstance(metals, list) else metals

    print("Fetching USD→INR rate from open.er-api.com …")
    fx = fetch("https://open.er-api.com/v6/latest/USD")
    usd_inr = fx["rates"]["INR"]

    data = {
        "goldPerGram":   round((m["gold"]   / TROY_OZ_GRAMS) * GOLD_PURITY   * usd_inr, 2),
        "silverPerGram": round((m["silver"] / TROY_OZ_GRAMS) * SILVER_PURITY * usd_inr, 2),
        "goldSpotUSD":   round(m["gold"],   2),
        "silverSpotUSD": round(m["silver"], 2),
        "usdToInr":      round(usd_inr, 4),
        "fetchedAt":     datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "assumptions": {
            "goldKarat":     22,
            "goldPurity":    round(GOLD_PURITY, 6),
            "silverPurity":  SILVER_PURITY,
            "troyOzToGrams": TROY_OZ_GRAMS,
        },
        "sources": {
            "spotPrices": "https://metals.live/api/v1/latest",
            "fxRate":     "https://open.er-api.com/v6/latest/USD",
        },
    }

    out = "data/metal-prices.json"
    with open(out, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    print(
        f"✓ Written {out}\n"
        f"  Gold:   ₹{data['goldPerGram']}/g  (spot ${data['goldSpotUSD']}/oz)\n"
        f"  Silver: ₹{data['silverPerGram']}/g  (spot ${data['silverSpotUSD']}/oz)\n"
        f"  Rate:   1 USD = ₹{data['usdToInr']}"
    )


if __name__ == "__main__":
    main()
