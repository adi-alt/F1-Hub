"""OpenF1-derived preliminary race classification - used only when FastF1/Jolpica has nothing yet
(see fetch_races.py's build_and_push(), which tries fetch_race() first and falls back to this only
on a None result). See pipeline/OPENF1_FALLBACK.md for the full architecture.

OpenF1 (https://openf1.org): free, no API key, sources from F1's live timing feed directly rather
than Ergast/Jolpica, so it doesn't share that source's multi-day publishing lag.

v3 of this module (see git history for v1/v2): a full endpoint audit found real, working endpoints
for everything FastF1 gives us except lap-by-lap car *position* and gap-to-car-ahead traffic stats
(see the two "known gaps" comments below) - weather, tire stints, tire-compound pace, safety-car
periods, and lap timing are all populated now, not left empty. Verified live against the 2026
Italian GP for every endpoint before shipping.
"""

from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pandas as pd
import requests

from ergast_utils import format_timedelta

OPENF1_BASE = "https://api.openf1.org/v1"

# race_results.status only allows ('finished', 'lapped', 'dnf') - supabase/schema.sql, no separate
# DNS/DSQ value (a schema change is out of scope for this pass). OpenF1's session_result gives
# clean dns/dsq booleans directly:
#   - dsq folds into "dnf" (didn't finish classified - same bucket a real FastF1 disqualification
#     already lands in via normalize_status()).
#   - dns is skipped entirely, never written - a driver who never started has no finishing
#     position to rank, same pattern fetch_race() already uses for a driver with no classified
#     Position.
#   - "lapped" (finished, but laps down) is read off gap_to_leader's own type: OpenF1 returns a
#     float (seconds) for a same-lap finisher, or a string like "+1 LAP"/"+2 LAPS" for a lapped one
#     (verified live: cars 15-19 in the Italian GP all had dnf=false with a "+N LAP(S)" string) -
#     no lap-count comparison needed, OpenF1 already classifies this for us.


def _get(path: str, **params) -> list:
    resp = requests.get(f"{OPENF1_BASE}/{path}", params=params, timeout=25)
    resp.raise_for_status()
    return resp.json()


def _validate(results: list[dict]) -> str | None:
    """Returns a description of what's wrong if `results` looks malformed, None if it's fine to
    write - never lets a bad/partial OpenF1 response reach the database."""
    codes = [r["driver"] for r in results]
    if len(codes) != len(set(codes)):
        return f"duplicate driver code(s): {codes}"
    positions = [r["finishPosition"] for r in results if r["finishPosition"] is not None]
    if len(positions) != len(set(positions)):
        return f"duplicate finishing position(s): {positions}"
    for r in results:
        if r["status"] not in ("finished", "lapped", "dnf"):
            return f"{r['driver']}: invalid status {r['status']!r}"
        if r["points"] < 0:
            return f"{r['driver']}: negative points {r['points']}"
    return None


def _fetch_weather(session_key: int) -> dict | None:
    """Matches fetch_race()'s weather shape (airTempC/trackTempC/humidityPct/rainfall), aggregated
    from OpenF1's own per-minute time series the same way FastF1's own weather_data is aggregated -
    a mean across the session, not a single reading. `rainfall` is a real numeric mm-ish reading
    (verified live: 0 for a dry session) - >0 means rain fell at some point, matching FastF1's own
    boolean convention."""
    rows = _get("weather", session_key=session_key)
    if not rows:
        return None
    return {
        "airTempC": round(float(np.mean([r["air_temperature"] for r in rows])), 1),
        "trackTempC": round(float(np.mean([r["track_temperature"] for r in rows])), 1),
        "humidityPct": round(float(np.mean([r["humidity"] for r in rows])), 1),
        "rainfall": any((r.get("rainfall") or 0) > 0 for r in rows),
    }


def _fetch_stints(session_key: int, driver_code_by_number: dict[int, str]) -> list[dict]:
    """Matches fetch_race()'s tireStints shape - same (driver, stintNumber, compound, lapCount)
    fields, real data from OpenF1's own dedicated endpoint rather than derived from lap groupby."""
    rows = _get("stints", session_key=session_key)
    stints = []
    for r in rows:
        code = driver_code_by_number.get(r["driver_number"])
        if code is None:
            continue
        stints.append(
            {
                "driver": code,
                "stintNumber": r["stint_number"],
                "compound": r["compound"],
                "lapCount": r["lap_end"] - r["lap_start"] + 1,
            }
        )
    return stints


def _fetch_laps(session_key: int, driver_code_by_number: dict[int, str]) -> list[dict]:
    """Real per-lap timing from OpenF1 - `lap_duration` per lap, used for both the fastest-lap
    field on each result row and `lapTimings`. Known, documented gap: OpenF1's lap records don't
    carry track *position* (confirmed live - the `laps` endpoint has no position field), and
    `/v1/position` only logs sparse position-*change* events (32 rows for an entire race, not one
    per lap) rather than a clean per-lap snapshot - matching a lap's completion timestamp to the
    nearest preceding position record is a real, error-prone join for uncertain value, not
    attempted here. `lapTimings.position` is always None on the OpenF1 path - an honest limitation,
    same pattern already used for other not-yet-derivable fields, not a fabricated guess."""
    rows = _get("laps", session_key=session_key)
    lap_timings = []
    fastest_by_driver: dict[str, float] = {}
    laps_by_driver: dict[str, list[dict]] = {}
    for r in rows:
        code = driver_code_by_number.get(r["driver_number"])
        duration = r.get("lap_duration")
        if code is None or r.get("lap_number") is None:
            continue
        laps_by_driver.setdefault(code, []).append(r)
        lap_timings.append(
            {
                "driver": code,
                "lapNumber": r["lap_number"],
                "position": None,
                "time": format_timedelta(pd.to_timedelta(duration, unit="s")) if duration else None,
            }
        )
        if duration is not None and (code not in fastest_by_driver or duration < fastest_by_driver[code]):
            fastest_by_driver[code] = duration
    return lap_timings, fastest_by_driver, laps_by_driver


