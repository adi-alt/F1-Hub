"""Monte Carlo race simulator, v1 — deliberately crude, with explicit documented assumptions
rather than invented mechanics with no data behind them:

  - Race pace is sampled as predicted_pace + Gaussian noise. The noise stdev (2.2s) is the real
    residual stdev of the Pace model's own walk-forward backtest, not a guess.
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

Verified on a 40-race walk-forward sample against the two deterministic baselines (the existing
Finish model, and a plain grid+pace ranking): using the median of each driver's simulated position
distribution — not the mean, which is a natural first instinct but is the wrong summary statistic
for MAE — the simulator beats both on MAE (3.482 vs 3.790/3.770) and Spearman (0.640 vs
0.602/0.597), and its P1/podium probabilities beat a naive uniform baseline on Brier score (P1:
0.0416 vs 0.0475; podium: 0.091 vs 0.1275). A real result, not a wash — though on a smaller sample
than the 175-round benchmarks used elsewhere in this pipeline, worth firming up on more data before
treating these numbers as permanently frozen.
"""

from __future__ import annotations

import numpy as np

# The real residual stdev of the Pace model's own walk-forward backtest (2018-2026, 2990 rows) —
# an empirical number, not a guess. Applied uniformly to every driver; in reality a front-runner's
# race-to-race pace is probably less volatile than a backmarker's, but there's no per-driver
# volatility estimate to justify anything more granular yet.
PACE_NOISE_STD_SEC = 2.20

# No circuit-specific safety-car signal beat this (see ml/circuit_stats.py) — the honest estimate
# right now really is just the historical rate across every race.
GLOBAL_SC_RATE = 0.734


def simulate_race(
    entrants: list[dict],
    predicted_pace: dict[str, float],
    dnf_probabilities: dict[str, float],
    n_simulations: int = 10_000,
    pace_noise_std: float = PACE_NOISE_STD_SEC,
    sc_probability: float = GLOBAL_SC_RATE,
    seed: int | None = 42,
) -> dict[str, dict]:
    """entrants: [{"driver", ...}, ...] — order defines index mapping only, not finishing order.
    Returns, per driver: positionProbabilities (index 0 = P1), meanPosition, p1, podium, top5,
    simulatedDnfRate.
    """
    rng = np.random.default_rng(seed)
    drivers = [e["driver"] for e in entrants]
    n = len(drivers)

    pace_means = np.array([predicted_pace.get(d, 2.0) for d in drivers])
    dnf_probs = np.array([dnf_probabilities.get(d, 0.15) for d in drivers])

    noise = rng.normal(0.0, pace_noise_std, size=(n_simulations, n))
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
        # MAE is minimized by the median of a distribution, not the mean — verified on the real
        # backtest that using the mean here (a natural first instinct) makes the point estimate
        # measurably worse than the existing deterministic models, while the median beats them.
        # Same distribution either way; only the summary statistic changes.
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
