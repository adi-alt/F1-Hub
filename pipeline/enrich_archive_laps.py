"""Backfills the archive_laps table (lap-by-lap position + time per driver), available from
Ergast/Jolpi starting in 1996 (confirmed directly: present for 1996, absent for 1995 — nothing to
fetch before that year).

A separate, much heavier script from enrich_archive.py: ~1,300 timing rows for a single 66-lap
race means ~14 paginated requests per race (Jolpi caps every response at 100 rows regardless of
what's requested), versus 1-2 requests total for everything enrich_archive.py adds. Deliberately
its own run with its own idempotency flag (`laps_backfilled` on the race row) rather than folded
into that script — different runtime profile, different failure surface (many child-table rows
per race instead of one field update).

IMPORTANT: fastf1's Ergast response `.is_complete` property checks the *original* request's
limit against the total (`limit >= total`), not cumulative offset+rows-returned — so for any
response that actually needed pagination, it stays False even on the genuine last (partial) page.
Confirmed by direct testing against a real 1,320-row response (14 pages, final page holds the
last 20 rows, `.is_complete` never once reports True). This script tracks completion itself via
offset+limit vs total instead of trusting that property — trusting it would have silently
dropped every race's final partial page.

Run:
  export DATABASE_URL='<the pooled connection string, see .env.local>'
  python enrich_archive_laps.py             # every un-backfilled race, 1996-2017
  python enrich_archive_laps.py 2010        # a single season
  python enrich_archive_laps.py 2010 2015   # an inclusive year range
"""

import sys
import time
from datetime import datetime

import pandas as pd
import requests
from fastf1.ergast import Ergast

from ergast_utils import clean, format_timedelta, init_postgres, trigger_revalidation, upsert, with_retry

EARLIEST_YEAR = 1996  # confirmed via direct API check — nothing before this
LATEST_YEAR = datetime.now().year - 1
REQUEST_DELAY_SEC = 0.5
PAGE_SIZE = 100  # Jolpi's hard cap regardless of what's requested
BASE_URL = "https://api.jolpi.ca/ergast/f1"

ergast = Ergast(limit=PAGE_SIZE)


def _parse_lap_time(time_str):
    if not time_str:
        return None
    minutes, seconds = time_str.split(":")
    return pd.Timedelta(minutes=int(minutes), seconds=float(seconds))


def fetch_page_raw(year: int, round_num: int, offset: int, limit: int):
    """Manual fallback for a page fastf1's own parser can't build a DataFrame from — confirmed
    real cause (not a bug in this pipeline): Ergast/Jolpi's historical data sometimes omits a
    field entirely for one lap/driver (e.g. 2008 Spanish GP, lap 6, Bourdais has a Timings entry
    with no `position` at all — verified by fetching this exact page directly). fastf1 builds
    per-column arrays internally and can't handle that row being short one field; a plain
    list-of-dicts DataFrame tolerates a missing key fine (it just becomes NaN), so this refetches
    the same page and builds an equivalent frame by hand instead of going through fastf1 at all.

    Returns (df, offset, limit, total) — the pagination fields come from this same response's own
    `MRData`, not the caller's request params, so a caller can keep paginating from here exactly
    like it would off fastf1's `._response_headers` on the normal path."""
    resp = with_retry(lambda: requests.get(
        f"{BASE_URL}/{year}/{round_num}/laps.json",
        params={"limit": limit, "offset": offset},
        timeout=30,
    ))
    resp.raise_for_status()
    mrdata = resp.json()["MRData"]
    page_offset, page_limit, page_total = int(mrdata["offset"]), int(mrdata["limit"]), int(mrdata["total"])
    races = mrdata["RaceTable"]["Races"]
    if not races:
        return pd.DataFrame(columns=["number", "driverId", "position", "time"]), page_offset, page_limit, page_total
    rows = [
        {
            "number": int(lap["number"]),
            "driverId": timing.get("driverId"),
            "position": int(timing["position"]) if timing.get("position") is not None else None,
            "time": _parse_lap_time(timing.get("time")),
        }
        for lap in races[0].get("Laps", [])
        for timing in lap.get("Timings", [])
    ]
    return pd.DataFrame(rows), page_offset, page_limit, page_total


