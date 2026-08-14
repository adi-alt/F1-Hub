"""Backfills the archive_races/{id}/laps subcollection (lap-by-lap position + time per driver),
available from Ergast/Jolpi starting in 1996 (confirmed directly: present for 1996, absent for
1995 — nothing to fetch before that year).

A separate, much heavier script from enrich_archive.py: ~1,300 timing rows for a single 66-lap
race means ~14 paginated requests per race (Jolpi caps every response at 100 rows regardless of
what's requested), versus 1-2 requests total for everything enrich_archive.py adds. Deliberately
its own run with its own idempotency flag (`lapsBackfilled` on the race doc) rather than folded
into that script — different runtime profile, different failure surface (many subcollection
writes per race instead of one field update).

IMPORTANT: fastf1's Ergast response `.is_complete` property checks the *original* request's
limit against the total (`limit >= total`), not cumulative offset+rows-returned — so for any
response that actually needed pagination, it stays False even on the genuine last (partial) page.
Confirmed by direct testing against a real 1,320-row response (14 pages, final page holds the
last 20 rows, `.is_complete` never once reports True). This script tracks completion itself via
offset+limit vs total instead of trusting that property — trusting it would have silently
dropped every race's final partial page.

Run:
  python enrich_archive_laps.py             # every un-backfilled race, 1996-2017
  python enrich_archive_laps.py 2010        # a single season
  python enrich_archive_laps.py 2010 2015   # an inclusive year range
"""

import sys
import time

import pandas as pd
from fastf1.ergast import Ergast

from ergast_utils import clean, format_timedelta, init_firestore, with_retry

EARLIEST_YEAR = 1996  # confirmed via direct API check — nothing before this
LATEST_YEAR = 2017
REQUEST_DELAY_SEC = 0.5
PAGE_SIZE = 100  # Jolpi's hard cap regardless of what's requested

ergast = Ergast(limit=PAGE_SIZE)


def fetch_all_laps(year: int, round_num: int):
    """Pages through /laps until every row is collected — see the module docstring for why this
    can't just check `.is_complete`."""
    resp = with_retry(lambda: ergast.get_lap_times(season=year, round=round_num))
    if not resp.content:
        return None
    pages = [resp.content[0]]
    while True:
        headers = resp._response_headers
        offset, limit, total = (int(headers.get(k, 0)) for k in ("offset", "limit", "total"))
        if offset + limit >= total:
            break
        current = resp
        resp = with_retry(lambda: current.get_next_result_page())
        pages.append(resp.content[0])
        time.sleep(REQUEST_DELAY_SEC)
    return pd.concat(pages, ignore_index=True)


def enrich_laps(db, doc_snap):
    data = doc_snap.to_dict()
    year, round_num, doc_id = data["year"], data["round"], doc_snap.id

    df = fetch_all_laps(year, round_num)
    if df is None or df.empty:
        print(f"  {doc_id}: no lap data available, marking backfilled")
        with_retry(lambda: doc_snap.reference.update({"lapsBackfilled": True}))
        return

    laps_ref = doc_snap.reference.collection("laps")
    batch = db.batch()
    lap_count = 0
    for lap_number, group in df.groupby("number"):
        timings = [
            {
                "driverId": clean(row.get("driverId")),
                "time": format_timedelta(row.get("time")),
                "position": clean(row.get("position")),
            }
            for row in group.to_dict("records")
        ]
        batch.set(laps_ref.document(str(int(lap_number))), {"lap": int(lap_number), "timings": timings})
        lap_count += 1
    batch.update(doc_snap.reference, {"lapsBackfilled": True})
    with_retry(lambda: batch.commit())
    print(f"  {doc_id}: wrote {lap_count} laps ({len(df)} total timing rows)")


def main():
    args = sys.argv[1:]
    if len(args) == 0:
        start, end = EARLIEST_YEAR, LATEST_YEAR
    elif len(args) == 1:
        start = end = int(args[0])
    else:
        start, end = int(args[0]), int(args[1])
    start = max(start, EARLIEST_YEAR)

    db = init_firestore()
    docs = list(
        db.collection("archive_races").where("year", ">=", start).where("year", "<=", end).stream()
    )
    docs = [d for d in docs if not d.to_dict().get("lapsBackfilled")]
    print(f"{len(docs)} races need lap data (year {start}-{end})")
    for doc_snap in docs:
        enrich_laps(db, doc_snap)
        time.sleep(REQUEST_DELAY_SEC)
    print("Done.")


if __name__ == "__main__":
    main()
