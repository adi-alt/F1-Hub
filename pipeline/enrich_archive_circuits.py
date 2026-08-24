"""Adds `circuit_id` + race-day weather to every archive_races row, and builds a separate
archive_circuits table (one row per unique circuit, not per race — ~70-75 total) with real photos
of the track (Wikimedia Commons category off the circuit's own Wikipedia title, not that page's
own infobox image — see fetch_circuit_images's docstring for why).

Two services neither of the other two archive scripts touch, so this is safe to run without
competing with them for Jolpi's rate limit — well, half safe: `circuit_id`/lat/long still come from
one more /results call to Jolpi (its `.description` already carries them, confirmed live — no
brand-new endpoint), but weather (Open-Meteo) and the track image (Wikipedia) are separate budgets
entirely. Still queued to run only after enrich_archive.py/enrich_archive_laps.py finish, so all
three Jolpi-touching passes aren't running at once.

Idempotent via `circuit_id` on each race row (set together with `weather` in the same update, so
they're always both present or both absent) — safe to interrupt and resume. The archive_circuits
lookup is its own existence check per circuit, so a circuit already seen (this run or an earlier
one) never gets a second Wikipedia call.

Run:
  export DATABASE_URL='<the pooled connection string, see .env.local>'
  python enrich_archive_circuits.py             # every race missing circuit_id, 1950-2017
  python enrich_archive_circuits.py 1994        # a single season
  python enrich_archive_circuits.py 1994 2000   # an inclusive year range
"""

import json
import sys
import time
from datetime import datetime

import psycopg2
import requests
from fastf1.ergast import Ergast

from ergast_utils import (
    clean,
    fetch_and_upload_media_multi,
    fetch_commons_photos,
    init_postgres,
    reconnect_postgres,
    resolve_commons_category,
    trigger_revalidation,
    with_retry,
)

EARLIEST_YEAR = 1950
LATEST_YEAR = datetime.now().year - 1
REQUEST_DELAY_SEC = 0.5
WEATHER_URL = "https://archive-api.open-meteo.com/v1/archive"
WEATHER_DAILY_FIELDS = "temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,weathercode"

ergast = Ergast()


def fetch_circuit_info(year: int, round_num: int):
    """Returns (circuit_id, circuit_url, circuit_name, lat, long) — all sitting in the same
    /results response's `.description` (confirmed live), no dedicated circuit endpoint needed."""
    resp = with_retry(lambda: ergast.get_race_results(season=year, round=round_num))
    if resp.description.empty:
        return None
    row = resp.description.iloc[0]
    return {
        "circuitId": clean(row.get("circuitId")),
        "circuitUrl": clean(row.get("circuitUrl")),
        "circuitName": clean(row.get("circuitName")),
        "lat": clean(row.get("lat")),
        "long": clean(row.get("long")),
    }


def fetch_weather(lat: float, lon: float, race_date: str):
    if lat is None or lon is None or not race_date:
        return None
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": race_date,
        "end_date": race_date,
        "daily": WEATHER_DAILY_FIELDS,
        "timezone": "UTC",
    }
    resp = with_retry(lambda: requests.get(WEATHER_URL, params=params, timeout=30))
    resp.raise_for_status()
    daily = resp.json().get("daily", {})
    if not daily.get("time"):
        return None
    return {
        "tempMaxC": daily["temperature_2m_max"][0],
        "tempMinC": daily["temperature_2m_min"][0],
        "precipitationMm": daily["precipitation_sum"][0],
        "windMaxKph": daily["windspeed_10m_max"][0],
        "weatherCode": daily["weathercode"][0],
    }


def fetch_circuit_images(circuit_id: str, circuit_url: str):
    """Real photos of the circuit itself, re-hosted in the shared `media` Storage bucket. NOT the
    Wikipedia article's own infobox image - that's almost always the track-layout diagram, not a
    photo (confirmed live: Zandvoort's own article leads with its SVG track map), same reasoning
    fetch_commons_photos's docstring covers for races. Uses the Wikimedia Commons category off the
    circuit's own Wikipedia title instead (derived from `circuit_url`, already on hand - no new
    Ergast call), which reliably holds real contributor photos (confirmed live: Zandvoort's
    "Circuit Zandvoort" category alone has 2 real aerial shots, plus press/crowd photos, once
    logos are filtered out). Tries the Wikidata-resolved real category name first (see
    resolve_commons_category - the literal title fails for a real chunk of major circuits, Monza/
    Suzuka/Interlagos/Baku/the Nurburgring all confirmed live), falling back to the literal title
    if that comes up empty - covers both circuits resolve_commons_category correctly resolves and
    ones where the literal title happens to already be right."""
    if not circuit_url:
        return []
    title = circuit_url.rstrip("/").rsplit("/", 1)[-1].replace("_", " ")
    resolved = resolve_commons_category(title)
    sources = fetch_commons_photos(resolved)
    if not sources and resolved != title:
        sources = fetch_commons_photos(title)
    return fetch_and_upload_media_multi(sources, "media", f"circuits/{circuit_id}")


