"""Circuit-level historical context: safety car frequency, overtaking difficulty, rain
probability, pit-stop patterns at a given circuit. Unlike driver/team form (kept strictly
same-season, see features.py), these are properties of the *track*, so they're genuinely useful
across seasons — but naive equal-weighted multi-year averaging would treat 2019 Monaco and 2025
Monaco as equally predictive of 2026 Monaco, which is wrong on two counts: recency (track surface,
run-off, DRS zones change) and regulation era (car characteristics that drive overtaking/safety-car
rates reset at 2022 and 2026). Both are folded into one combined weight per historical race rather
than averaged flatly.

This was originally built as a per-driver finish-model feature and correctly rejected there — a
race-level number is identical for every driver in a race, so it carries no ranking signal. Its
real home is a race-level model (safety-car/DNF/rain probability), where the leakage-safety rule is
the same one used everywhere else in this pipeline, just chronological across years instead of
within a season: a race's circuit features only ever come from strictly earlier (year, round)
pairs at that location.
"""

from __future__ import annotations

from dataclasses import dataclass

# 2018-2021: previous aero generation. 2022-2025: ground-effect floor regulations. 2026+: new
# power-unit and aero rules. Coarse, named eras rather than one label per year — the model only
# needs to know "was this the same technical regime," not memorize every season individually.
REGULATION_ERAS = [(2018, 2021), (2022, 2025), (2026, 9999)]

RECENCY_DECAY = 0.7
DIFFERENT_ERA_WEIGHT = 0.3

CIRCUIT_FEATURE_ORDER = [
    "circuitSafetyCarRate",
    "circuitOvertakingDelta",
    "circuitRainProbability",
    "circuitAvgPitStops",
]

# Neutral fallbacks used only when a circuit has no prior history *and* no other race exists yet
# to fall back on (e.g. the very first race ever processed) — realistic season-average ballpark
# figures, not zeros, so a brand-new circuit doesn't look like a guaranteed dry, safety-car-free,
# zero-stop race.
_NEUTRAL_DEFAULTS = {
    "circuitSafetyCarRate": 0.6,
    "circuitOvertakingDelta": 2.5,
    "circuitRainProbability": 0.15,
    "circuitAvgPitStops": 2.0,
}


def _era_index(year: int) -> int:
    for idx, (start, end) in enumerate(REGULATION_ERAS):
        if start <= year <= end:
            return idx
    return len(REGULATION_ERAS)


def _weight(history_year: int, target_year: int) -> float:
    gap = max(target_year - history_year, 1)
    recency = RECENCY_DECAY ** (gap - 1)
    era_match = 1.0 if _era_index(history_year) == _era_index(target_year) else DIFFERENT_ERA_WEIGHT
    return recency * era_match


@dataclass
class CircuitRaceRecord:
    location: str
    year: int
    round: int
    safety_car_periods: float | None
    overtaking_delta: float | None  # mean |finishPosition - gridPosition| across classified finishers
    rainfall: bool | None
    avg_pit_stops: float | None  # mean tire-stint count per driver, a proxy for stop count


def build_circuit_records(race_docs: list[dict]) -> list[CircuitRaceRecord]:
    """One record per completed race doc. Pass every completed race across every year — this is
    the one place in the pipeline that's deliberately cross-season."""
    records = []
    for doc in race_docs:
        race = doc.get("race")
        if not race:
            continue
        results = race.get("results", [])
        deltas = [
            abs(r["finishPosition"] - r["gridPosition"]) for r in results if r.get("gridPosition") is not None
        ]
        stints_per_driver: dict[str, int] = {}
        for stint in race.get("tireStints", []):
            stints_per_driver[stint["driver"]] = stints_per_driver.get(stint["driver"], 0) + 1

        records.append(
            CircuitRaceRecord(
                location=doc["location"],
                year=doc["year"],
                round=doc["round"],
                safety_car_periods=race.get("safetyCarPeriods"),
                overtaking_delta=(sum(deltas) / len(deltas)) if deltas else None,
                rainfall=(race.get("weather") or {}).get("rainfall"),
                avg_pit_stops=(sum(stints_per_driver.values()) / len(stints_per_driver)) if stints_per_driver else None,
            )
        )
    return records


def build_circuit_features(
    records: list[CircuitRaceRecord], location: str, before_year: int, before_round: int
) -> dict:
    """Recency- and era-weighted average of every strictly-prior race at `location`. Falls back to
    the whole (still weighted) historical pool for a circuit with no prior visits, then to fixed
    neutral defaults only if there's no history at all yet."""
    prior = [r for r in records if (r.year, r.round) < (before_year, before_round)]
    same_circuit = [r for r in prior if r.location == location]
    pool = same_circuit if same_circuit else prior

    def weighted_mean(getter, key: str) -> float:
        weighted_sum = 0.0
        weight_total = 0.0
        for r in pool:
            value = getter(r)
            if value is None:
                continue
            w = _weight(r.year, before_year)
            weighted_sum += w * float(value)
            weight_total += w
        return weighted_sum / weight_total if weight_total > 0 else _NEUTRAL_DEFAULTS[key]

    return {
        "circuitSafetyCarRate": weighted_mean(lambda r: r.safety_car_periods, "circuitSafetyCarRate"),
        "circuitOvertakingDelta": weighted_mean(lambda r: r.overtaking_delta, "circuitOvertakingDelta"),
        "circuitRainProbability": weighted_mean(lambda r: 1.0 if r.rainfall else (0.0 if r.rainfall is not None else None), "circuitRainProbability"),
        "circuitAvgPitStops": weighted_mean(lambda r: r.avg_pit_stops, "circuitAvgPitStops"),
    }
