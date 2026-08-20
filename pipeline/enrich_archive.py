"""Enriches existing archive_races rows (see fetch_archive.py, which already ran the base
1950-2017 backfill once and isn't touched here) with data the original run either dropped
(finish time, driver code, fastest lap, Wikipedia report URL — all sitting in the same /results
response already fetched the first time, just not selected) or never fetched at all (qualifying,
pit stops — two genuinely new per-race calls). Sprint results aren't fetched: sprints didn't
exist until 2021, well past this archive's 2017 cutoff, so every call would come back empty.

Idempotent via archive_races.enriched_at — safe to interrupt and resume, same "already have it,
skip" convention fetch_archive.py uses (there via row existence, here via a timestamp column on a
row that already exists).

Run:
  export DATABASE_URL='<the pooled connection string, see .env.local>'
  python enrich_archive.py                 # every un-enriched race, 1950-2017
  python enrich_archive.py 1994             # a single season
  python enrich_archive.py 1994 2000        # an inclusive year range
"""

import json
import sys
import time
from datetime import datetime, timezone

from fastf1.ergast import Ergast

from ergast_utils import clean, format_timedelta, init_postgres, timedelta_seconds, trigger_revalidation, upsert, with_retry

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


def enrich_race(cur, race_id: str, year: int, round_num: int):
    extra_by_driver, wikipedia_url = fetch_results_enrichment(year, round_num)
    if not extra_by_driver:
        print(f"  {race_id}: no results on re-fetch, skipping")
        return
    time.sleep(REQUEST_DELAY_SEC)

    qualifying = fetch_qualifying(year, round_num)
    time.sleep(REQUEST_DELAY_SEC)
    pit_stops = fetch_pit_stops(year, round_num)

    # Partial UPDATEs onto rows fetch_archive.py already inserted (not upsert() - those rows
    # already have their other required columns filled in; this only ever adds the three fields
    # the original backfill dropped).
    for driver_id, extra in extra_by_driver.items():
        cur.execute(
            "update archive_results set time = %s, driver_code = %s, fastest_lap = %s "
            "where archive_race_id = %s and driver_id = %s",
            (extra["time"], extra["driverCode"], json.dumps(extra["fastestLap"]) if extra["fastestLap"] else None, race_id, driver_id),
        )

    quali_rows = [
        {
            "archive_race_id": race_id,
            "driver_id": q["driverId"],
            "position": q["position"],
            "driver_name": q["driverName"],
            "constructor": q["constructor"],
            "q1": q["q1"],
            "q2": q["q2"],
            "q3": q["q3"],
        }
        for q in qualifying
    ]
    upsert(cur, "archive_qualifying", quali_rows, ["archive_race_id", "driver_id"])

    pitstop_rows = [
        {
            "archive_race_id": race_id,
            "driver_id": p["driverId"],
            "stop": p["stop"],
            "lap": p["lap"],
            "time": p["time"],
            "duration_sec": p["durationSec"],
        }
        for p in pit_stops
    ]
    upsert(cur, "archive_pit_stops", pitstop_rows, ["archive_race_id", "driver_id", "stop"])

    cur.execute(
        "update archive_races set wikipedia_url = %s, enriched_at = %s where id = %s",
        (wikipedia_url, datetime.now(timezone.utc), race_id),
    )

    has_fastest_lap = any(e["fastestLap"] for e in extra_by_driver.values())
    print(
        f"  {race_id}: enriched (qualifying={len(qualifying)}, pitStops={len(pit_stops)}, "
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

    conn = init_postgres()
    with conn.cursor() as cur:
        cur.execute(
            "select id, year, round from archive_races where year >= %s and year <= %s and enriched_at is null "
            "order by year, round",
            (start, end),
        )
        rows = cur.fetchall()
        print(f"{len(rows)} races to enrich (year {start}-{end})")
        for race_id, year, round_num in rows:
            enrich_race(cur, race_id, year, round_num)
            time.sleep(REQUEST_DELAY_SEC)
    conn.close()
    trigger_revalidation()
    print("Done.")


if __name__ == "__main__":
    main()
