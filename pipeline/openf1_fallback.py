"""OpenF1-derived preliminary race classification - used only when FastF1/Jolpica has nothing yet
(see fetch_races.py's build_and_push(), which tries fetch_race() first and falls back to this only
on a None result). Never a replacement for FastF1: no weather, tire-compound pace/degradation,
traffic stats, safety-car periods, or lap-by-lap timing are attempted here - those stay empty until
the official FastF1/Jolpica result lands and overwrites this row for real (see fetch_races.py's
reconciliation logic). See pipeline/OPENF1_FALLBACK.md for the full architecture, what's verified
against real historical races vs. what's a documented heuristic limitation, and why race-control
messages are deliberately NOT used to derive DNF status (tested against a real chaotic race and
found to produce a false positive - see that doc).

OpenF1 (https://openf1.org): free, no API key, sources from F1's live timing feed directly rather
than Ergast/Jolpica, so it doesn't share that source's multi-day publishing lag - confirmed live
this session: had full position data for a race within 2 days when Jolpica still had nothing.
"""

from __future__ import annotations

import requests

OPENF1_BASE = "https://api.openf1.org/v1"

# A driver needs to complete at least this fraction of the race winner's lap count to be
# classified as merely "lapped" rather than a retirement - matches F1's own real classification
# convention (a car must cover most of the race distance to be classified at all). Verified against
# three real races spanning the full range this needs to handle: a clean finish with no
# retirements (2023 Spanish GP - exact match, zero false positives), a race with three clear-cut
# big-deficit retirements (2026 Italian GP - exact match), and an extreme chaotic race with eight
# retirements including four that crashed out within the final lap (2023 Australian GP) - this
# threshold correctly caught the four big-deficit retirees there but, being lap-count-only, missed
# the four last-lap-crash ones (they show as "lapped", one lap down, since that's genuinely how
# close they got before crashing). See OPENF1_FALLBACK.md for why a race-control-based refinement
# was tried and rejected: it corrected some of those cases but introduced a real false positive
# (a driver who was merely involved in a stewarded incident, not one who retired from it). This
# bounded, honest inaccuracy on rare last-lap chaos is preferred over a heuristic proven to
# sometimes produce a confidently wrong answer.
LAPPED_THRESHOLD = 0.9

# 2010-present standard points table - NOT used here. OpenF1 carries no points field (confirmed
# live: neither /position nor /laps has one), and hardcoding a scoring table in the fallback would
# duplicate real rules that already live wherever the official result is the source of truth
# (sprint weekends, fastest-lap bonus point history, etc.) - every driver gets points=None from
# this module; the official FastF1/Jolpica upgrade fills it in for real once it lands.


def _session_key(year: int, country: str, session_name: str = "Race") -> int | None:
    resp = requests.get(
        f"{OPENF1_BASE}/sessions",
        params={"year": year, "country_name": country, "session_name": session_name},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return data[0]["session_key"] if data else None


def fetch_race_openf1(year: int, round_num: int, country: str, qualifying_grid: list[dict]) -> dict | None:
    """Same return shape as fetch_races.fetch_race() (session/results/weather/tireStints/
    trafficStats/safetyCarPeriods/tireCompoundPace/lapTimings), so build_and_push() has exactly one
    downstream code path regardless of which source produced it - only `results` is ever populated
    here, everything else is intentionally empty. Returns None (matching fetch_race()'s own
    contract) if no matching OpenF1 session exists yet or it has no position data - never a
    fabricated partial result.

    `qualifying_grid` is the SAME list build_and_push() already has in memory from its own
    fetch_qualifying() call (which always runs before fetch_race() is even attempted) - grid
    position is looked up from there, not re-fetched or left blank.
    """
    try:
        session_key = _session_key(year, country)
        if session_key is None:
            return None

        drivers = requests.get(f"{OPENF1_BASE}/drivers", params={"session_key": session_key}, timeout=15).json()
        if not drivers:
            return None
        driver_info = {d["driver_number"]: d for d in drivers}

        positions = requests.get(f"{OPENF1_BASE}/position", params={"session_key": session_key}, timeout=20).json()
        if not positions:
            return None
        last_pos: dict[int, dict] = {}
        for p in positions:
            n = p["driver_number"]
            if n not in last_pos or p["date"] > last_pos[n]["date"]:
                last_pos[n] = p

        laps = requests.get(f"{OPENF1_BASE}/laps", params={"session_key": session_key}, timeout=25).json()
        max_lap: dict[int, int] = {}
        for lap in laps:
            n = lap["driver_number"]
            ln = lap.get("lap_number") or 0
            if ln > max_lap.get(n, 0):
                max_lap[n] = ln

        if not max_lap:
            # Position data exists but no lap data at all - can't derive status for anyone
            # confidently, and a race with truly zero lap records this late is itself suspicious.
            # Better to report nothing than guess for every driver.
            return None
        winner_laps = max(max_lap.values())

        grid_by_driver = {g["driver"]: g["gridPosition"] for g in qualifying_grid}

        results = []
        for driver_number, pos_row in sorted(last_pos.items(), key=lambda kv: kv[1]["position"]):
            info = driver_info.get(driver_number)
            if info is None:
                # In /position but not /drivers - no name/team to attach, real but unusable data.
                print(f"    openf1: skipping car {driver_number}, no driver info")
                continue

            laps_done = max_lap.get(driver_number)
            if laps_done is None:
                # Never silently guess a status for a driver we have zero lap data for - could be
                # a genuine DNF before lap 1, or just a gap in OpenF1's own coverage. Skip the row
                # entirely rather than fabricate either way.
                print(f"    openf1: skipping {info.get('name_acronym', driver_number)}, no lap data")
                continue

            if laps_done >= winner_laps:
                status = "finished"
            elif laps_done >= LAPPED_THRESHOLD * winner_laps:
                status = "lapped"
            else:
                status = "dnf"

            driver_code = info.get("name_acronym")
            results.append(
                {
                    "driver": driver_code,
                    "driverName": info.get("full_name"),
                    "team": info.get("team_name"),
                    "gridPosition": grid_by_driver.get(driver_code),
                    "finishPosition": int(pos_row["position"]),
                    "status": status,
                    # race_results.points is NOT NULL DEFAULT 0 (supabase/schema.sql) - and OpenF1
                    # carries no points field to read anyway (confirmed live). 0 here is a real,
                    # documented limitation (a standings view read before the official upgrade
                    # lands would show 0 for a preliminary result's points), not a fabricated
                    # value - the official FastF1/Jolpica upgrade fills in the real number.
                    "points": 0,
                    "finishGapSec": None,
                    "fastestLapSec": None,
                    "headshotUrl": info.get("headshot_url"),
                    "teamColor": (f"#{info['team_colour']}" if info.get("team_colour") else None),
                }
            )

        if not results:
            return None

        return {
            "session": "R",
            "results": results,
            "weather": None,
            "tireStints": [],
            "trafficStats": [],
            "safetyCarPeriods": None,
            "tireCompoundPace": [],
            "lapTimings": [],
        }
    except Exception as exc:
        print(f"    openf1 fallback: not available ({exc})")
        return None