def enrich_circuit_and_weather(cur, race_id: str, year: int, round_num: int, race_date, seen_circuits: set):
    info = fetch_circuit_info(year, round_num)
    if not info:
        print(f"  {race_id}: no circuit info on re-fetch, skipping")
        return

    weather = fetch_weather(info["lat"], info["long"], race_date.isoformat() if race_date else None)
    circuit_id = info["circuitId"]

    # Insert the circuit row (if new) *before* pointing the race at it - circuit_id is a real FK to
    # archive_circuits now, unlike Firestore, so the parent has to exist first.
    if circuit_id and circuit_id not in seen_circuits:
        cur.execute("select 1 from archive_circuits where circuit_id = %s", (circuit_id,))
        if cur.fetchone() is None:
            image_urls = fetch_circuit_images(circuit_id, info["circuitUrl"])
            cur.execute(
                "insert into archive_circuits (circuit_id, name, wikipedia_url, image_url, image_urls, lat, long) "
                "values (%s, %s, %s, %s, %s, %s, %s)",
                (circuit_id, info["circuitName"], info["circuitUrl"], image_urls[0] if image_urls else None, image_urls, info["lat"], info["long"]),
            )
            print(f"    new circuit {circuit_id}: {len(image_urls)} image(s)")
        seen_circuits.add(circuit_id)

    cur.execute(
        "update archive_races set circuit_id = %s, weather = %s where id = %s",
        (circuit_id, json.dumps(weather) if weather else None, race_id),
    )
    print(f"  {race_id}: circuit_id={circuit_id}, weather={'yes' if weather else 'no'}")


def backfill_circuit_images(cur):
    """Separate, independently-idempotent pass (gated on `image_urls is null`) for circuits whose
    row already exists from an earlier run of the main loop below - that loop only ever fetches an
    image for a circuit the *first* time it's seen (`seen_circuits`/the existence check), so a
    circuit inserted before this Commons-based approach existed (with just the old single
    diagram-prone `image_url`) is never revisited otherwise. Same convention as
    enrich_archive.py/fetch_races.py's own backfill_race_photos()."""
    cur.execute("select circuit_id, wikipedia_url from archive_circuits where image_urls is null order by circuit_id")
    rows = cur.fetchall()
    print(f"{len(rows)} circuits need re-hosted images")
    for circuit_id, wikipedia_url in rows:
        image_urls = fetch_circuit_images(circuit_id, wikipedia_url)
        if not image_urls:
            continue
        try:
            cur.execute(
                "update archive_circuits set image_url = %s, image_urls = %s where circuit_id = %s",
                (image_urls[0], image_urls, circuit_id),
            )
        except psycopg2.Error as exc:
            # Seen live in enrich_archive.py's own version of this loop: a transient network blip
            # can take the whole Postgres connection down mid-loop - see reconnect_postgres.
            print(f"  {circuit_id}: DB write failed ({exc}), reconnecting and retrying once")
            cur = reconnect_postgres(cur.connection).cursor()
            cur.execute(
                "update archive_circuits set image_url = %s, image_urls = %s where circuit_id = %s",
                (image_urls[0], image_urls, circuit_id),
            )
        print(f"  {circuit_id}: {len(image_urls)} image(s) uploaded")
        time.sleep(REQUEST_DELAY_SEC)


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
            "select id, year, round, race_date from archive_races "
            "where year >= %s and year <= %s and circuit_id is null order by year, round",
            (start, end),
        )
        rows = cur.fetchall()
        print(f"{len(rows)} races need circuit/weather data (year {start}-{end})")

        cur.execute("select circuit_id from archive_circuits")
        seen_circuits = {row[0] for row in cur.fetchall()}
        for race_id, year, round_num, race_date in rows:
            enrich_circuit_and_weather(cur, race_id, year, round_num, race_date, seen_circuits)
            time.sleep(REQUEST_DELAY_SEC)

        backfill_circuit_images(cur)
    conn.close()
    trigger_revalidation()
    print("Done.")


if __name__ == "__main__":
    main()
