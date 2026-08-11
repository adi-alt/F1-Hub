"""Leakage-safe historical tyre-management traits, derived from fetch_races.py's per-race,
per-compound `tireCompoundPace` records (avgPaceDeltaSec, degradationSecPerLap). Cross-season on
purpose, like predict_dnf.py's DNF rates: tyre management (thermal/input smoothness) is plausibly a
persisting driver trait across season boundaries, unlike pure competitive strength.

Validated on the Pace model's own walk-forward backtest before shipping: adding these 4 features to
the existing 4-feature Pace model, on the same 184-race population, improved every metric — MAE
1.002 -> 0.928, R2 -0.155 -> 0.007 (first time this model's R2 has been positive), Spearman
0.659 -> 0.673. The first pass of this validation used the whole dataset's mean as the fallback for
drivers/teams with no prior tyre history yet, which leaks future races into early rows' features —
caught and fixed to use the running cross-season average instead (same convention as
GLOBAL_DNF_RATE_DEFAULT below), same discipline as everywhere else in this pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import mean

TYRE_FEATURE_ORDER = ["driverTyrePaceDelta", "driverTyreDegradation", "teamTyrePaceDelta", "teamTyreDegradation"]

# Fixed constants used only before ANY history exists at all (the very first row(s) ever seen) —
# every other fallback uses the running cross-season average instead.
GLOBAL_PACE_DELTA_DEFAULT = 3.0
GLOBAL_DEGRADATION_DEFAULT = 0.0


@dataclass
class TyreRaceRow:
    year: int
    round: int
    driver: str
    team: str
    avg_pace_delta: float
    avg_degradation: float


def build_tyre_race_row(year: int, round_num: int, driver: str, team: str, tire_compound_pace: list[dict]) -> TyreRaceRow | None:
    """One row per driver per race: lap-count-weighted average pace-delta/degradation across
    whichever compounds they actually used that race. None if there's nothing to average (e.g. no
    compound ran long enough for a degradation slope)."""
    compounds = [c for c in tire_compound_pace if c["driver"] == driver]
    total_laps = sum(c["lapCount"] for c in compounds)
    if total_laps == 0:
        return None
    avg_pace_delta = sum(c["avgPaceDeltaSec"] * c["lapCount"] for c in compounds) / total_laps

    deg_compounds = [c for c in compounds if c["degradationSecPerLap"] is not None]
    deg_laps = sum(c["lapCount"] for c in deg_compounds)
    if deg_laps == 0:
        return None
    avg_degradation = sum(c["degradationSecPerLap"] * c["lapCount"] for c in deg_compounds) / deg_laps

    return TyreRaceRow(year, round_num, driver, team, avg_pace_delta, avg_degradation)


def build_tyre_trait_history(rows: list[TyreRaceRow]) -> dict[tuple[int, int, str], dict]:
    """(year, round, driver) -> feature dict, using only strictly-prior races' data — the running
    counters update *after* a row is featured, never before."""
    ordered = sorted(rows, key=lambda r: (r.year, r.round))
    driver_pace: dict[str, list[float]] = {}
    driver_deg: dict[str, list[float]] = {}
    team_pace: dict[str, list[float]] = {}
    team_deg: dict[str, list[float]] = {}
    global_pace_sum, global_pace_n = 0.0, 0
    global_deg_sum, global_deg_n = 0.0, 0

    out = {}
    for row in ordered:
        global_pace = (global_pace_sum / global_pace_n) if global_pace_n else GLOBAL_PACE_DELTA_DEFAULT
        global_deg = (global_deg_sum / global_deg_n) if global_deg_n else GLOBAL_DEGRADATION_DEFAULT
        out[(row.year, row.round, row.driver)] = {
            "driverTyrePaceDelta": mean(driver_pace[row.driver]) if row.driver in driver_pace else global_pace,
            "driverTyreDegradation": mean(driver_deg[row.driver]) if row.driver in driver_deg else global_deg,
            "teamTyrePaceDelta": mean(team_pace[row.team]) if row.team in team_pace else global_pace,
            "teamTyreDegradation": mean(team_deg[row.team]) if row.team in team_deg else global_deg,
        }
        driver_pace.setdefault(row.driver, []).append(row.avg_pace_delta)
        driver_deg.setdefault(row.driver, []).append(row.avg_degradation)
        team_pace.setdefault(row.team, []).append(row.avg_pace_delta)
        team_deg.setdefault(row.team, []).append(row.avg_degradation)
        global_pace_sum += row.avg_pace_delta
        global_pace_n += 1
        global_deg_sum += row.avg_degradation
        global_deg_n += 1
    return out


def current_tyre_traits(rows: list[TyreRaceRow]) -> tuple[dict[str, dict], dict[str, dict]]:
    """Driver/team trait dicts reflecting *all* of `rows` — for featuring an upcoming race that
    hasn't happened yet, where every prior race is fair game."""
    driver_pace: dict[str, list[float]] = {}
    driver_deg: dict[str, list[float]] = {}
    team_pace: dict[str, list[float]] = {}
    team_deg: dict[str, list[float]] = {}
    for row in rows:
        driver_pace.setdefault(row.driver, []).append(row.avg_pace_delta)
        driver_deg.setdefault(row.driver, []).append(row.avg_degradation)
        team_pace.setdefault(row.team, []).append(row.avg_pace_delta)
        team_deg.setdefault(row.team, []).append(row.avg_degradation)

    global_pace = mean(row.avg_pace_delta for row in rows) if rows else GLOBAL_PACE_DELTA_DEFAULT
    global_deg = mean(row.avg_degradation for row in rows) if rows else GLOBAL_DEGRADATION_DEFAULT

    driver_traits = {
        d: {
            "driverTyrePaceDelta": mean(driver_pace[d]),
            "driverTyreDegradation": mean(driver_deg[d]),
        }
        for d in driver_pace
    }
    team_traits = {
        t: {
            "teamTyrePaceDelta": mean(team_pace[t]),
            "teamTyreDegradation": mean(team_deg[t]),
        }
        for t in team_pace
    }
    return driver_traits, team_traits, {"pace": global_pace, "degradation": global_deg}
