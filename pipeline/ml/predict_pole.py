"""Pole (qualifying) model — port of predictPole.ts. Weaker than the finish-order model on
purpose: it only has prior-round form to go on, since it has to produce something before a race
weekend's own qualifying exists. Frozen the moment that weekend's real qualifying data lands
(see train_predict.py) — from then on there's nothing left to guess about pole.
"""

from __future__ import annotations

from sklearn.ensemble import RandomForestRegressor

from .features import TrainingResultRow
from .pole_features import POLE_FEATURE_ORDER, build_pole_historical_features, build_pole_input_features, to_pole_feature_matrix

MODEL_VERSION = "sklearn-rf-v2-elo"

# driverQualiEloRating, teamQualiEloRating: higher (better) rating must never predict a worse
# pole -> -1 (opposite sign from the rolling-average position features these replaced, where
# higher was worse). History-depth counts: no known direction.
MONOTONIC_CST = [-1, -1, 0, 0]


def predict_pole_order(history: list[TrainingResultRow], entrants: list[dict]) -> dict:
    training = build_pole_historical_features(history)
    model = RandomForestRegressor(n_estimators=500, max_features=0.8, monotonic_cst=MONOTONIC_CST, random_state=42)
    model.fit(to_pole_feature_matrix(training), [row["qualiPosition"] for row in training])

    input_features = build_pole_input_features(entrants, history)
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
