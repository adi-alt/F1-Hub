"""Monte Carlo race simulator, v2 — deliberately crude, with explicit documented assumptions
rather than invented mechanics with no data behind them:

  - Race pace is sampled as predicted_pace + noise, where the noise itself has 3 additive
    components (see "v2" below) rather than one independent-per-driver Gaussian.
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
explicitly out of scope.

v1 (uniform 2.2s noise) beat the existing Finish model and a naive baseline on the full 175-round
walk-forward set, but calibration was poor (systematic under-confidence about genuine contenders).
v1.1 (grid-bucketed noise, GRID_NOISE_BUCKETS below — stdevs estimated from 2018-2023 Pace-model
residuals, held out 2024-2026 to confirm it generalizes) fixed MAE/Spearman further but *not*
calibration — heteroscedastic noise by grid position was real but insufficient. v1.2 added
walk-forward probability recalibration (ml/calibrate_probabilities.py) on top, which fixed podium
calibration but left P1 only at naive parity.

v2 (this version) fixes a different, deeper problem: **the independent-per-driver noise assumption
itself was wrong.** Diagnosed directly on the Pace model's own walk-forward residuals (175 rounds):
the variance of each race's *mean* residual across drivers is 9.15x larger than independence would
predict, and residuals between teammates correlate at r=0.618 — both far too large to be chance.
Real F1 races have shared, race-wide shocks (track evolution, a weather shift, a systematic
misread of that circuit) and shared team-level effects (a car update, a shared strategy call) that
move multiple drivers' actual pace the same direction on the same day — noise that's correlated,
not independent. Method-of-moments variance decomposition on that same residual data splits total
per-driver residual variance into three additive components: ~50% race-shared, ~12% team-shared,
~38% individual (RACE_SHOCK_FRACTION/TEAM_SHOCK_FRACTION/INDIVIDUAL_FRACTION below) — applied as
*fractions* of each driver's existing grid-bucket total variance, so the independently-confirmed
heteroscedastic-by-grid finding is preserved, not discarded. Verified on the same 112-round
walk-forward population as the frozen `simulator-v1.2` benchmark, beating it on every metric, not a
mixed bag: MAE 3.889→3.721, Spearman 0.614→0.621, raw P1/podium Brier 0.0501/0.1246→0.0452/0.1068,
calibrated P1/podium Brier 0.0479/0.1247→0.0470/0.1007. This is also the mechanism that let a
genuinely better Pace model (the tyre-aware features — see ml/tyre_features.py) actually help the
simulator, which it hadn't under v1.2's independent-noise assumption: the bottleneck wasn't pace
point-estimate quality, it was not modeling *why* drivers' pace errors move together.
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

# Method-of-moments variance decomposition on the Pace model's real walk-forward residuals (175
# rounds, 2018-2026): pooled residual variance 4.132, race-mean-residual variance 9.15x the
# independence-implied value, teammate residual correlation 0.618. Solving the resulting variance
# equations for a race-shared / team-shared (nested within race) / individual decomposition gives
# roughly 50% / 12% / 38% of total variance. Applied as fractions of each driver's own grid-bucket
# stdev, not a flat global number, so the independently-confirmed grid effect is preserved.
RACE_SHOCK_FRACTION = 0.50
TEAM_SHOCK_FRACTION = 0.12
INDIVIDUAL_FRACTION = 0.38


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
    """entrants: [{"driver", "team", "grid", ...}, ...] — order defines index mapping only, not
    finishing order; `grid` selects each driver's total pace-noise stdev, `team` groups drivers for
    the shared team-shock component (see module docstring). Returns, per driver:
    positionProbabilities (index 0 = P1), medianPosition, meanPosition, p1, podium, top5,
    simulatedDnfRate.
    """
    rng = np.random.default_rng(seed)
    drivers = [e["driver"] for e in entrants]
    n = len(drivers)

    pace_means = np.array([predicted_pace.get(d, 2.0) for d in drivers])
    dnf_probs = np.array([dnf_probabilities.get(d, 0.15) for d in drivers])
    noise_stds = np.array([_noise_std_for_grid(e.get("grid", 20) or 20) for e in entrants])

    # Correlated noise: one shared draw per race (every driver), one shared draw per team (both
    # teammates), plus independent per-driver noise — each scaled to its variance fraction of that
    # driver's own total stdev, so Var(race_shock)+Var(team_shock)+Var(individual) == total variance
    # for every driver regardless of their grid bucket.
    teams = [e.get("team", d) for e, d in zip(entrants, drivers)]
    unique_teams = sorted(set(teams))
    team_index = {t: i for i, t in enumerate(unique_teams)}
    team_idx_per_driver = np.array([team_index[t] for t in teams])

    race_shock_z = rng.normal(0.0, 1.0, size=(n_simulations, 1))
    team_shock_z = rng.normal(0.0, 1.0, size=(n_simulations, len(unique_teams)))[:, team_idx_per_driver]
    individual_z = rng.normal(0.0, 1.0, size=(n_simulations, n))

    noise = (
        np.sqrt(RACE_SHOCK_FRACTION) * race_shock_z
        + np.sqrt(TEAM_SHOCK_FRACTION) * team_shock_z
        + np.sqrt(INDIVIDUAL_FRACTION) * individual_z
    ) * noise_stds[None, :]
    simulated_pace = pace_means[None, :] + noise
    dnf_draws = rng.random((n_simulations, n)) < dnf_probs[None, :]
    _sc_draws = rng.random(n_simulations) < sc_probability  # sampled, deliberately unused

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
