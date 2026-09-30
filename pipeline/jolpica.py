"""Official classification and qualifying straight from Jolpica-F1's HTTP API (the Ergast successor
FastF1 itself reads), for when FastF1 cannot load a session at all.

That is every session on GitHub's runners: F1's live-timing service is unreachable from them, so
FastF1 logs "Failed to load timing data" and returns no results for practice, qualifying or the race
(seen in every fetch-races run of the 2026 Madrid and Azerbaijan weekends). Before this module, a
round therefore never received its official result automatically - Madrid stayed on OpenF1's
preliminary classification until someone ran the pipeline on a machine where FastF1 works. Jolpica
itself is a plain JSON API with no such block.

Only the CLASSIFICATION comes from here: positions, status, points, grid, gaps and times. Driver
names and team names are the caller's business (fetch_races.py takes them from the app's own roster
and OpenF1), because Jolpica's constructor names differ from the ones stored everywhere else
("Red Bull" vs "Red Bull Racing", "RB F1 Team" vs "Racing Bulls").

A round is accepted only when Jolpica's race date equals FastF1's event date for that round - the
same "pin it to the date, never guess" rule as openf1_fallback._pick_race_session(), because a
round-numbering difference between two sources is exactly how the wrong race gets written.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from datetime import date, datetime

BASE_URL = "https://api.jolpi.ca/ergast/f1"
TIMEOUT_SECONDS = 30


RETRY_DELAYS_SECONDS = (2, 5, 10)  # Jolpica rate-limits bursts too (429); same policy as openf1_fallback._get


def _get(path: str) -> dict:
    req = urllib.request.Request(f"{BASE_URL}/{path}", headers={"User-Agent": "apex-f1-hub-pipeline"})
    for attempt, delay in enumerate((*RETRY_DELAYS_SECONDS, None)):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
                return json.load(resp)["MRData"]
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or delay is None:
                raise
            try:
                wait = min(float(exc.headers.get("Retry-After", "")), 20.0)
            except ValueError:
                wait = delay
            print(f"    jolpica: {path} returned {exc.code}, retrying in {wait:g}s ({attempt + 1}/{len(RETRY_DELAYS_SECONDS)})")
            time.sleep(wait)
    raise RuntimeError("unreachable")


def _as_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if hasattr(value, "date"):  # pandas Timestamp
        return value.date()
    return date.fromisoformat(str(value)[:10])


def parse_lap_time(text: str | None) -> float | None:
    """'1:44.916' -> 104.916, '44.916' -> 44.916, None/'' -> None."""
    if not text:
        return None
    minutes, _, seconds = text.rpartition(":")
    return round((int(minutes) * 60 if minutes else 0) + float(seconds), 3)


def _race_for(payload: dict, year: int, round_num: int, event_date) -> dict | None:
    """The single race in a Jolpica response, if it is this round on this date - else None.
    Accepts the raw response or its "MRData" body."""
    payload = payload.get("MRData", payload)
    races = payload.get("RaceTable", {}).get("Races", [])
    if not races:
        return None
    race = races[0]
    expected = _as_date(event_date)
    if int(race.get("season", 0)) != year or int(race.get("round", 0)) != round_num:
        print(f"    jolpica: response is for {race.get('season')} round {race.get('round')}, not {year} round {round_num} - not using it")
        return None
    if expected is not None and _as_date(race.get("date")) != expected:
        print(f"    jolpica: round {round_num} is dated {race.get('date')} but this event is on {expected} - not guessing")
        return None
    return race


def _looks_complete(rows: list[dict], position_key: str) -> str | None:
    """None if this reads as a real, complete classification; otherwise the reason it doesn't."""
    if len(rows) < 10:
        return f"only {len(rows)} classified cars"
    codes = [r["driver"] for r in rows]
    if len(set(codes)) != len(codes) or any(not c for c in codes):
        return "missing or duplicate driver codes"
    positions = sorted(r[position_key] for r in rows)
    if positions != list(range(1, len(rows) + 1)):
        return f"positions are not a clean 1..{len(rows)} run"
    return None


