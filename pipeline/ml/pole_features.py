"""Feature set for the pole (qualifying) model. Deliberately excludes grid/qualifyingGapSec —
unlike the finish-order model, this one runs *before* a race weekend's own qualifying happens, so
those aren't known yet. Prior-round form (via qualifying Elo, a separate rating track from the
finish-order model's race Elo) plus *this* weekend's own FP1-3 pace — unlike circuit-level context
(tried and reverted in features.py), FP deltas vary per driver within the same race, so they're a
legitimate ranking signal, and they're knowable before qualifying since practice always runs first.
"""

from __future__ import annotations

from .elo import current_ratings, rating_progression
from .features import TrainingResultRow, _history_count

POLE_FEATURE_ORDER = [
    "driverQualiEloRating",
    "teamQualiEloRating",
    "driverHistoryCount",
    "teamHistoryCount",
    "fp1DeltaToBestSec",
    "fp2DeltaToBestSec",
    "fp3DeltaToBestSec",
]

# A driver with no representative lap yet in a given practice session (session hasn't happened,
# or they never set a clean time) is assumed roughly mid-pack off pace, not on it — this fades to
# irrelevant once the session actually happens and real deltas replace it for every driver.
PRACTICE_DEFAULT_DELTA_SEC = 1.5


def _practice_deltas(practice: dict | None, driver: str) -> dict:
    practice = practice or {}
    out = {}
    for label, field in zip(("FP1", "FP2", "FP3"), ("fp1DeltaToBestSec", "fp2DeltaToBestSec", "fp3DeltaToBestSec")):
        session = practice.get(label)
        best_laps = {b["driver"]: b["deltaToBestSec"] for b in session["bestLaps"]} if session else {}
        out[field] = best_laps.get(driver, PRACTICE_DEFAULT_DELTA_SEC)
    return out


def _team_quali_event(rows: list[TrainingResultRow]) -> list[str]:
    """Each team's best-qualified driver represents the team for that round's head-to-head."""
    best_by_team: dict[str, int] = {}
    for r in rows:
        if r.quali_position is None:
            continue
        if r.team not in best_by_team or r.quali_position < best_by_team[r.team]:
            best_by_team[r.team] = r.quali_position
    return [team for team, _ in sorted(best_by_team.items(), key=lambda kv: kv[1])]


def _driver_quali_event(rows: list[TrainingResultRow]) -> list[str]:
    qualified = [r for r in rows if r.quali_position is not None]
    return [r.driver for r in sorted(qualified, key=lambda r: r.quali_position)]


def build_pole_historical_features(
    all_results: list[TrainingResultRow], practice_by_round: dict[int, dict | None]
) -> list[dict]:
    rounds = sorted({r.round for r in all_results})
    rows_by_round = {round_num: [r for r in all_results if r.round == round_num] for round_num in rounds}

    driver_snapshots = rating_progression([_driver_quali_event(rows_by_round[r]) for r in rounds])
    team_snapshots = rating_progression([_team_quali_event(rows_by_round[r]) for r in rounds])

    featured = []
    for idx, round_num in enumerate(rounds):
        driver_ratings = driver_snapshots[idx]
        team_ratings = team_snapshots[idx]
        for row in rows_by_round[round_num]:
            featured.append(
                {
                    "driverQualiEloRating": driver_ratings.get(row.driver, 1500.0),
                    "teamQualiEloRating": team_ratings.get(row.team, 1500.0),
                    "driverHistoryCount": _history_count(all_results, round_num, row.driver, "driver"),
                    "teamHistoryCount": _history_count(all_results, round_num, row.team, "team"),
                    **_practice_deltas(practice_by_round.get(round_num), row.driver),
                    "round": round_num,
                    "driver": row.driver,
                    "team": row.team,
                    "qualiPosition": row.quali_position,
                }
            )
    return featured


def build_pole_input_features(
    entrants: list[dict], history: list[TrainingResultRow], current_practice: dict | None
) -> list[dict]:
    rounds = sorted({r.round for r in history})
    rows_by_round = {round_num: [r for r in history if r.round == round_num] for round_num in rounds}
    driver_ratings, driver_played = current_ratings([_driver_quali_event(rows_by_round[r]) for r in rounds])
    team_ratings, team_played = current_ratings([_team_quali_event(rows_by_round[r]) for r in rounds])

    return [
        {
            "driverQualiEloRating": driver_ratings.get(entry["driver"], 1500.0),
            "teamQualiEloRating": team_ratings.get(entry["team"], 1500.0),
            "driverHistoryCount": driver_played.get(entry["driver"], 0),
            "teamHistoryCount": team_played.get(entry["team"], 0),
            **_practice_deltas(current_practice, entry["driver"]),
            "driver": entry["driver"],
            "team": entry["team"],
        }
        for entry in entrants
    ]


def to_pole_feature_matrix(rows: list[dict]) -> list[list[float]]:
    return [[row[key] for key in POLE_FEATURE_ORDER] for row in rows]
