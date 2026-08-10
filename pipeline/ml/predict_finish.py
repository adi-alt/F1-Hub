"""Finish-order model — a faithful port of predictFinish.ts (deleted TypeScript/ml-random-forest
version) onto scikit-learn. Same algorithm family (Random Forest), same reasoning for choosing it
over gradient boosting: training sets are tiny (as few as ~20 rows early in a season), and
bagging degrades far more gracefully than boosting at that scale — confirmed empirically, not just
argued: gradient boosting, a small neural net, and plain linear regression were all tested against
the same real backtest and every one of them did worse.

Two things layered on top of that base model, both aimed at the specific failure the backtest
exposed — losing to plain grid order early in a season, when there's too little same-season data
to trust yet:
  1. `monotonic_cst` encodes what's already known to be true (better grid/form should never
     predict a *worse* finish) as a hard constraint. Elo ratings run the opposite direction from
     the rolling-average features they replaced — higher is *better* now — so their constraint
     sign is flipped accordingly.
  2. `_blend_with_grid` shrinks the model's prediction toward the grid baseline itself when the
     total training set is still small, fading out as more of the season completes. This is the
     model-level complement to Elo's *entity*-level shrinkage (a driver/team's own rating moving
     less once it has history) — this one addresses "does the model as a whole have enough to go
     on yet," which per-entity shrinkage alone doesn't cover.
"""

from __future__ import annotations

from statistics import mean

import numpy as np
from sklearn.ensemble import RandomForestRegressor

from .features import FEATURE_ORDER, TrainingResultRow, build_historical_features, build_input_features, to_feature_matrix

MODEL_VERSION = "sklearn-rf-v2-elo"

# grid, qualifyingGapSec: higher (worse) must never predict a better finish -> +1.
# driverEloRating, teamEloRating: higher (better) must never predict a worse finish -> -1.
# driverHistoryCount, teamHistoryCount: no known direction, left unconstrained.
MONOTONIC_CST = [1, 1, -1, -1, 0, 0]

# How many same-season training rows before the grid-baseline blend fades to zero and the model's
# own prediction is fully trusted. ~7 races' worth on a 20-car grid — a round number chosen to be
# in the right ballpark, not tuned against this specific backtest (tuning a shrinkage constant
# against the same small dataset it's meant to protect would just move the overfitting somewhere
# else).
FULL_TRUST_ROWS = 150


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


def _blend_with_grid(predicted_score: float, grid: float | None, total_training_rows: int) -> float:
    if grid is None:
        return predicted_score
    alpha = max(0.0, 1.0 - total_training_rows / FULL_TRUST_ROWS)
    return alpha * grid + (1 - alpha) * predicted_score


def predict_finish_order(history: list[TrainingResultRow], inputs: list[dict]) -> dict:
    """Trains on all supplied (same-season, strictly-prior) history and ranks the given field."""
    training = build_historical_features(history)
    model = _build_model()
    model.fit(to_feature_matrix(training), [row["finishPosition"] for row in training])

    race_features = build_input_features(inputs, history)
    matrix = np.array(to_feature_matrix(race_features))
    raw_scores = model.predict(matrix)
    scores = [_blend_with_grid(float(s), entry["grid"], len(training)) for s, entry in zip(raw_scores, inputs)]
    # Per-tree predictions, not just the forest's average — this is the spread the UI shows as
    # "±N" next to a prediction, and later feeds things like podium-probability estimates. Taken
    # from the raw (unblended) model, since the blend is a point-estimate adjustment, not a
    # statement about the forest's own uncertainty.
    per_tree = np.array([tree.predict(matrix) for tree in model.estimators_])

    ranked = sorted(
        (
            {
                "driver": entry["driver"],
                "team": entry["team"],
                "grid": entry["grid"],
                "predictedScore": scores[i],
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
    "does the model work," it's "is the model actually better than just trusting the grid." Runs
    the same grid-blend the live prediction path uses, so this backtest is honest about what
    actually ships, not a cleaner version of it.
    """
    featured = build_historical_features(history)
    rounds = sorted({r.round for r in history})
    results = []

    for round_num in rounds[1:]:
        train = [f for f in featured if f["round"] < round_num]
        test = [f for f in featured if f["round"] == round_num]
        model = _build_model()
        model.fit(to_feature_matrix(train), [row["finishPosition"] for row in train])
        raw_scores = model.predict(np.array(to_feature_matrix(test)))
        scores = [_blend_with_grid(float(s), row["grid"], len(train)) for s, row in zip(raw_scores, test)]
        predicted_positions = _rank_to_positions(scores)
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
