"""Feature engineering for the finish-order model. Grid and qualifying gap are read straight off
each entry; driver/team *form* now comes from Elo ratings (see elo.py) rather than a rolling
average of the last 3/6 races — same leakage-safety rule either way (a round's features only ever
reflect strictly-prior rounds), but Elo's decaying K-factor handles the "how much do we actually
trust this estimate yet" question the rolling average had no answer for.
"""

from __future__ import annotations

from dataclasses import dataclass

from .elo import current_ratings, rating_progression

FEATURE_ORDER = [
    "grid",
    "qualifyingGapSec",
    "driverEloRating",
    "teamEloRating",
    "driverHistoryCount",
    "teamHistoryCount",
]


@dataclass
class TrainingResultRow:
    round: int  # chronological order key within the training set
    driver: str
    team: str
    grid: int | None
    qualifying_gap_sec: float | None
    finish_position: int
    quali_position: int | None


def _team_event(rows: list[TrainingResultRow]) -> list[str]:
    """One representative position per team for this round — each team's best-classified driver,
    the standard motorsport convention for a team-vs-team head-to-head. (Team Elo therefore
    updates once per round, not once per driver — a different shape from the old rolling-average
    feature, which pooled every driver-row into one number; this is the correct way to run a
    round-robin when a "competitor" can field more than one entry.)
    """
    best_by_team: dict[str, int] = {}
    for r in rows:
        if r.team not in best_by_team or r.finish_position < best_by_team[r.team]:
            best_by_team[r.team] = r.finish_position
    return [team for team, _ in sorted(best_by_team.items(), key=lambda kv: kv[1])]


def _driver_event(rows: list[TrainingResultRow]) -> list[str]:
    return [r.driver for r in sorted(rows, key=lambda r: r.finish_position)]


def build_historical_features(all_results: list[TrainingResultRow]) -> list[dict]:
    """One feature row per historical result. Elo ratings are computed once via a single
    chronological pass (`rating_progression`) and looked up per round — each round's snapshot is
    taken *before* that round's own result, so it never leaks that round's outcome into its own
    features.
    """
    rounds = sorted({r.round for r in all_results})
    rows_by_round = {round_num: [r for r in all_results if r.round == round_num] for round_num in rounds}

    driver_events = [_driver_event(rows_by_round[r]) for r in rounds]
    team_events = [_team_event(rows_by_round[r]) for r in rounds]
    driver_snapshots = rating_progression(driver_events)
    team_snapshots = rating_progression(team_events)

    featured = []
    for idx, round_num in enumerate(rounds):
        driver_ratings = driver_snapshots[idx]
        team_ratings = team_snapshots[idx]
        for row in rows_by_round[round_num]:
            featured.append(
                {
                    "grid": row.grid,
                    "qualifyingGapSec": row.qualifying_gap_sec,
                    "driverEloRating": driver_ratings.get(row.driver, 1500.0),
                    "teamEloRating": team_ratings.get(row.team, 1500.0),
                    "driverHistoryCount": _history_count(all_results, round_num, row.driver, "driver"),
                    "teamHistoryCount": _history_count(all_results, round_num, row.team, "team"),
                    "round": round_num,
                    "driver": row.driver,
                    "team": row.team,
                    "finishPosition": row.finish_position,
                }
            )
    return featured


def _history_count(all_results: list[TrainingResultRow], before_round: int, entity: str, kind: str) -> int:
    if kind == "driver":
        return sum(1 for r in all_results if r.round < before_round and r.driver == entity)
    return sum(1 for r in all_results if r.round < before_round and r.team == entity)


def build_input_features(inputs: list[dict], history: list[TrainingResultRow]) -> list[dict]:
    """Feature rows for an upcoming race's field, using the full available history."""
    rounds = sorted({r.round for r in history})
    rows_by_round = {round_num: [r for r in history if r.round == round_num] for round_num in rounds}
    driver_ratings, driver_played = current_ratings([_driver_event(rows_by_round[r]) for r in rounds])
    team_ratings, team_played = current_ratings([_team_event(rows_by_round[r]) for r in rounds])

    return [
        {
            "grid": entry["grid"],
            "qualifyingGapSec": entry["qualifyingGapSec"],
            "driverEloRating": driver_ratings.get(entry["driver"], 1500.0),
            "teamEloRating": team_ratings.get(entry["team"], 1500.0),
            "driverHistoryCount": driver_played.get(entry["driver"], 0),
            "teamHistoryCount": team_played.get(entry["team"], 0),
            "driver": entry["driver"],
            "team": entry["team"],
        }
        for entry in inputs
    ]


def to_feature_matrix(rows: list[dict]) -> list[list[float]]:
    return [[row[key] for key in FEATURE_ORDER] for row in rows]
