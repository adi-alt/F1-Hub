"""DNF probability model — the first race-environment model, not a per-driver ranking model like
finish/pole/pace. Target is P(this driver retires), a genuinely useful input to a future race
simulation. Unlike safety cars (tried and rejected as a race-level model — circuit identity alone
never beat the naive global base rate), DNF is driver/team-specific and does beat naive here.

Cross-season on purpose, unlike the Elo-based models: reliability (car failures, driver incident
rate) is plausible as a persisting trait across season boundaries in a way pure competitive
strength isn't, and the backtest confirms this — same-season-only history would have too few rows
per driver/team to be useful this early in a season.

Historical driver/team DNF rates are used *raw*, not shrunk toward the global rate first — tested
shrinkage at several trust thresholds and it was consistently slightly worse than raw. Random
Forest already learns the equivalent of "how much to trust this rate" nonlinearly from the raw
counts (effectively deciding its own split thresholds by sample size), so a hand-tuned linear
shrinkage on top is redundant, unlike the plain logistic regression in the safety-car experiment,
which had no way to do that adaptively.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import mean

import numpy as np
from sklearn.ensemble import RandomForestClassifier

MODEL_VERSION = "sklearn-rf-v1-dnf"

DNF_FEATURE_ORDER = ["driverDnfRate", "teamDnfRate", "grid", "qualifyingGapSec"]

GLOBAL_DNF_RATE_DEFAULT = 0.15  # observed base rate across 2018-2026; used only before any history exists


@dataclass
class DnfResultRow:
    year: int
    round: int
    driver: str
    team: str
    grid: float
    qualifying_gap_sec: float
    dnf: int  # 1 if retired, else 0


def build_dnf_historical_features(all_results: list[DnfResultRow]) -> list[dict]:
    """One feature row per historical result, in strict chronological order. Each row's
    driver/team DNF rate reflects only strictly-prior races — the running counters update *after*
    a row is featured, never before, so a race never leaks its own outcome into its own features.
    """
    ordered = sorted(all_results, key=lambda r: (r.year, r.round))
    driver_counts: dict[str, list[int]] = {}  # driver -> [dnf_sum, count]
    team_counts: dict[str, list[int]] = {}
    global_sum, global_count = 0, 0

    featured = []
    for row in ordered:
        global_rate = (global_sum / global_count) if global_count else GLOBAL_DNF_RATE_DEFAULT
        d_sum, d_count = driver_counts.get(row.driver, (0, 0))
        t_sum, t_count = team_counts.get(row.team, (0, 0))
        driver_rate = (d_sum / d_count) if d_count else global_rate
        team_rate = (t_sum / t_count) if t_count else global_rate

        featured.append(
            {
                "driverDnfRate": driver_rate,
                "teamDnfRate": team_rate,
                "grid": row.grid,
                "qualifyingGapSec": row.qualifying_gap_sec,
                "year": row.year,
                "round": row.round,
                "driver": row.driver,
                "team": row.team,
                "dnf": row.dnf,
            }
        )

        driver_counts[row.driver] = (d_sum + row.dnf, d_count + 1)
        team_counts[row.team] = (t_sum + row.dnf, t_count + 1)
        global_sum += row.dnf
        global_count += 1

    return featured


def _current_dnf_rates(all_results: list[DnfResultRow]) -> tuple[dict[str, float], dict[str, float], float]:
    driver_counts: dict[str, list[int]] = {}
    team_counts: dict[str, list[int]] = {}
    global_sum, global_count = 0, 0
    for row in sorted(all_results, key=lambda r: (r.year, r.round)):
        d_sum, d_count = driver_counts.get(row.driver, (0, 0))
        driver_counts[row.driver] = (d_sum + row.dnf, d_count + 1)
        t_sum, t_count = team_counts.get(row.team, (0, 0))
        team_counts[row.team] = (t_sum + row.dnf, t_count + 1)
        global_sum += row.dnf
        global_count += 1
    global_rate = (global_sum / global_count) if global_count else GLOBAL_DNF_RATE_DEFAULT
    driver_rates = {d: (s / c) for d, (s, c) in driver_counts.items()}
    team_rates = {t: (s / c) for t, (s, c) in team_counts.items()}
    return driver_rates, team_rates, global_rate


def to_dnf_feature_matrix(rows: list[dict]) -> list[list[float]]:
    return [[row[key] for key in DNF_FEATURE_ORDER] for row in rows]


def _build_model() -> RandomForestClassifier:
    return RandomForestClassifier(n_estimators=200, max_depth=4, random_state=42)


def predict_dnf_probabilities(history: list[DnfResultRow], inputs: list[dict]) -> dict[str, float]:
    """inputs: [{"driver", "team", "grid", "qualifyingGapSec"}, ...] for the race being predicted."""
    training = build_dnf_historical_features(history)
    if len(training) < 50 or len({r["dnf"] for r in training}) < 2:
        return {entry["driver"]: GLOBAL_DNF_RATE_DEFAULT for entry in inputs}

    model = _build_model()
    model.fit(to_dnf_feature_matrix(training), [row["dnf"] for row in training])

    driver_rates, team_rates, global_rate = _current_dnf_rates(history)
    rows = [
        {
            "driverDnfRate": driver_rates.get(entry["driver"], global_rate),
            "teamDnfRate": team_rates.get(entry["team"], global_rate),
            "grid": entry["grid"],
            "qualifyingGapSec": entry["qualifyingGapSec"] if entry["qualifyingGapSec"] is not None else 2.0,
        }
        for entry in inputs
    ]
    probs = model.predict_proba(np.array(to_dnf_feature_matrix(rows)))[:, 1]
    return {entry["driver"]: round(float(p), 4) for entry, p in zip(inputs, probs)}


def dnf_chronological_backtest(history: list[DnfResultRow], warmup_races: int = 15) -> list[dict]:
    """Walk-forward, one race at a time, evaluated against the naive global-rate baseline —
    same discipline as every other backtest in this pipeline. Retrains once per race, not once per
    driver-row, since the training set doesn't change between drivers within the same race."""
    ordered = sorted(history, key=lambda r: (r.year, r.round))
    races: dict[tuple[int, int], list[DnfResultRow]] = {}
    for row in ordered:
        races.setdefault((row.year, row.round), []).append(row)
    race_keys = sorted(races.keys())

    results = []
    for idx, key in enumerate(race_keys):
        if idx < warmup_races:
            continue
        prior_rows = [r for k in race_keys[:idx] for r in races[k]]
        training = build_dnf_historical_features(prior_rows)
        if len(training) < 20 or len({r["dnf"] for r in training}) < 2:
            continue
        model = _build_model()
        model.fit(to_dnf_feature_matrix(training), [row["dnf"] for row in training])

        driver_rates, team_rates, global_rate = _current_dnf_rates(prior_rows)
        test_rows = races[key]
        x_test = [
            [
                driver_rates.get(r.driver, global_rate),
                team_rates.get(r.team, global_rate),
                r.grid,
                r.qualifying_gap_sec,
            ]
            for r in test_rows
        ]
        probs = model.predict_proba(np.array(x_test))[:, 1]
        actual = [r.dnf for r in test_rows]

        brier_model = mean((p - a) ** 2 for p, a in zip(probs, actual))
        brier_naive = mean((global_rate - a) ** 2 for a in actual)
        results.append(
            {"year": key[0], "round": key[1], "brierModel": brier_model, "brierNaive": brier_naive}
        )
    return results
