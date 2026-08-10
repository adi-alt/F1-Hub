"""Leakage-safe feature engineering shared by the finish-order and pole models: every feature for
a race is built only from events strictly before it. A faithful port of the TypeScript version
that used to live at f1-hub/src/lib/ml/features.ts (deleted when training moved to Python) — same
windows, same defaults, same leakage-safety rule, just reading the FastF1-native schema instead of
the old scraper's.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import mean
from typing import Callable

DRIVER_FORM_WINDOW = 3
TEAM_FORM_WINDOW = 6


@dataclass
class TrainingResultRow:
    round: int  # chronological order key within the training set
    driver: str
    team: str
    grid: int | None
    qualifying_gap_sec: float | None
    finish_position: int
    quali_position: int | None


FEATURE_ORDER = [
    "grid",
    "qualifyingGapSec",
    "driverRecentFinish",
    "teamRecentFinish",
    "driverHistoryCount",
    "teamHistoryCount",
]


def recent_form(
    prior: list[TrainingResultRow],
    match: Callable[[TrainingResultRow], bool],
    window_size: int,
    value_of: Callable[[TrainingResultRow], float],
    default_value: float,
) -> tuple[float, int]:
    """Reused by the pole model too, which averages quali_position instead of finish_position."""
    rows = sorted((r for r in prior if match(r)), key=lambda r: r.round)
    recent = rows[-window_size:] if rows else []
    recent_value = mean(value_of(r) for r in recent) if recent else default_value
    return recent_value, len(rows)


def features_for(
    entry: dict, prior: list[TrainingResultRow], default_finish: float
) -> dict:
    driver_value, driver_count = recent_form(
        prior, lambda r: r.driver == entry["driver"], DRIVER_FORM_WINDOW, lambda r: r.finish_position, default_finish
    )
    team_value, team_count = recent_form(
        prior, lambda r: r.team == entry["team"], TEAM_FORM_WINDOW, lambda r: r.finish_position, default_finish
    )
    return {
        "grid": entry["grid"],
        "qualifyingGapSec": entry["qualifyingGapSec"],
        "driverRecentFinish": driver_value,
        "teamRecentFinish": team_value,
        "driverHistoryCount": driver_count,
        "teamHistoryCount": team_count,
    }


def build_historical_features(all_results: list[TrainingResultRow]) -> list[dict]:
    """One feature row per historical result, using only strictly-prior rounds for form features."""
    rounds = sorted({r.round for r in all_results})
    featured = []
    for round_num in rounds:
        current = [r for r in all_results if r.round == round_num]
        prior = [r for r in all_results if r.round < round_num]
        default_finish = (len(current) + 1) / 2
        for row in current:
            entry = {"driver": row.driver, "team": row.team, "grid": row.grid, "qualifyingGapSec": row.qualifying_gap_sec}
            featured.append(
                {
                    **features_for(entry, prior, default_finish),
                    "round": round_num,
                    "driver": row.driver,
                    "team": row.team,
                    "finishPosition": row.finish_position,
                }
            )
    return featured


def build_input_features(inputs: list[dict], history: list[TrainingResultRow]) -> list[dict]:
    """Feature rows for an upcoming race's field, using the full available history as "prior"."""
    default_finish = (len(inputs) + 1) / 2
    return [
        {**features_for(entry, history, default_finish), "driver": entry["driver"], "team": entry["team"], "grid": entry["grid"]}
        for entry in inputs
    ]


def to_feature_matrix(rows: list[dict]) -> list[list[float]]:
    return [[row[key] for key in FEATURE_ORDER] for row in rows]
