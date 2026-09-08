"""OpenF1-derived preliminary race classification - used only when FastF1/Jolpica has nothing yet
(see fetch_races.py's build_and_push(), which tries fetch_race() first and falls back to this only
on a None result). See pipeline/OPENF1_FALLBACK.md for the full architecture.

OpenF1 (https://openf1.org): free, no API key, sources from F1's live timing feed directly rather
than Ergast/Jolpica, so it doesn't share that source's multi-day publishing lag.

v3 of this module (see git history for v1/v2): a full endpoint audit found real, working endpoints
for everything FastF1 gives us except lap-by-lap car *position* (see `_fetch_laps`' own docstring
for why that one stays an honest gap) - weather, tire stints, tire-compound pace, traffic stats,
safety-car periods, and lap timing are all populated now, not left empty. Tire-compound pace and
traffic stats port fetch_race()'s own exact methodology (same grouping, same thresholds, same
uncorrected slope) rather than inventing new constants, so the numbers mean the same thing
regardless of which source produced them. Verified live against the 2026 Italian GP for every
endpoint before shipping.
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


def _fetch_stints(session_key: int) -> list[dict]:
    """Raw /v1/stints rows - kept as-is (not yet driver-code-mapped or shaped) since both
    tireStints and tireCompoundPace need this same raw data for different purposes."""
    return _get("stints", session_key=session_key)


def _stints_to_tire_stints(stints_raw: list[dict], driver_code_by_number: dict[int, str]) -> list[dict]:
    """Matches fetch_race()'s tireStints shape - same (driver, stintNumber, compound, lapCount)
    fields, real data from OpenF1's own dedicated endpoint rather than derived from lap groupby."""
    stints = []
    for r in stints_raw:
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


def _fetch_tire_compound_pace(
    stints_raw: list[dict], laps_by_driver: dict[str, list[dict]], driver_code_by_number: dict[int, str]
) -> list[dict]:
    """Ports fetch_race()'s exact tireCompoundPace method onto OpenF1 data - same grouping by
    (driver, compound), not per-stint (a driver running the same compound across two separate
    stints already gets combined into one aggregate in the FastF1 path, so this must too), the
    same >=3-lap minimum before computing anything, the same nunique-tyre-life>=2 gate before
    fitting a slope, and the identical uncorrected linear fit - no fuel-burn adjustment, matching
    fetch_race()'s own documented reasoning for why that's a deliberate limitation, not an
    oversight (conflating tire wear with fuel burn-off and track evolution is a known, accepted
    imprecision of this proxy on the FastF1 path already - adding a fuel correction here would
    make the two paths compute genuinely different things under the same column name).

    `tyre_age_at_start` (from /v1/stints) plus the lap's position within the stint is OpenF1's
    equivalent of FastF1's own `TyreLife` column - the tyre-life x-axis for the regression.
    Excludes `is_pit_out_lap` laps (OpenF1's direct equivalent of FastF1's PitOutTime check).

    Also excludes any lap slower than 1.3x the session's own fastest lap - found necessary live,
    not a guess: the 2026 Italian GP had a genuine red flag (race suspended lap 3, restarted with
    a second standing start lap 5, confirmed via race_control's own "RED FLAG - RACE SUSPENDED" /
    "STANDING START" messages), and OpenF1's lap_duration for the lap spanning that suspension was
    1958 seconds - real data, not corrupted, but it includes the ~35-minute real-world stoppage,
    not driving time. FastF1's own `IsAccurate` flag exists specifically to exclude exactly this
    class of lap (red flag/VSC/safety car - none of which reflect genuine tyre-limited pace);
    OpenF1 has no per-lap equivalent, so this is the closest available substitute. 1.3x is a fixed
    external reference (the session's own fastest lap), not a self-referential stint-median cutoff
    - a stint-relative filter would risk excluding the very late-stint degradation it's meant to
    measure, since lap times legitimately climb as a tyre wears.
    """
    all_durations = [
        lap["lap_duration"]
        for laps in laps_by_driver.values()
        for lap in laps
        if lap.get("lap_duration") and not lap.get("is_pit_out_lap")
    ]
    if not all_durations:
        return []
    session_best_sec = min(all_durations)
    max_valid_duration = session_best_sec * 1.3

    groups: dict[tuple[str, str], list[tuple[int, float]]] = {}
    for stint in stints_raw:
        code = driver_code_by_number.get(stint["driver_number"])
        if code is None:
            continue
        laps_by_number = {lap["lap_number"]: lap for lap in laps_by_driver.get(code, [])}
        for lap_number in range(stint["lap_start"], stint["lap_end"] + 1):
            lap = laps_by_number.get(lap_number)
            if lap is None or lap.get("is_pit_out_lap") or not lap.get("lap_duration"):
                continue
            if lap["lap_duration"] > max_valid_duration:
                continue
            tyre_life = (stint.get("tyre_age_at_start") or 0) + (lap_number - stint["lap_start"])
            groups.setdefault((code, stint["compound"]), []).append((tyre_life, lap["lap_duration"]))

    compound_pace = []
    for (code, compound), points in groups.items():
        if len(points) < 3:
            continue
        tyre_lives = [p[0] for p in points]
        durations = [p[1] for p in points]
        degradation = None
        if len(set(tyre_lives)) >= 2:
            slope, _ = np.polyfit(tyre_lives, durations, 1)
            degradation = round(float(slope), 4)
        compound_pace.append(
            {
                "driver": code,
                "compound": compound,
                "lapCount": len(points),
                "avgPaceDeltaSec": round(float(np.mean(durations) - session_best_sec), 3),
                "degradationSecPerLap": degradation,
            }
        )
    return compound_pace


