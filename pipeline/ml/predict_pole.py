"""Pole (qualifying) model — port of predictPole.ts. Weaker than the finish-order model on
purpose: it only has prior-round form to go on, since it has to produce something before a race
weekend's own qualifying exists. Frozen the moment that weekend's real qualifying data lands
(see train_predict.py) — from then on there's nothing left to guess about pole.
"""

from __future__ import annotations

from statistics import mean

import numpy as np
from scipy.stats import spearmanr
from sklearn.ensemble import RandomForestRegressor

from .features import TrainingResultRow
from .pole_features import POLE_FEATURE_ORDER, build_pole_historical_features, build_pole_input_features, to_pole_feature_matrix

MODEL_VERSION = "sklearn-rf-v3-practice"

# driverQualiEloRating, teamQualiEloRating: higher (better) rating must never predict a worse
# pole -> -1 (opposite sign from the rolling-average position features these replaced, where
# higher was worse). History-depth counts: no known direction. fp1/fp2/fp3DeltaToBestSec: further
# off the session's best time must never predict a *better* pole -> +1.
MONOTONIC_CST = [-1, -1, 0, 0, 1, 1, 1]


def predict_pole_order(
    history: list[TrainingResultRow],
    entrants: list[dict],
    practice_by_round: dict[int, dict | None],
    current_practice: dict | None,
) -> dict:
    training = build_pole_historical_features(history, practice_by_round)
    model = RandomForestRegressor(n_estimators=500, max_features=0.8, monotonic_cst=MONOTONIC_CST, random_state=42)
    model.fit(to_pole_feature_matrix(training), [row["qualiPosition"] for row in training])

    input_features = build_pole_input_features(entrants, history, current_practice)
    scores = model.predict(to_pole_feature_matrix(input_features))

    ranked = sorted(
        (
            {"driver": entry["driver"], "team": entry["team"], "predictedScore": float(scores[i])}
            for i, entry in enumerate(entrants)
        ),
        key=lambda e: (e["predictedScore"], e["driver"]),
    )
    order = [
        {**entry, "predictedQualiPosition": index + 1} for index, entry in enumerate(ranked)
    ]

    importance = dict(zip(POLE_FEATURE_ORDER, model.feature_importances_.tolist()))
    return {"order": order, "featureImportance": importance}


def _rank_to_positions(scores: list[float]) -> list[int]:
    order = sorted(range(len(scores)), key=lambda i: scores[i])
    positions = [0] * len(scores)
    for rank, i in enumerate(order):
        positions[i] = rank + 1
    return positions


def pole_chronological_backtest(
    history: list[TrainingResultRow], practice_by_round: dict[int, dict | None]
) -> list[dict]:
    """Walk-forward evaluation within one season, same discipline as predict_finish.py's
    chronological_backtest. Reports richer ranking metrics than MAE alone, because MAE can't tell
    "got the competitive hierarchy right, off by a place" apart from "no idea who's fast this
    weekend" — see evaluate_pole_benchmark.py, which aggregates this across seasons into the
    frozen benchmark. Compared against a naive baseline (each driver's most recently known quali
    position) rather than grid order, since grid doesn't exist yet at pole-prediction time.
    """
    featured = build_pole_historical_features(history, practice_by_round)
    rounds = sorted({r["round"] for r in featured})
    results = []
    last_quali_position: dict[str, float] = {}

    for round_num in rounds:
        train = [f for f in featured if f["round"] < round_num]
        test = [f for f in featured if f["round"] == round_num]
        actual = [r["qualiPosition"] for r in test]
        drivers = [r["driver"] for r in test]
        naive_baseline = [last_quali_position.get(d, (len(test) + 1) / 2) for d in drivers]

        if len(train) >= 5 and len(test) >= 2:
            model = RandomForestRegressor(
                n_estimators=500, max_features=0.8, monotonic_cst=MONOTONIC_CST, random_state=42
            )
            model.fit(to_pole_feature_matrix(train), [row["qualiPosition"] for row in train])
            scores = model.predict(np.array(to_pole_feature_matrix(test)))
            predicted = _rank_to_positions(list(scores))

            pred_top3 = {d for d, p in zip(drivers, predicted) if p <= 3}
            actual_top3 = {d for d, p in zip(drivers, actual) if p <= 3}
            pred_top5 = {d for d, p in zip(drivers, predicted) if p <= 5}
            actual_top5 = {d for d, p in zip(drivers, actual) if p <= 5}
            rho, _ = spearmanr(predicted, actual)

            results.append(
                {
                    "round": round_num,
                    "mae": mean(abs(a - p) for a, p in zip(actual, predicted)),
                    "naiveMae": mean(abs(a - b) for a, b in zip(actual, naive_baseline)),
                    "spearman": None if np.isnan(rho) else float(rho),
                    "p1Hit": drivers[predicted.index(1)] == drivers[actual.index(1)],
                    "top3Overlap": len(pred_top3 & actual_top3),
                    "top5Overlap": len(pred_top5 & actual_top5),
                    "predictedPositions": predicted,
                    "actualPositions": actual,
                }
            )

        for driver, position in zip(drivers, actual):
            last_quali_position[driver] = position

    return results
