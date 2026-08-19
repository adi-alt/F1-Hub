"""Enriches existing archive_races docs (see fetch_archive.py, which already ran the base
1950-2017 backfill once and isn't touched here) with data the original run either dropped
(finish time, driver code, fastest lap, Wikipedia report URL — all sitting in the same /results
response already fetched the first time, just not selected) or never fetched at all (qualifying,
pit stops — two genuinely new per-race calls). Sprint results aren't fetched: sprints didn't
exist until 2021, well past this archive's 2017 cutoff, so every call would come back empty.

Idempotent via an `enrichedAt` field on each doc — safe to interrupt and resume, same "field
already there, skip" convention fetch_archive.py uses (there via doc existence, here via a field
on a doc that already exists).

Run:
  python enrich_archive.py                 # every un-enriched race, 1950-2017
  python enrich_archive.py 1994             # a single season
  python enrich_archive.py 1994 2000        # an inclusive year range
"""

import sys
import time
from datetime import datetime, timezone

from fastf1.ergast import Ergast

from ergast_utils import clean, format_timedelta, init_firestore, timedelta_seconds, trigger_revalidation, with_retry

EARLIEST_YEAR = 1950
LATEST_YEAR = datetime.now().year - 1
REQUEST_DELAY_SEC = 0.5

ergast = Ergast()


def fetch_results_enrichment(year: int, round_num: int):
    """Re-fetches /results — the original backfill kept only 9 of the ~15 available fields.
    Returns (fields_by_driver_id, wikipedia_url)."""
    resp = with_retry(lambda: ergast.get_race_results(season=year, round=round_num))
    if not resp.content:
        return {}, None

    by_driver = {}
    for row in resp.content[0].to_dict("records"):
        is_winner = clean(row.get("position")) == 1
        fastest_lap = None
        if clean(row.get("fastestLapRank")) is not None:
            fastest_lap = {
                "rank": clean(row.get("fastestLapRank")),
                "lap": clean(row.get("fastestLapNumber")),
                "time": format_timedelta(row.get("fastestLapTime")),
                "avgSpeedKph": clean(row.get("fastestLapAvgSpeed")),
            }
        by_driver[row["driverId"]] = {
            "time": format_timedelta(row.get("totalRaceTime"), is_gap=not is_winner),
            "driverCode": clean(row.get("driverCode")),
            "fastestLap": fastest_lap,
        }

    wikipedia_url = None
    if not resp.description.empty:
        wikipedia_url = clean(resp.description.iloc[0].get("raceUrl"))
    return by_driver, wikipedia_url


def fetch_qualifying(year: int, round_num: int) -> list[dict]:
    resp = with_retry(lambda: ergast.get_qualifying_results(season=year, round=round_num))
    if not resp.content:
        return []
    df = resp.content[0].sort_values("position")
    return [
        {
            "position": clean(row.get("position")),
            "driverId": clean(row.get("driverId")),
            "driverName": f"{row['givenName']} {row['familyName']}",
            "constructor": clean(row.get("constructorName")),
            "q1": format_timedelta(row.get("Q1")),
            "q2": format_timedelta(row.get("Q2")),
            "q3": format_timedelta(row.get("Q3")),
        }
        for row in df.to_dict("records")
    ]


def fetch_pit_stops(year: int, round_num: int) -> list[dict]:
    resp = with_retry(lambda: ergast.get_pit_stops(season=year, round=round_num))
    if not resp.content:
        return []
    df = resp.content[0].sort_values(["lap", "stop"])
    return [
        {
            "driverId": clean(row.get("driverId")),
            "stop": clean(row.get("stop")),
            "lap": clean(row.get("lap")),
            "time": clean(row.get("time")),
            "durationSec": timedelta_seconds(row.get("duration")),
        }
        for row in df.to_dict("records")
    ]


def enrich_race(db, doc_snap):
    data = doc_snap.to_dict()
    year, round_num, doc_id = data["year"], data["round"], doc_snap.id

    extra_by_driver, wikipedia_url = fetch_results_enrichment(year, round_num)
    if not extra_by_driver:
        print(f"  {doc_id}: no results on re-fetch, skipping")
        return
    time.sleep(REQUEST_DELAY_SEC)

    qualifying = fetch_qualifying(year, round_num)
    time.sleep(REQUEST_DELAY_SEC)
    pit_stops = fetch_pit_stops(year, round_num)

    empty_extra = {"time": None, "driverCode": None, "fastestLap": None}
    enriched_results = [
        {**r, **extra_by_driver.get(r["driverId"], empty_extra)} for r in data["results"]
    ]

    with_retry(
        lambda: doc_snap.reference.update(
            {
                "results": enriched_results,
                "qualifying": qualifying,
                "pitStops": pit_stops,
                "wikipediaUrl": wikipedia_url,
                "enrichedAt": datetime.now(timezone.utc).isoformat(),
            }
        )
    )
    has_fastest_lap = any(r["fastestLap"] for r in enriched_results)
    print(
        f"  {doc_id}: enriched (qualifying={len(qualifying)}, pitStops={len(pit_stops)}, "
        f"fastestLap={'yes' if has_fastest_lap else 'no'})"
    )


def main():
    args = sys.argv[1:]
    if len(args) == 0:
        start, end = EARLIEST_YEAR, LATEST_YEAR
    elif len(args) == 1:
        start = end = int(args[0])
    else:
        start, end = int(args[0]), int(args[1])

    db = init_firestore()
    docs = list(
        db.collection("archive_races").where("year", ">=", start).where("year", "<=", end).stream()
    )
    docs = [d for d in docs if "enrichedAt" not in d.to_dict()]
    print(f"{len(docs)} races to enrich (year {start}-{end})")
    for doc_snap in docs:
        enrich_race(db, doc_snap)
        time.sleep(REQUEST_DELAY_SEC)
    trigger_revalidation()
    print("Done.")


if __name__ == "__main__":
    main()
