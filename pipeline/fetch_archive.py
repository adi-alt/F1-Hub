"""Backfill pre-2018 seasons (1950-2017) from Ergast/Jolpi into their own `archive_races`
collection — kept entirely separate from `races`, which is FastF1-native and what every ML model
and page under /season reads. Ergast has no lap telemetry or tyre data for this era (and nothing
resembling it before the mid-1990s even for qualifying), so an archive doc is deliberately just
name/circuit/date plus the classified race result — a history browser, not training data.

Document id: `{year}_r{round:02d}_{event-slug}`, same convention as `races` for readability.

Per-round queries (not per-season) because Ergast/Jolpi's default page size is far smaller than a
season's total result-row count but always larger than one race's (~20-26 rows) — so every
request here is a single complete page, no pagination bookkeeping needed.

Already-fetched rounds are skipped by id existence (not a status field) — a race from 1973 is
never going to change, so "doc exists" is the whole freshness check, making reruns of this script
free to resume after an interruption.

Run:
  python pipeline/fetch_archive.py                 # full 1950-2017 backfill
  python pipeline/fetch_archive.py 1994             # a single season
  python pipeline/fetch_archive.py 1994 2000        # an inclusive year range
"""

import json
import os
import re
import sys
import time
import unicodedata

import pandas as pd
import requests
import firebase_admin
from firebase_admin import credentials, firestore
from fastf1.ergast import Ergast
from google.api_core.exceptions import GoogleAPICallError

EARLIEST_YEAR = 1950
LATEST_YEAR = 2017  # fetch_races.py takes over from 2018 onward
REQUEST_DELAY_SEC = 0.5  # a free, community-run API — no need to hammer it for a one-time backfill
MAX_RETRIES = 5

ergast = Ergast()


def with_retry(fn):
    """Three failure modes seen in practice on a several-hundred-request run: Jolpi's hard rate
    limit (needs a real multi-minute wait — a few extra seconds never clears an hourly-scale
    limit), plain network read timeouts, and Firestore going briefly unavailable/slow. The first
    needs patience; the other two just need a moment before trying again."""
    for attempt in range(MAX_RETRIES):
        try:
            return fn()
        except (requests.exceptions.RequestException, GoogleAPICallError):
            if attempt == MAX_RETRIES - 1:
                raise
            print(f"    transient error, retrying in 5s ({attempt + 1}/{MAX_RETRIES})")
            time.sleep(5)
        except Exception as exc:
            if "Too Many Requests" not in str(exc) or attempt == MAX_RETRIES - 1:
                raise
            backoff = 60 * (2**attempt)  # 60s, 120s, 240s, 480s
            print(f"    rate limited, retrying in {backoff}s ({attempt + 1}/{MAX_RETRIES})")
            time.sleep(backoff)


def init_firestore():
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise SystemExit("FIREBASE_SERVICE_ACCOUNT_JSON is not set.")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(json.loads(raw)))
    return firestore.client()


def slugify(name: str) -> str:
    ascii_only = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_only.lower()).strip("-")


def clean(value):
    """Ergast/pandas gives back NaN/NaT for anything not tracked in a given era — store that as
    a real `None` rather than a NaN float, so the JS side can just use `??` / optional chaining."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d")
    if hasattr(value, "item"):  # numpy scalar (int64, float64, ...)
        value = value.item()
        return None if isinstance(value, float) and pd.isna(value) else value
    return value


def fetch_season_rounds(year: int) -> list[dict]:
    schedule = with_retry(lambda: ergast.get_race_schedule(season=year))
    return schedule.sort_values("round").to_dict("records")


def fetch_round_results(year: int, round_num: int) -> list[dict]:
    resp = with_retry(lambda: ergast.get_race_results(season=year, round=round_num))
    if not resp.content:
        return []
    df = resp.content[0].sort_values("position")
    results = []
    for row in df.to_dict("records"):
        results.append(
            {
                "position": clean(row["position"]),
                "positionText": clean(row["positionText"]),
                "grid": clean(row["grid"]),
                "laps": clean(row["laps"]),
                "status": clean(row["status"]),
                "points": clean(row["points"]),
                "driverId": clean(row["driverId"]),
                "driverName": f"{row['givenName']} {row['familyName']}",
                "constructor": clean(row["constructorName"]),
            }
        )
    return results


def build_and_push(db, year: int, race_row: dict):
    round_num = int(race_row["round"])
    race_name = str(race_row["raceName"])
    doc_id = f"{year}_r{round_num:02d}_{slugify(race_name)}"

    if db.collection("archive_races").document(doc_id).get().exists:
        print(f"  {doc_id}: already have it, skipping")
        return

    results = fetch_round_results(year, round_num)
    if not results:
        print(f"  {doc_id}: no results available, skipping")
        return

    doc = {
        "year": year,
        "round": round_num,
        "raceName": race_name,
        "circuitName": clean(race_row.get("circuitName")),
        "locality": clean(race_row.get("locality")),
        "country": clean(race_row.get("country")),
        "raceDate": clean(race_row.get("raceDate")),
        "results": results,
    }
    with_retry(lambda: db.collection("archive_races").document(doc_id).set(doc))
    print(f"  {doc_id}: pushed {len(results)} results")


def main():
    args = sys.argv[1:]
    if len(args) == 0:
        start, end = EARLIEST_YEAR, LATEST_YEAR
    elif len(args) == 1:
        start = end = int(args[0])
    else:
        start, end = int(args[0]), int(args[1])

    db = init_firestore()
    for year in range(start, end + 1):
        print(f"Season {year}:")
        rounds = fetch_season_rounds(year)
        for race_row in rounds:
            build_and_push(db, year, race_row)
            time.sleep(REQUEST_DELAY_SEC)
    print("Done.")


if __name__ == "__main__":
    main()