def fetch_all_laps(year: int, round_num: int):
    """Pages through /laps until every row is collected — see the module docstring for why this
    can't just check `.is_complete`."""
    # The very first page can hit the exact same "fastf1 can't build a DataFrame from this
    # response" failure as any later page (confirmed live: 2014's first race after 2013 hit this
    # on fastf1's initial ergast.get_lap_times() call, not a get_next_result_page() follow-up) —
    # so it needs the same raw-fallback escape hatch the rest of this function already has.
    try:
        resp = with_retry(lambda: ergast.get_lap_times(season=year, round=round_num))
        if not resp.content:
            return None
        headers = resp._response_headers
        offset, limit, total = (int(headers.get(k, 0)) for k in ("offset", "limit", "total"))
        pages = [resp.content[0]]
        use_raw_fallback = False
    except ValueError as e:
        print(f"    first page failed fastf1's own parser ({e}); using raw fetching for this whole race")
        df, offset, limit, total = fetch_page_raw(year, round_num, 0, PAGE_SIZE)
        if total == 0:
            return None
        pages = [df]
        use_raw_fallback = True

    # Once fastf1's own parser fails once for this race, its response object never advances past
    # that page (get_next_result_page() computes its next offset from *its own* stale headers) —
    # retrying it again next loop would just fail on the exact same page forever. Switch to the
    # raw fallback permanently for the rest of this race instead of fighting that.
    while offset + limit < total:
        next_offset = offset + limit
        if not use_raw_fallback:
            try:
                current = resp
                resp = with_retry(lambda: current.get_next_result_page())
                pages.append(resp.content[0])
                headers = resp._response_headers
                offset, limit, total = (int(headers.get(k, 0)) for k in ("offset", "limit", "total"))
                time.sleep(REQUEST_DELAY_SEC)
                continue
            except ValueError as e:
                print(
                    f"    page at offset {next_offset} failed fastf1's own parser ({e}); "
                    f"switching to raw fetching for the rest of this race"
                )
                use_raw_fallback = True
        df, offset, limit, total = fetch_page_raw(year, round_num, next_offset, limit)
        pages.append(df)
        time.sleep(REQUEST_DELAY_SEC)
    return pd.concat(pages, ignore_index=True)


def enrich_laps(cur, race_id: str, year: int, round_num: int):
    df = fetch_all_laps(year, round_num)
    if df is None or df.empty:
        print(f"  {race_id}: no lap data available, marking backfilled")
        cur.execute("update archive_races set laps_backfilled = true where id = %s", (race_id,))
        return

    rows = [
        {
            "archive_race_id": race_id,
            "lap_number": int(lap_number),
            "driver_id": clean(row.get("driverId")),
            "position": clean(row.get("position")),
            "time": format_timedelta(row.get("time")),
        }
        for lap_number, group in df.groupby("number")
        for row in group.to_dict("records")
        if clean(row.get("driverId"))
    ]
    upsert(cur, "archive_laps", rows, ["archive_race_id", "lap_number", "driver_id"])
    cur.execute("update archive_races set laps_backfilled = true where id = %s", (race_id,))
    print(f"  {race_id}: wrote {len(rows)} lap timing rows across {df['number'].nunique()} laps")


def main():
    args = sys.argv[1:]
    if len(args) == 0:
        start, end = EARLIEST_YEAR, LATEST_YEAR
    elif len(args) == 1:
        start = end = int(args[0])
    else:
        start, end = int(args[0]), int(args[1])
    start = max(start, EARLIEST_YEAR)

    conn = init_postgres()
    with conn.cursor() as cur:
        cur.execute(
            "select id, year, round from archive_races where year >= %s and year <= %s "
            "and not laps_backfilled order by year, round",
            (start, end),
        )
        rows = cur.fetchall()
        print(f"{len(rows)} races need lap data (year {start}-{end})")
        for race_id, year, round_num in rows:
            enrich_laps(cur, race_id, year, round_num)
            time.sleep(REQUEST_DELAY_SEC)
    conn.close()
    trigger_revalidation()
    print("Done.")


if __name__ == "__main__":
    main()
