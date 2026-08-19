"""Adds `circuitId` + race-day weather to every archive_races doc, and builds a separate
archive_circuits collection (one doc per unique circuit, not per race — ~70-75 total) with a real
track image sourced from the circuit's own Wikipedia page.

Two services neither of the other two archive scripts touch, so this is safe to run without
competing with them for Jolpi's rate limit — well, half safe: `circuitId`/lat/long still come from
one more /results call to Jolpi (its `.description` already carries them, confirmed live — no
brand-new endpoint), but weather (Open-Meteo) and the track image (Wikipedia) are separate budgets
entirely. Still queued to run only after enrich_archive.py/enrich_archive_laps.py finish, so all
three Jolpi-touching passes aren't running at once.

Idempotent via a `circuitId` field on each race doc (set together with `weather` in the same
update, so they're always both present or both absent) — safe to interrupt and resume. The
archive_circuits lookup is its own existence check per circuit, so a circuit already seen (this
run or an earlier one) never gets a second Wikipedia call.

Run:
  python enrich_archive_circuits.py             # every race missing circuitId, 1950-2017
  python enrich_archive_circuits.py 1994        # a single season
  python enrich_archive_circuits.py 1994 2000   # an inclusive year range
"""

import sys
import time
from datetime import datetime

import requests
from fastf1.ergast import Ergast

from ergast_utils import clean, init_firestore, trigger_revalidation, with_retry

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
    "User-Agent": "F1Hub-ArchiveEnrichment/1.0 (https://apex-chi-inky.vercel.app; one-off circuit-image backfill)"
}


def fetch_circuit_image(circuit_url: str):
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


def enrich_circuit_and_weather(db, doc_snap, seen_circuits: set[str]):
    data = doc_snap.to_dict()
    year, round_num, doc_id = data["year"], data["round"], doc_snap.id

    info = fetch_circuit_info(year, round_num)
    if not info:
        print(f"  {doc_id}: no circuit info on re-fetch, skipping")
        return

    weather = fetch_weather(info["lat"], info["long"], data.get("raceDate"))

    with_retry(
        lambda: doc_snap.reference.update({"circuitId": info["circuitId"], "weather": weather})
    )

    circuit_id = info["circuitId"]
    if circuit_id and circuit_id not in seen_circuits:
        circuit_ref = db.collection("archive_circuits").document(circuit_id)
        if not circuit_ref.get().exists:
            image_url = fetch_circuit_image(info["circuitUrl"])
            with_retry(
                lambda: circuit_ref.set(
                    {
                        "circuitId": circuit_id,
                        "name": info["circuitName"],
                        "wikipediaUrl": info["circuitUrl"],
                        "imageUrl": image_url,
                        "lat": info["lat"],
                        "long": info["long"],
                    }
                )
            )
            print(f"    new circuit {circuit_id}: image={'yes' if image_url else 'no'}")
        seen_circuits.add(circuit_id)

    print(f"  {doc_id}: circuitId={circuit_id}, weather={'yes' if weather else 'no'}")


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
    docs = [d for d in docs if "circuitId" not in d.to_dict()]
    print(f"{len(docs)} races need circuit/weather data (year {start}-{end})")

    seen_circuits = {d.id for d in db.collection("archive_circuits").stream()}
    for doc_snap in docs:
        enrich_circuit_and_weather(db, doc_snap, seen_circuits)
        time.sleep(REQUEST_DELAY_SEC)
    trigger_revalidation()
    print("Done.")


if __name__ == "__main__":
    main()
