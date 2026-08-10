"""Finish-order model — a faithful port of predictFinish.ts (deleted TypeScript/ml-random-forest
version) onto scikit-learn. Same algorithm family (Random Forest), same reasoning for choosing it
over gradient boosting: training sets are tiny (as few as ~20 rows early in a season), and
bagging degrades far more gracefully than boosting at that scale. See the "which model" discussion
this ported from — not repeating that reasoning in every file, just the decision it landed on.

One thing this version has that the old npm package couldn't: `monotonic_cst`, encoding what's
already known to be true (worse grid/form should never predict a *better* finish) as a hard
constraint rather than hoping 500 trees discover it from a handful of rows.
"""

from __future__ import annotations

from statistics import mean

import numpy as np
from sklearn.ensemble import RandomForestRegressor

from .features import FEATURE_ORDER, TrainingResultRow, build_historical_features, build_input_features, to_feature_matrix

MODEL_VERSION = "sklearn-rf-v1"

# grid, qualifyingGapSec, driverRecentFinish, teamRecentFinish: higher (worse) must never predict
# a better finish. driverHistoryCount, teamHistoryCount: no known direction, left unconstrained.
MONOTONIC_CST = [1, 1, 1, 1, 0, 0]


def _build_model(seed: int = 42) -> RandomForestRegressor:
    return RandomForestRegressor(
        n_estimators=500,
        max_features=0.8,
        monotonic_cst=MONOTONIC_CST,
        random_state=seed,
    )


def _std_dev(values: list[float]) -> float:
    m = mean(values)
    return (sum((v - m) ** 2 for v in values) / len(values)) ** 0.5


def predict_finish_order(history: list[TrainingResultRow], inputs: list[dict]) -> dict:
    """Trains on all supplied (same-season, strictly-prior) history and ranks the given field."""
    training = build_historical_features(history)
    model = _build_model()
    model.fit(to_feature_matrix(training), [row["finishPosition"] for row in training])

    race_features = build_input_features(inputs, history)
    matrix = np.array(to_feature_matrix(race_features))
    scores = model.predict(matrix)
    # Per-tree predictions, not just the forest's average — this is the spread the UI shows as
    # "±N" next to a prediction, and later feeds things like podium-probability estimates.
    per_tree = np.array([tree.predict(matrix) for tree in model.estimators_])

    ranked = sorted(
        (
            {
                "driver": entry["driver"],
                "team": entry["team"],
                "grid": entry["grid"],
                "predictedScore": float(scores[i]),
                "spread": float(_std_dev(list(per_tree[:, i]))) if per_tree.shape[0] > 0 else None,
            }
            for i, entry in enumerate(inputs)
        ),
        key=lambda e: (e["predictedScore"], e["grid"], e["driver"]),
    )

    order = [
        {
            "driver": entry["driver"],
            "team": entry["team"],
            "predictedPosition": index + 1,
            "predictedScore": entry["predictedScore"],
            "spread": entry["spread"],
        }
        for index, entry in enumerate(ranked)
    ]

    importance = dict(zip(FEATURE_ORDER, model.feature_importances_.tolist()))
    return {"order": order, "featureImportance": importance}


def _rank_to_positions(scores: list[float]) -> list[int]:
    order = sorted(range(len(scores)), key=lambda i: scores[i])
    positions = [0] * len(scores)
    for rank, i in enumerate(order):
        positions[i] = rank + 1
    return positions


def _mean_absolute_error(actual: list[float], predicted: list[float]) -> float:
    return mean(abs(a - p) for a, p in zip(actual, predicted))


def chronological_backtest(history: list[TrainingResultRow]) -> list[dict]:
    """Evaluates each round that has at least one earlier round available for training, against
    the same grid-order baseline the app has always compared itself to — the point of this isn't
    "does the model work," it's "is the model actually better than just trusting the grid.\""""
    featured = build_historical_features(history)
    rounds = sorted({r.round for r in history})
    results = []

    for round_num in rounds[1:]:
        train = [f for f in featured if f["round"] < round_num]
        test = [f for f in featured if f["round"] == round_num]
        model = _build_model()
        model.fit(to_feature_matrix(train), [row["finishPosition"] for row in train])
        scores = model.predict(np.array(to_feature_matrix(test)))
        predicted_positions = _rank_to_positions(list(scores))
        actual = [row["finishPosition"] for row in test]
        grid_baseline = [r.grid for r in history if r.round == round_num]

        results.append(
            {
                "round": round_num,
                "positionMAE": _mean_absolute_error(actual, predicted_positions),
                "gridBaselineMAE": _mean_absolute_error(actual, grid_baseline),
            }
        )
    return results
