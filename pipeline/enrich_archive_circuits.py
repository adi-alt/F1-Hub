"""Adds `circuit_id` + race-day weather to every archive_races row, and builds a separate
archive_circuits table (one row per unique circuit, not per race — ~70-75 total) with a real
track image sourced from the circuit's own Wikipedia page.

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

import requests
from fastf1.ergast import Ergast

from ergast_utils import clean, fetch_and_upload_media, init_postgres, trigger_revalidation, with_retry

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


WIKIPEDIA_HEADERS = {
    # Wikipedia's API rejects (403) any request with no User-Agent identifying the caller — see
    # https://w.wiki/4wJS — confirmed live, not documented anywhere obvious beforehand.
    "User-Agent": "F1Hub-ArchiveEnrichment/1.0 (https://apexf1hub.vercel.app; one-off circuit-image backfill)"
}


def fetch_circuit_image_source(circuit_url: str):
    """The raw Wikipedia-hosted URL — never stored directly (see fetch_circuit_image below),
    only ever passed straight into fetch_and_upload_media so the app owns a copy in Storage
    instead of depending on Wikipedia's hosting staying put."""
    if not circuit_url:
        return None
    title = circuit_url.rstrip("/").rsplit("/", 1)[-1]
    resp = with_retry(
        lambda: requests.get(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{title}",
            headers=WIKIPEDIA_HEADERS,
            timeout=30,
        )
    )
    if resp.status_code != 200:
        return None
    data = resp.json()
    image = data.get("originalimage") or data.get("thumbnail")
    return image.get("source") if image else None


def fetch_circuit_image(circuit_id: str, circuit_url: str):
    """Downloads the Wikipedia source image and re-hosts it in the shared `media` Storage bucket
    (see ergast_utils.fetch_and_upload_media) — returns the Storage URL that actually gets stored
    in archive_circuits.image_url, never the Wikipedia one."""
    source = fetch_circuit_image_source(circuit_url)
    if not source:
        return None
    return fetch_and_upload_media(source, "media", f"circuits/{circuit_id}.png")


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
            image_url = fetch_circuit_image(circuit_id, info["circuitUrl"])
            cur.execute(
                "insert into archive_circuits (circuit_id, name, wikipedia_url, image_url, lat, long) "
                "values (%s, %s, %s, %s, %s, %s)",
                (circuit_id, info["circuitName"], info["circuitUrl"], image_url, info["lat"], info["long"]),
            )
            print(f"    new circuit {circuit_id}: image={'yes' if image_url else 'no'}")
        seen_circuits.add(circuit_id)

    cur.execute(
        "update archive_races set circuit_id = %s, weather = %s where id = %s",
        (circuit_id, json.dumps(weather) if weather else None, race_id),
    )
    print(f"  {race_id}: circuit_id={circuit_id}, weather={'yes' if weather else 'no'}")


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
    conn.close()
    trigger_revalidation()
    print("Done.")


if __name__ == "__main__":
    main()