def _fetch_traffic_stats(session_key: int, driver_code_by_number: dict[int, str]) -> list[dict]:
    """Matches fetch_race()'s trafficStats shape and its exact 1.5s threshold - avgGapAheadSec is
    a plain mean, pctLapsCloseBehind is the fraction of observations under 1.5s, identical to the
    FastF1 path. Sampled from OpenF1's own `interval` time series (real gap to the car directly
    ahead, confirmed live - not `gap_to_leader`, a different field) rather than FastF1's
    one-value-per-lap derivation, since OpenF1 doesn't expose lap-by-lap position (see
    _fetch_laps()'s own docstring on why that join isn't attempted). This changes the *sampling
    rate* (roughly every few seconds, not once per lap) for the same underlying concept and the
    same threshold - not a different metric, just a coarser-grained version of it."""
    rows = _get("intervals", session_key=session_key)
    by_driver: dict[str, list[float]] = {}
    for r in rows:
        code = driver_code_by_number.get(r["driver_number"])
        gap = r.get("interval")
        # A lapped driver's interval can be a string like "+1 LAP" (same convention as
        # session_result's gap_to_leader) - not numeric, so not a real "gap ahead" reading, same
        # "can't cleanly convert, so treat as absent" pattern used elsewhere in this module.
        if code is None or not isinstance(gap, (int, float)):
            continue
        by_driver.setdefault(code, []).append(gap)
    return [
        {
            "driver": code,
            "avgGapAheadSec": round(float(np.mean(gaps)), 3),
            "pctLapsCloseBehind": round(float(np.mean([g < 1.5 for g in gaps])), 3),
        }
        for code, gaps in by_driver.items()
        if gaps
    ]


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
        stints_raw = _fetch_stints(session_key)
        tire_stints = _stints_to_tire_stints(stints_raw, driver_code_by_number)
        tire_compound_pace = _fetch_tire_compound_pace(stints_raw, laps_by_driver, driver_code_by_number)
        traffic_stats = _fetch_traffic_stats(session_key, driver_code_by_number)

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
            "trafficStats": traffic_stats,
            "safetyCarPeriods": safety_car_periods,
            "tireCompoundPace": tire_compound_pace,
            "lapTimings": lap_timings,
        }
    except Exception as exc:
        print(f"    openf1 fallback: not available ({exc})")
        return None