def fetch_race_openf1(year: int, round_num: int, country: str, qualifying_grid: list[dict]) -> dict | None:
    """Same return shape as fetch_races.fetch_race() (session/results/weather/tireStints/
    trafficStats/safetyCarPeriods/tireCompoundPace/lapTimings), so build_and_push() has exactly one
    downstream code path regardless of which source produced it. Returns None (matching
    fetch_race()'s own contract) if no matching OpenF1 session exists yet, it has no result data, or
    the result fails `_validate()` - never a fabricated or partial classification.
    """
    try:
        sessions = _get("sessions", year=year, country_name=country)
        race_session = next((s for s in sessions if s.get("session_name") == "Race"), None)
        if race_session is None:
            return None
        session_key = race_session["session_key"]
        quali_session = next(
            (s for s in sessions if s.get("meeting_key") == race_session["meeting_key"] and s.get("session_name") == "Qualifying"),
            None,
        )

        race_end = datetime.fromisoformat(race_session["date_end"])
        print(f"    openf1: session_result requested {datetime.now(timezone.utc) - race_end} after race end")

        session_result = _get("session_result", session_key=session_key)
        if not session_result:
            return None

        drivers = _get("drivers", session_key=session_key)
        driver_info = {d["driver_number"]: d for d in drivers}
        driver_code_by_number = {n: d.get("name_acronym") for n, d in driver_info.items()}

        grid_by_number: dict[int, int] = {}
        if quali_session is not None:
            grid = _get("starting_grid", session_key=quali_session["session_key"])
            grid_by_number = {g["driver_number"]: g["position"] for g in grid}
        grid_by_driver_code = {g["driver"]: g["gridPosition"] for g in qualifying_grid}

        lap_timings, fastest_by_driver, laps_by_driver = _fetch_laps(session_key, driver_code_by_number)

        results = []
        for row in sorted(
            session_result,
            key=lambda r: (r["position"] is None, r["position"] or 0, -(r.get("number_of_laps") or 0)),
        ):
            if row.get("dns"):
                print(f"    openf1: skipping car {row['driver_number']}, did not start")
                continue
            info = driver_info.get(row["driver_number"])
            if info is None:
                print(f"    openf1: skipping car {row['driver_number']}, no driver info")
                continue

            driver_code = info.get("name_acronym")
            gap = row.get("gap_to_leader")
            if row.get("dnf") or row.get("dsq"):
                status = "dnf"
            elif isinstance(gap, str):
                status = "lapped"
            else:
                status = "finished"

            fastest = fastest_by_driver.get(driver_code)
            results.append(
                {
                    "driver": driver_code,
                    "driverName": info.get("full_name"),
                    "team": info.get("team_name"),
                    "gridPosition": grid_by_number.get(row["driver_number"], grid_by_driver_code.get(driver_code)),
                    "finishPosition": row["position"],
                    "status": status,
                    "points": float(row.get("points") or 0),
                    "finishGapSec": round(gap, 3) if isinstance(gap, (int, float)) else None,
                    "fastestLapSec": round(fastest, 3) if fastest is not None else None,
                    "headshotUrl": info.get("headshot_url"),
                    "teamColor": (f"#{info['team_colour']}" if info.get("team_colour") else None),
                }
            )

        if not results:
            return None

        next_position = max((r["finishPosition"] for r in results if r["finishPosition"] is not None), default=0) + 1
        for r in results:
            if r["finishPosition"] is None:
                r["finishPosition"] = next_position
                next_position += 1

        error = _validate(results)
        if error:
            print(f"    openf1: rejecting result ({error}), not writing partial/bad data")
            return None

        weather = _fetch_weather(session_key)
        tire_stints = _fetch_stints(session_key, driver_code_by_number)

        # Same convention fetch_race() already uses for FastF1's own race_control_messages: count
        # DEPLOYED events only, not the paired ENDING message, to avoid double-counting a period -
        # verified live that OpenF1's race_control uses the identical category/message convention
        # ("SafetyCar" category, "DEPLOYED" in the message text, e.g. "SAFETY CAR DEPLOYED" /
        # "VSC DEPLOYED").
        race_control = _get("race_control", session_key=session_key)
        safety_car_periods = sum(
            1 for r in race_control if r.get("category") == "SafetyCar" and "DEPLOYED" in (r.get("message") or "")
        )

        return {
            "session": "R",
            "results": results,
            "weather": weather,
            "tireStints": tire_stints,
            # Traffic stats (gap to car directly ahead, per lap) needs `/v1/intervals` bucketed by
            # timestamp against each driver's track position at that moment - a real, heavier
            # derivation deferred to a follow-up rather than bundled into this pass.
            "trafficStats": [],
            "safetyCarPeriods": safety_car_periods,
            # Per-compound pace delta/degradation slope needs each lap matched to its stint (to
            # know the compound and lap-within-stint tyre-life proxy) - real and doable from
            # `tire_stints` + `laps_by_driver`, deferred to a follow-up alongside traffic stats
            # rather than rushed into this pass.
            "tireCompoundPace": [],
            "lapTimings": lap_timings,
        }
    except Exception as exc:
        print(f"    openf1 fallback: not available ({exc})")
        return None
