"""OpenF1-derived preliminary race classification - used only when FastF1/Jolpica has nothing yet
(see fetch_races.py's build_and_push(), which tries fetch_race() first and falls back to this only
on a None result). Never a replacement for FastF1: no weather, tire-compound pace/degradation,
traffic stats, safety-car periods, or lap-by-lap timing are attempted here - those stay empty until
the official FastF1/Jolpica result lands and overwrites this row for real (see fetch_races.py's
reconciliation logic). See pipeline/OPENF1_FALLBACK.md for the full architecture.

OpenF1 (https://openf1.org): free, no API key, sources from F1's live timing feed directly rather
than Ergast/Jolpica, so it doesn't share that source's multi-day publishing lag.

v2 of this module (see git history for v1): OpenF1 has since grown a `session_result` endpoint
that gives real position/points/dnf/dns/dsq/gap directly - verified live against the 2026 Italian
GP, exact match including all 3 real retirees. This replaces v1's own hand-rolled reconstruction
from raw `/position` + `/laps` (lap-count-percentage DNF heuristic, no points field available at
the time) - that heuristic's one documented limitation (missing a last-lap crash) no longer applies
since `dnf`/`dsq` are read directly from OpenF1, not inferred from lap counts. `starting_grid`
(keyed off the *qualifying* session, confirmed live) replaces the hard dependency on FastF1's own
qualifying fetch having succeeded - `qualifying_grid` is now a last-resort fallback only, used
solely for a driver OpenF1's own grid data is missing.
"""

from __future__ import annotations

from datetime import datetime, timezone

import requests

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


def fetch_race_openf1(year: int, round_num: int, country: str, qualifying_grid: list[dict]) -> dict | None:
    """Same return shape as fetch_races.fetch_race() (session/results/weather/tireStints/
    trafficStats/safetyCarPeriods/tireCompoundPace/lapTimings), so build_and_push() has exactly one
    downstream code path regardless of which source produced it - only `results` is ever populated
    here. Returns None (matching fetch_race()'s own contract) if no matching OpenF1 session exists
    yet, it has no result data, or the result fails `_validate()` - never a fabricated or partial
    classification.
    """
    try:
        # One call for the whole weekend (not filtered by session_name) so the Race and Qualifying
        # session_keys come from a single request - Qualifying's is needed for starting_grid, which
        # is NOT keyed by the Race session (verified live: /v1/starting_grid?session_key=<race>
        # returns nothing).
        sessions = requests.get(
            f"{OPENF1_BASE}/sessions", params={"year": year, "country_name": country}, timeout=15
        ).json()
        race_session = next((s for s in sessions if s.get("session_name") == "Race"), None)
        if race_session is None:
            return None
        session_key = race_session["session_key"]
        # Matched by meeting_key, not country alone, in case a season has more than one race in the
        # same country (e.g. multiple US rounds) - country-only matching (still used to find
        # race_session above, an existing limitation this pass doesn't fix) could otherwise pick a
        # Qualifying session from the wrong weekend.
        quali_session = next(
            (s for s in sessions if s.get("meeting_key") == race_session["meeting_key"] and s.get("session_name") == "Qualifying"),
            None,
        )

        # Availability telemetry: how long after the race actually ended a usable classification
        # was found - printed plainly to the run log (not persisted to a new table/column), so a
        # handful of real races builds a real answer to "how fresh is this" without adding
        # infrastructure for it.
        race_end = datetime.fromisoformat(race_session["date_end"])
        print(f"    openf1: session_result requested {datetime.now(timezone.utc) - race_end} after race end")

        session_result = requests.get(
            f"{OPENF1_BASE}/session_result", params={"session_key": session_key}, timeout=20
        ).json()
        if not session_result:
            return None

        drivers = requests.get(f"{OPENF1_BASE}/drivers", params={"session_key": session_key}, timeout=15).json()
        driver_info = {d["driver_number"]: d for d in drivers}

        grid_by_number: dict[int, int] = {}
        if quali_session is not None:
            grid = requests.get(
                f"{OPENF1_BASE}/starting_grid", params={"session_key": quali_session["session_key"]}, timeout=15
            ).json()
            grid_by_number = {g["driver_number"]: g["position"] for g in grid}
        # Last-resort fallback only, for a driver OpenF1's own grid data is missing - not the
        # primary source anymore (see module docstring).
        grid_by_driver_code = {g["driver"]: g["gridPosition"] for g in qualifying_grid}

        results = []
        # dnf/dsq rows carry position: null (OpenF1's own "not classified" convention) - real
        # official results still assign every driver who started a real finish_position, though
        # (race_results.finish_position is NOT NULL - confirmed live via a real official race's own
        # DNF rows, e.g. finish_position 19/20 for that race's two retirees). Sorted here by laps
        # completed (descending) among the unclassified group so the position numbers assigned
        # below land in the right order - more laps completed ranks ahead, the same convention a
        # real classification uses.
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
                    # session_result carries no per-driver fastest-lap field - kept empty rather
                    # than guessed, same contract v1 already had.
                    "fastestLapSec": None,
                    "headshotUrl": info.get("headshot_url"),
                    "teamColor": (f"#{info['team_colour']}" if info.get("team_colour") else None),
                }
            )

        if not results:
            return None

        # Fill in a real finish_position for every dnf/dsq row - already sorted into the right
        # relative order above, just needs numbering to continue after the last classified spot.
        next_position = max((r["finishPosition"] for r in results if r["finishPosition"] is not None), default=0) + 1
        for r in results:
            if r["finishPosition"] is None:
                r["finishPosition"] = next_position
                next_position += 1

        error = _validate(results)
        if error:
            print(f"    openf1: rejecting result ({error}), not writing partial/bad data")
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
