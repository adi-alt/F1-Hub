"""Feature set for the race-pace model. `driverPaceEloRating`/`teamPaceEloRating` rank by actual
fastest-lap gap each race, not classified finish position — pace and finish diverge on strategy,
incidents, and reliability, so this is its own Elo track, not a reuse of the finish model's.

DNF rows are excluded upstream (see train_predict.py) before they ever reach this module: a
driver's fastest lap in the handful of laps before retiring isn't a measurement of race pace.

The 4 `*Tyre*` features are resolved by the caller (train_predict.py, via ml/tyre_features.py)
before a PaceResultRow is built, since they're cross-season traits — unlike the Elo ratings here,
which are intentionally season-scoped and computed fresh below.
"""

from __future__ import annotations

from dataclasses import dataclass

from .elo import current_ratings, rating_progression
from .tyre_features import TYRE_FEATURE_ORDER

PACE_FEATURE_ORDER = ["grid", "qualifyingGapSec", "driverPaceEloRating", "teamPaceEloRating"] + TYRE_FEATURE_ORDER


@dataclass
class PaceResultRow:
    round: int
    driver: str
    team: str
    grid: float
    qualifying_gap_sec: float
    fastest_lap_sec: float
    driver_tyre_pace_delta: float
    driver_tyre_degradation: float
    team_tyre_pace_delta: float
    team_tyre_degradation: float


def _driver_pace_event(rows: list[PaceResultRow]) -> list[str]:
    return [r.driver for r in sorted(rows, key=lambda r: r.fastest_lap_sec)]


def _team_pace_event(rows: list[PaceResultRow]) -> list[str]:
    """Each team's fastest driver represents the team for that round's head-to-head."""
    best_by_team: dict[str, float] = {}
    for r in rows:
        if r.team not in best_by_team or r.fastest_lap_sec < best_by_team[r.team]:
            best_by_team[r.team] = r.fastest_lap_sec
    return [team for team, _ in sorted(best_by_team.items(), key=lambda kv: kv[1])]


def build_pace_historical_features(all_results: list[PaceResultRow]) -> list[dict]:
    rounds = sorted({r.round for r in all_results})
    rows_by_round = {round_num: [r for r in all_results if r.round == round_num] for round_num in rounds}

    driver_snapshots = rating_progression([_driver_pace_event(rows_by_round[r]) for r in rounds])
    team_snapshots = rating_progression([_team_pace_event(rows_by_round[r]) for r in rounds])

    featured = []
    for idx, round_num in enumerate(rounds):
        driver_ratings = driver_snapshots[idx]
        team_ratings = team_snapshots[idx]
        round_rows = rows_by_round[round_num]
        race_fastest = min(r.fastest_lap_sec for r in round_rows)
        for row in round_rows:
            featured.append(
                {
                    "grid": row.grid,
                    "qualifyingGapSec": row.qualifying_gap_sec,
                    "driverPaceEloRating": driver_ratings.get(row.driver, 1500.0),
                    "teamPaceEloRating": team_ratings.get(row.team, 1500.0),
                    "driverTyrePaceDelta": row.driver_tyre_pace_delta,
                    "driverTyreDegradation": row.driver_tyre_degradation,
                    "teamTyrePaceDelta": row.team_tyre_pace_delta,
                    "teamTyreDegradation": row.team_tyre_degradation,
                    "round": round_num,
                    "driver": row.driver,
                    "team": row.team,
                    "paceGapSec": row.fastest_lap_sec - race_fastest,
                }
            )
    return featured


def build_pace_input_features(inputs: list[dict], history: list[PaceResultRow]) -> list[dict]:
    """Feature rows for an upcoming race's field. `inputs`: [{"driver","team","grid",
    "qualifyingGapSec","driverTyrePaceDelta","driverTyreDegradation","teamTyrePaceDelta",
    "teamTyreDegradation"}, ...] — the tyre trait values are resolved by the caller
    (ml/tyre_features.py's current_tyre_traits), since they're cross-season, unlike the Elo ratings
    computed fresh here from the season-scoped `history`."""
    rounds = sorted({r.round for r in history})
    rows_by_round = {round_num: [r for r in history if r.round == round_num] for round_num in rounds}
    driver_ratings, _ = current_ratings([_driver_pace_event(rows_by_round[r]) for r in rounds])
    team_ratings, _ = current_ratings([_team_pace_event(rows_by_round[r]) for r in rounds])

    return [
        {
            "grid": entry["grid"],
            "qualifyingGapSec": entry["qualifyingGapSec"],
            "driverPaceEloRating": driver_ratings.get(entry["driver"], 1500.0),
            "teamPaceEloRating": team_ratings.get(entry["team"], 1500.0),
            "driverTyrePaceDelta": entry["driverTyrePaceDelta"],
            "driverTyreDegradation": entry["driverTyreDegradation"],
            "teamTyrePaceDelta": entry["teamTyrePaceDelta"],
            "teamTyreDegradation": entry["teamTyreDegradation"],
            "driver": entry["driver"],
            "team": entry["team"],
        }
        for entry in inputs
    ]


def to_pace_feature_matrix(rows: list[dict]) -> list[list[float]]:
    return [[row[key] for key in PACE_FEATURE_ORDER] for row in rows]