def parse_results(payload: dict, year: int, round_num: int, event_date) -> list[dict] | None:
    """Race classification rows, or None when Jolpica hasn't published this round yet or the
    response isn't this round / isn't a complete classification."""
    race = _race_for(payload, year, round_num, event_date)
    if race is None or not race.get("Results"):
        return None
    winner_millis = None
    winner_laps = None
    rows = []
    for r in race["Results"]:
        timing = r.get("Time") or {}
        # A gap to the winner exists only for cars that finished on the lead lap. Jolpica also
        # reports the elapsed time of a car that retired (2026 Baku: Bottas, out on lap 49 of 51,
        # has millis but an empty display time), which must not become a negative "gap".
        millis = timing.get("millis") if timing.get("time") else None
        if int(r["position"]) == 1:
            winner_millis = int(millis) if millis else None
            winner_laps = r.get("laps")
        rows.append(
            {
                "driver": r["Driver"].get("code"),
                "driverName": f"{r['Driver'].get('givenName', '')} {r['Driver'].get('familyName', '')}".strip(),
                "constructor": r["Constructor"].get("name"),
                "gridPosition": int(r["grid"]) if r.get("grid") not in (None, "") else None,
                "finishPosition": int(r["position"]),
                "rawStatus": r.get("status") or "",
                "points": float(r.get("points") or 0),
                "millis": int(millis) if millis and r.get("laps") == (winner_laps or r.get("laps")) else None,
                "fastestLapSec": parse_lap_time(((r.get("FastestLap") or {}).get("Time") or {}).get("time")),
            }
        )
    for row in rows:
        if row["finishPosition"] == 1:
            row["finishGapSec"] = 0
        elif row["millis"] is not None and winner_millis is not None:
            row["finishGapSec"] = round((row["millis"] - winner_millis) / 1000, 3)
        else:
            row["finishGapSec"] = None  # lapped or not classified on time
        del row["millis"]
    reason = _looks_complete(rows, "finishPosition")
    if reason:
        print(f"    jolpica: round {round_num} results rejected ({reason})")
        return None
    return sorted(rows, key=lambda r: r["finishPosition"])


def parse_qualifying(payload: dict, year: int, round_num: int, event_date) -> list[dict] | None:
    """Qualifying rows with each driver's best time in the last part they reached (Q3, else Q2, else
    Q1 - the same rule fetch_races.fetch_qualifying() applies to FastF1's frame), or None."""
    race = _race_for(payload, year, round_num, event_date)
    if race is None or not race.get("QualifyingResults"):
        return None
    rows = []
    for q in race["QualifyingResults"]:
        best = next((parse_lap_time(q.get(part)) for part in ("Q3", "Q2", "Q1") if q.get(part)), None)
        rows.append(
            {
                "driver": q["Driver"].get("code"),
                "driverName": f"{q['Driver'].get('givenName', '')} {q['Driver'].get('familyName', '')}".strip(),
                "constructor": q["Constructor"].get("name"),
                "gridPosition": int(q["position"]),
                "bestSec": best,
            }
        )
    reason = _looks_complete(rows, "gridPosition")
    if reason:
        print(f"    jolpica: round {round_num} qualifying rejected ({reason})")
        return None
    return sorted(rows, key=lambda r: r["gridPosition"])


def fetch_results(year: int, round_num: int, event_date) -> list[dict] | None:
    try:
        return parse_results(_get(f"{year}/{round_num}/results.json"), year, round_num, event_date)
    except Exception as exc:  # network, JSON, schema - never fatal, just "not available"
        print(f"    jolpica: results not available ({exc})")
        return None


def fetch_qualifying(year: int, round_num: int, event_date) -> list[dict] | None:
    try:
        return parse_qualifying(_get(f"{year}/{round_num}/qualifying.json"), year, round_num, event_date)
    except Exception as exc:
        print(f"    jolpica: qualifying not available ({exc})")
        return None
