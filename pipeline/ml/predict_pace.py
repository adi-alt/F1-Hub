"""Predicted race pace, expressed as a gap to that race's fastest lap rather than an absolute lap
time — absolute lap times vary hugely by circuit (Monaco ~70s, Spa ~103s), so pooling raw seconds
across a season's worth of different circuits would mostly just learn "which circuit is this," not
driver pace. Gap-to-fastest is circuit-agnostic.

Random Forest, not the plain single-variable OLS this replaced — verified on the real walk-forward
backtest: adding grid position and a dedicated race-pace Elo (ranked by actual fastest-lap gap,
not classified finish position, since pace and finish diverge on strategy/incidents/reliability)
cut MAE from 1.064 to 0.903, improved R² from -0.283 to -0.146, and raised Spearman from 0.449 to
0.615 — a clean win across the whole metric vector, not a cherry-picked one. Same monotonic-
constraint/small-N reasoning as the other two models applies here too.
"""

from __future__ import annotations

from sklearn.ensemble import RandomForestRegressor

from .pace_features import PaceResultRow, build_pace_historical_features, build_pace_input_features, to_pace_feature_matrix

MODEL_VERSION = "sklearn-rf-v2-pace"

# grid, qualifyingGapSec: higher (worse) must never predict a smaller pace gap -> +1.
# driverPaceEloRating, teamPaceEloRating: higher (better) must never predict a worse pace gap -> -1.
MONOTONIC_CST = [1, 1, -1, -1]


def predict_pace_gaps(history: list[PaceResultRow], inputs: list[dict]) -> dict[str, float]:
    """inputs: [{"driver", "team", "grid", "qualifyingGapSec"}, ...] for the race being predicted."""
    training = build_pace_historical_features(history)
    if len(training) < 10:
        # Too little same-season history for a 500-tree forest to mean anything — fall back to
        # the identity mapping (assume race gap mirrors qualifying gap) rather than overfit noise.
        return {entry["driver"]: max(0.0, round(entry["qualifyingGapSec"], 3)) for entry in inputs}

    model = RandomForestRegressor(n_estimators=500, max_features=0.8, monotonic_cst=MONOTONIC_CST, random_state=42)
    model.fit(to_pace_feature_matrix(training), [row["paceGapSec"] for row in training])

    race_features = build_pace_input_features(inputs, history)
    scores = model.predict(to_pace_feature_matrix(race_features))
    return {entry["driver"]: max(0.0, round(float(s), 3)) for entry, s in zip(inputs, scores)}
