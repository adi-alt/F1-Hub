"""Feature set for the pole (qualifying) model. Deliberately excludes grid/qualifyingGapSec —
unlike the finish-order model, this one runs *before* a race weekend's own qualifying happens, so
those aren't known yet. Only prior-season(-round) form to go on, which makes it a genuinely weaker
predictor than the finish-order model — the same tradeoff the deleted poleFeatures.ts documented.
"""

from __future__ import annotations

from .features import DRIVER_FORM_WINDOW, TEAM_FORM_WINDOW, TrainingResultRow, recent_form

POLE_FEATURE_ORDER = ["driverRecentQuali", "teamRecentQuali", "driverHistoryCount", "teamHistoryCount"]


def _pole_features_for(entry: dict, prior: list[TrainingResultRow], default_quali: float) -> dict:
    driver_value, driver_count = recent_form(
        prior, lambda r: r.driver == entry["driver"], DRIVER_FORM_WINDOW, lambda r: r.quali_position, default_quali
    )
    team_value, team_count = recent_form(
        prior, lambda r: r.team == entry["team"], TEAM_FORM_WINDOW, lambda r: r.quali_position, default_quali
    )
    return {
        "driverRecentQuali": driver_value,
        "teamRecentQuali": team_value,
        "driverHistoryCount": driver_count,
        "teamHistoryCount": team_count,
    }


def build_pole_historical_features(all_results: list[TrainingResultRow]) -> list[dict]:
    rounds = sorted({r.round for r in all_results})
    featured = []
    for round_num in rounds:
        current = [r for r in all_results if r.round == round_num]
        prior = [r for r in all_results if r.round < round_num]
        default_quali = (len(current) + 1) / 2
        for row in current:
            entry = {"driver": row.driver, "team": row.team}
            featured.append(
                {
                    **_pole_features_for(entry, prior, default_quali),
                    "round": round_num,
                    "driver": row.driver,
                    "team": row.team,
                    "qualiPosition": row.quali_position,
                }
            )
    return featured


def build_pole_input_features(entrants: list[dict], history: list[TrainingResultRow]) -> list[dict]:
    default_quali = (len(entrants) + 1) / 2
    return [
        {**_pole_features_for(entry, history, default_quali), "driver": entry["driver"], "team": entry["team"]}
        for entry in entrants
    ]


def to_pole_feature_matrix(rows: list[dict]) -> list[list[float]]:
    return [[row[key] for key in POLE_FEATURE_ORDER] for row in rows]
