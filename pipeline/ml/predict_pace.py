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

v3 adds 4 leakage-safe cross-season tyre-management traits (ml/tyre_features.py, from real
per-compound pace/degradation data, not stint counts). Verified with `pace_chronological_backtest`
below + evaluate_pace_benchmark.py (see benchmarks/pace/ for the reproducible manifest) — this is
the model's first version with a *permanent* backtest harness. The v2 numbers above (0.903 MAE,
R² -0.146, Spearman 0.615) came from a one-off script that was deleted after use; a later attempt
to reconstruct that exact harness landed on a different but neighboring result (1.002/-0.155/0.659
for the same 4 features) and the discrepancy could not be reconciled — warmup-round convention
turned out to matter more than population size, and the original script no longer exists to diff
against. Both are kept, never overwritten: see benchmarks/pace/sklearn-rf-v2-pace.json (harness
lost, values as remembered) vs benchmarks/pace/sklearn-rf-v3-pace-tyre.json (this version, fully
reproducible — the manifest records exactly what protocol produced it).
"""

from __future__ import annotations

from statistics import mean

import numpy as np
from scipy.stats import spearmanr
from sklearn.ensemble import RandomForestRegressor

from .pace_features import PaceResultRow, build_pace_historical_features, build_pace_input_features, to_pace_feature_matrix

MODEL_VERSION = "sklearn-rf-v3-pace-tyre"

# grid, qualifyingGapSec: higher (worse) must never predict a smaller pace gap -> +1.
# driverPaceEloRating, teamPaceEloRating: higher (better) must never predict a worse pace gap -> -1.
# *TyrePaceDelta: historically running further off pace on tyres must never predict a smaller race
# gap -> +1. *TyreDegradation: sign is ambiguous (conflates real tire wear with fuel-burn/track
# evolution) -> unconstrained.
MONOTONIC_CST = [1, 1, -1, -1, 1, 0, 1, 0]


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


def _mean_absolute_error(actual: list[float], predicted: list[float]) -> float:
    return mean(abs(a - p) for a, p in zip(actual, predicted))


def pace_chronological_backtest(history: list[PaceResultRow]) -> list[dict]:
    """Walk-forward, one round at a time — same discipline as predict_finish.py's
    chronological_backtest and predict_pole.py's pole_chronological_backtest. `history` must
    already be scoped to a single season (this model's Elo features reset per season in
    production; the 4 tyre traits are cross-season and expected to already be resolved onto each
    PaceResultRow by the caller — see ml/tyre_features.py).

    Uses the identical >=10-row gate predict_pace_gaps enforces in production, so this backtest
    evaluates exactly what would actually have been predicted, not an idealized version of it —
    not a fixed "skip N rounds" warmup, which is the ambiguity that made the v2 (no-tyre) benchmark
    impossible to reconcile later. Naive baseline is the same identity-mapping fallback production
    falls back to below that threshold (assume race pace gap mirrors qualifying gap).
    """
    featured = build_pace_historical_features(history)
    rounds = sorted({f["round"] for f in featured})
    results = []

    for round_num in rounds:
        train = [f for f in featured if f["round"] < round_num]
        test = [f for f in featured if f["round"] == round_num]
        if len(train) < 10 or not test:
            continue
        model = RandomForestRegressor(n_estimators=500, max_features=0.8, monotonic_cst=MONOTONIC_CST, random_state=42)
        model.fit(to_pace_feature_matrix(train), [row["paceGapSec"] for row in train])
        predicted = model.predict(np.array(to_pace_feature_matrix(test))).tolist()
        actual = [row["paceGapSec"] for row in test]
        naive = [row["qualifyingGapSec"] for row in test]
        rho = spearmanr(predicted, actual).correlation if len(test) >= 3 else None

        results.append(
            {
                "round": round_num,
                "mae": _mean_absolute_error(actual, predicted),
                "naiveMae": _mean_absolute_error(actual, naive),
                "spearman": None if rho is None or np.isnan(rho) else float(rho),
                "predicted": predicted,
                "actual": actual,
            }
        )
    return results
