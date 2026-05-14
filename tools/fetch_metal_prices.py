#!/usr/bin/env python3
"""
Fetch current gold and silver spot prices and write data/metal-prices.json.
Uses Yahoo Finance (GC=F, SI=F, USDINR=X) — no API key required.
Called by .github/workflows/update-metal-prices.yml
"""
import json
import datetime
import urllib.request
import sys

TROY_OZ_GRAMS = 31.1035
GOLD_PURITY   = 22 / 24   # 22-karat
SILVER_PURITY = 0.925     # Sterling silver (92.5%)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())


def yahoo_price(symbol):
    """Return the latest regular-market price for a Yahoo Finance symbol."""
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        "?interval=1d&range=1d"
    )
    data = fetch_json(url)
    meta = data["chart"]["result"][0]["meta"]
    price = meta.get("regularMarketPrice") or meta.get("previousClose")
    if price is None:
        raise ValueError(f"No price found for {symbol}: {meta}")
    return float(price)


def main():
    print("Fetching gold spot price  (GC=F) …")
    gold_usd = yahoo_price("GC=F")
    print(f"  Gold:   ${gold_usd:.2f} / troy oz")

    print("Fetching silver spot price (SI=F) …")
    silver_usd = yahoo_price("SI=F")
    print(f"  Silver: ${silver_usd:.4f} / troy oz")

    print("Fetching USD→INR rate (USDINR=X) …")
    usd_inr = yahoo_price("USDINR=X")
    print(f"  Rate:   1 USD = ₹{usd_inr:.4f}")

    data = {
        "goldPerGram":   round((gold_usd   / TROY_OZ_GRAMS) * GOLD_PURITY   * usd_inr, 2),
        "silverPerGram": round((silver_usd / TROY_OZ_GRAMS) * SILVER_PURITY * usd_inr, 2),
        "goldSpotUSD":   round(gold_usd,   2),
        "silverSpotUSD": round(silver_usd, 4),
        "usdToInr":      round(usd_inr,    4),
        "fetchedAt":     datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "assumptions": {
            "goldKarat":     22,
            "goldPurity":    round(GOLD_PURITY, 6),
            "silverPurity":  SILVER_PURITY,
            "troyOzToGrams": TROY_OZ_GRAMS,
        },
        "sources": {
            "spotPrices": "Yahoo Finance (GC=F, SI=F)",
            "fxRate":     "Yahoo Finance (USDINR=X)",
        },
    }

    out = "data/metal-prices.json"
    with open(out, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    print(
        f"\n✓ Written {out}\n"
        f"  Gold:   ₹{data['goldPerGram']}/g\n"
        f"  Silver: ₹{data['silverPerGram']}/g"
    )


if __name__ == "__main__":
    main()
