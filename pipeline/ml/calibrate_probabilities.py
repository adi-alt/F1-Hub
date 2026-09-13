"""Post-hoc probability calibration for ml/simulate_race.py's outputs, fit only on past races —
same walk-forward discipline as everything else in this pipeline. Not a fix to the simulation
mechanics themselves; the ranking (median position, MAE, Spearman) is unaffected by design — this
only recalibrates the P1/podium probability *values*, which is a separate concern from whether the
underlying ranking is correct.

Isotonic and Platt/logistic were tested walk-forward on the real simulator output (175 races,
2018-2026) with different winners per target, not one universal answer:

  - P1: both land at ~0.0473 Brier, exactly matching the naive base-rate baseline (vs raw's 0.0494,
    which was worse than naive). A real fix, but not a genuine edge beyond "P1 is rare enough that
    there isn't much separable signal to calibrate toward" — Platt is used since it's the simpler,
    lower-variance choice when isotonic offers no advantage.
  - Podium: isotonic clearly wins (0.1185 vs Platt's 0.1219 and raw's 0.1221), and checking the
    reliability curve (not just the aggregate Brier, since a lower Brier can hide bad calibration
    elsewhere) confirms it's for the right reason — it corrects the exact high-probability-
    contender miscalibration the whole calibration effort was chasing (30-40% predicted bucket:
    raw predicted 0.338 vs actual 0.651, isotonic corrects to 0.723; 40-50% bucket: raw 0.443 vs
    actual 1.000, isotonic corrects to 0.934). It does get noisier at the low end (0-10% bucket
    moves slightly further from truth) — a real, smaller cost worth knowing about, not zero.
"""

from __future__ import annotations

import numpy as np
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression

# Below this many prior (probability, outcome) pairs, a calibrator fit on the pool is more likely
# to be noise than signal — return the raw probability unchanged rather than let a
# barely-fitted calibrator make things worse.
MIN_CALIBRATION_POOL = 400


def fit_p1_calibrator(prior_probs: list[float], prior_actuals: list[int]) -> LogisticRegression | None:
    if len(prior_probs) < MIN_CALIBRATION_POOL or len(set(prior_actuals)) < 2:
        return None
    model = LogisticRegression()
    model.fit(np.array(prior_probs).reshape(-1, 1), prior_actuals)
    return model


def fit_podium_calibrator(prior_probs: list[float], prior_actuals: list[int]) -> IsotonicRegression | None:
    if len(prior_probs) < MIN_CALIBRATION_POOL or len(set(prior_actuals)) < 2:
        return None
    model = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    model.fit(prior_probs, prior_actuals)
    return model


def apply_p1_calibrator(model: LogisticRegression | None, probs: list[float]) -> list[float]:
    if model is None:
        return probs
    return model.predict_proba(np.array(probs).reshape(-1, 1))[:, 1].tolist()


def apply_podium_calibrator(model: IsotonicRegression | None, probs: list[float]) -> list[float]:
    if model is None:
        return probs
    return model.predict(probs).tolist()
