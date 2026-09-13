"""Backfill pre-2018 seasons (1950-2017) from Ergast/Jolpi into their own `archive_races`/
`archive_results` tables — kept entirely separate from `races`, which is FastF1-native and what
every ML model and page under /season reads. Ergast has no lap telemetry or tyre data for this
era (and nothing resembling it before the mid-1990s even for qualifying), so an archive row is
deliberately just name/circuit/date plus the classified race result — a history browser, not
training data.

Row id: `{year}_r{round:02d}_{event-slug}`, same convention as `races` for readability.

Per-round queries (not per-season) because Ergast/Jolpi's default page size is far smaller than a
season's total result-row count but always larger than one race's (~20-26 rows) — so every
request here is a single complete page, no pagination bookkeeping needed.

Already-fetched rounds are skipped by id existence (not a status field) — a race from 1973 is
never going to change, so "row exists" is the whole freshness check, making reruns of this script
free to resume after an interruption.

Run:
  export DATABASE_URL='<the pooled connection string, see .env.local>'
  python pipeline/fetch_archive.py                 # full 1950-2017 backfill
  python pipeline/fetch_archive.py 1994             # a single season
  python pipeline/fetch_archive.py 1994 2000        # an inclusive year range
"""

from __future__ import annotations

import re
import sys
import time
import unicodedata
from datetime import datetime

from fastf1.ergast import Ergast

from ergast_utils import clean, init_postgres, trigger_revalidation, upsert, with_retry

EARLIEST_YEAR = 1950
# Last year, not a fixed year — this season isn't over yet, so it's never "archived." Dynamic so
# this needs no code change at a year boundary, same reasoning fetch_races.py already documents
# for never hardcoding a year.
LATEST_YEAR = datetime.now().year - 1
REQUEST_DELAY_SEC = 0.5  # a free, community-run API — no need to hammer it for a one-time backfill

ergast = Ergast()


def slugify(name: str) -> str:
    ascii_only = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_only.lower()).strip("-")


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


def already_have(cur, race_id: str) -> bool:
    cur.execute("select 1 from archive_races where id = %s", (race_id,))
    return cur.fetchone() is not None


def build_and_push(cur, year: int, race_row: dict):
    round_num = int(race_row["round"])
    race_name = str(race_row["raceName"])
    race_id = f"{year}_r{round_num:02d}_{slugify(race_name)}"

    if already_have(cur, race_id):
        print(f"  {race_id}: already have it, skipping")
        return

    results = fetch_round_results(year, round_num)
    if not results:
        print(f"  {race_id}: no results available, skipping")
        return

    # circuit_id/wikipedia_url/weather/laps_backfilled all come from later enrichment passes
    # (enrich_archive_circuits.py, enrich_archive_laps.py) - left unset here, same phased-fields
    # contract this pipeline always had, just a Postgres row instead of a Firestore doc now.
    race_row_data = {
        "id": race_id,
        "year": year,
        "round": round_num,
        "race_name": race_name,
        "circuit_name": clean(race_row.get("circuitName")),
        "locality": clean(race_row.get("locality")),
        "country": clean(race_row.get("country")),
        "race_date": clean(race_row.get("raceDate")),
    }
    with_retry(lambda: upsert(cur, "archive_races", [race_row_data], ["id"]))
    # team_id (the canonicalized slug) comes from enrich_archive_entities.py, same as it always
    # did — left null here, not computed eagerly, since archive_teams (its own FK target) doesn't
    # have a row for it yet at this point in the pipeline.
    result_rows = [
        {
            "archive_race_id": race_id,
            "driver_id": r["driverId"],
            "position": r["position"],
            "position_text": r["positionText"],
            "grid": r["grid"],
            "laps": r["laps"],
            "status": r["status"],
            "points": r["points"],
            "driver_name": r["driverName"],
            "constructor": r["constructor"],
        }
        for r in results
    ]
    with_retry(lambda: upsert(cur, "archive_results", result_rows, ["archive_race_id", "driver_id"]))
    print(f"  {race_id}: pushed {len(results)} results")


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
        for year in range(start, end + 1):
            print(f"Season {year}:")
            rounds = fetch_season_rounds(year)
            for race_row in rounds:
                build_and_push(cur, year, race_row)
                time.sleep(REQUEST_DELAY_SEC)
    conn.close()
    trigger_revalidation()
    print("Done.")


if __name__ == "__main__":
    main()
