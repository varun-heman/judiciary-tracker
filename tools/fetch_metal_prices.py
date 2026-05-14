#!/usr/bin/env python3
"""
Fetch current gold and silver spot prices and write data/metal-prices.json.
Uses stooq.com — free, CSV-based, no API key, CI-friendly.
  Gold:   https://stooq.com/q/l/?s=xauusd  (XAU/USD, USD per troy oz)
  Silver: https://stooq.com/q/l/?s=xagusd  (XAG/USD, USD per troy oz)
  FX:     https://stooq.com/q/l/?s=usdinr  (USD/INR)
Called by .github/workflows/update-metal-prices.yml
"""
import csv
import io
import json
import datetime
import urllib.request

TROY_OZ_GRAMS = 31.1035
GOLD_PURITY   = 22 / 24   # 22-karat
SILVER_PURITY = 0.925     # Sterling silver (92.5%)

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; india-judiciary-tracker/1.0)"}


def stooq_price(symbol):
    """Return the latest closing price for a stooq symbol."""
    url = f"https://stooq.com/q/l/?s={symbol}&f=sd2t2ohlcv&h&e=csv"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        text = resp.read().decode()
    print(f"  [{symbol}] raw: {text.strip()[:120]}")
    reader = csv.DictReader(io.StringIO(text))
    row = next(reader)
    close = row.get("Close") or row.get("close")
    if not close or close in ("N/D", "", "null"):
        raise ValueError(f"No closing price for {symbol}. Row: {row}")
    return float(close)


def main():
    print("Fetching gold spot price  (xauusd) …")
    gold_usd = stooq_price("xauusd")
    print(f"  Gold:   ${gold_usd:.2f} / troy oz")

    print("Fetching silver spot price (xagusd) …")
    silver_usd = stooq_price("xagusd")
    print(f"  Silver: ${silver_usd:.4f} / troy oz")

    print("Fetching USD→INR rate (usdinr) …")
    usd_inr = stooq_price("usdinr")
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
            "spotPrices": "stooq.com (xauusd, xagusd)",
            "fxRate":     "stooq.com (usdinr)",
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
