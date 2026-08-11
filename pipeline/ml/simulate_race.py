"""Monte Carlo race simulator, v1.1 — deliberately crude, with explicit documented assumptions
rather than invented mechanics with no data behind them:

  - Race pace is sampled as predicted_pace + Gaussian noise, with the noise stdev depending on
    grid position (see GRID_NOISE_BUCKETS below) — not a single global stdev. Diagnosed first,
    not assumed: the Pace model's own real residuals are far from homoscedastic (front-runner
    stdev ~0.9-1.0s vs backmarker stdev ~3.2-3.8s, roughly a 3-4x spread), and v1's single global
    2.2s stdev was diluting genuine front-runners' real pace advantage in every simulation,
    which is exactly what v1's calibration check caught (systematic under-confidence about
    contenders — a 30-40% predicted podium bucket actually podiumed 70% of the time).
  - DNF is sampled independently per driver from ml/predict_dnf.py's probability.
  - Safety car occurrence is sampled from the global historical base rate (see
    ml/circuit_stats.py's investigation — no circuit-specific signal beat this) but has NO effect
    on finishing order yet. It's recorded, not wired to anything, on purpose: inventing "SC causes
    N positions of random shuffling" without data to estimate that effect would be exactly the
    kind of arbitrary assumption this project has consistently avoided elsewhere. Revisit once
    there's a real way to estimate the effect (e.g. from tire-strategy interaction).
  - DNF'd drivers are placed at the bottom of the order, in random relative order among themselves
    — we don't model which lap they retired on, so there's no principled way to order them
    relative to each other yet.

This answers one narrow question: does combining the point-estimate Pace model with probabilistic
DNF/SC sampling produce a better-calibrated *distribution* of outcomes than a single deterministic
prediction? Not "is this a complete race simulation" — tyre strategy, traffic, and pit strategy are
explicitly out of scope for v1.

v1 (uniform noise) was verified on the full 175-round walk-forward set (2018-2026, the same
population the frozen Finish/Pole/Pace benchmarks use) against two deterministic baselines: using
the median of each driver's simulated position (MAE is minimized by the median, not the mean — a
first pass used mean and was measurably worse than both baselines, a methodology bug, not a real
flaw), it beat the existing Finish model (MAE 3.071 vs 3.470, Spearman 0.693 vs 0.640) and a plain
grid+pace baseline (3.531/0.631), and beat a naive uniform baseline on aggregate Brier score (P1
0.0414 vs 0.0473; podium 0.096 vs 0.127). But bucketed calibration was poor — see above for why.

The GRID_NOISE_BUCKETS stdevs were estimated from 2018-2023 Pace-model residuals only, holding out
2024-2026 so the fix could be validated on genuinely unseen data rather than tuned against the
same races used to evaluate it — the same leakage-safety discipline used everywhere else in this
pipeline, applied to a calibration parameter instead of a training feature.
"""

from __future__ import annotations

import numpy as np

# Estimated from the Pace model's own walk-forward residuals, 2018-2023 only (2024-2026 held out
# for validation — see module docstring). (grid_low, grid_high, residual_stdev_sec).
GRID_NOISE_BUCKETS = [
    (1, 5, 0.95),
    (6, 10, 2.50),
    (11, 15, 2.45),
    (16, 25, 3.85),
]

# No circuit-specific safety-car signal beat this (see ml/circuit_stats.py) — the honest estimate
# right now really is just the historical rate across every race.
GLOBAL_SC_RATE = 0.734


def _noise_std_for_grid(grid: float) -> float:
    for lo, hi, std in GRID_NOISE_BUCKETS:
        if lo <= grid <= hi:
            return std
    return GRID_NOISE_BUCKETS[-1][2]


def simulate_race(
    entrants: list[dict],
    predicted_pace: dict[str, float],
    dnf_probabilities: dict[str, float],
    n_simulations: int = 10_000,
    sc_probability: float = GLOBAL_SC_RATE,
    seed: int | None = 42,
) -> dict[str, dict]:
    """entrants: [{"driver", "grid", ...}, ...] — order defines index mapping only, not finishing
    order; `grid` selects each driver's pace-noise bucket. Returns, per driver:
    positionProbabilities (index 0 = P1), medianPosition, meanPosition, p1, podium, top5,
    simulatedDnfRate.
    """
    rng = np.random.default_rng(seed)
    drivers = [e["driver"] for e in entrants]
    n = len(drivers)

    pace_means = np.array([predicted_pace.get(d, 2.0) for d in drivers])
    dnf_probs = np.array([dnf_probabilities.get(d, 0.15) for d in drivers])
    noise_stds = np.array([_noise_std_for_grid(e.get("grid", 20) or 20) for e in entrants])

    noise = rng.normal(0.0, 1.0, size=(n_simulations, n)) * noise_stds[None, :]
    simulated_pace = pace_means[None, :] + noise
    dnf_draws = rng.random((n_simulations, n)) < dnf_probs[None, :]
    _sc_draws = rng.random(n_simulations) < sc_probability  # sampled, deliberately unused in v1

    # DNF'd drivers rank last, in random relative order among themselves (tiny random tie-breaker
    # rather than a fixed one, so ties don't always resolve the same way by array index).
    tie_breaker = rng.random((n_simulations, n)) * 1e-6
    pace_for_ranking = np.where(dnf_draws, 1e6 + tie_breaker, simulated_pace)
    finish_positions = np.argsort(np.argsort(pace_for_ranking, axis=1), axis=1) + 1  # (n_sim, n)

    results = {}
    for i, driver in enumerate(drivers):
        position_probs = np.array([(finish_positions[:, i] == pos).mean() for pos in range(1, n + 1)])
        # MAE is minimized by the median of a distribution, not the mean.
        cumulative = np.cumsum(position_probs)
        median_position = int(np.searchsorted(cumulative, 0.5) + 1)
        results[driver] = {
            "positionProbabilities": position_probs.tolist(),
            "medianPosition": median_position,
            "meanPosition": float(np.dot(position_probs, np.arange(1, n + 1))),
            "p1": float(position_probs[0]),
            "podium": float(position_probs[:3].sum()),
            "top5": float(position_probs[:5].sum()),
            "simulatedDnfRate": float(dnf_draws[:, i].mean()),
        }
    return results
