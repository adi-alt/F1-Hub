"""Predicted race pace, expressed as a gap to that race's fastest lap rather than an absolute lap
time — port of predictPace.ts. Absolute lap times vary hugely by circuit (Monaco ~70s, Spa ~103s),
so pooling raw seconds across a season's worth of different circuits would mostly just learn
"which circuit is this," not driver pace. Gap-to-fastest is circuit-agnostic.

Plain OLS, not a random forest — this was already the simplest tool that fit the job in the
TypeScript version, and nothing about the FastF1 migration changes that.
"""

from __future__ import annotations

from statistics import mean


def _pace_training_points(races: list[dict]) -> list[tuple[float, float]]:
    """races: [{"driver": ..., "qualifyingGapSec": ..., "fastestLapSec": ... | None}, ...] per race."""
    points = []
    for race_results in races:
        laps = [r for r in race_results if r["fastestLapSec"] is not None and r["qualifyingGapSec"] is not None]
        if not laps:
            continue
        race_fastest = min(lap["fastestLapSec"] for lap in laps)
        points.extend((lap["qualifyingGapSec"], lap["fastestLapSec"] - race_fastest) for lap in laps)
    return points


def fit_pace_model(races: list[dict]) -> dict:
    points = _pace_training_points(races)
    if len(points) < 2:
        return {"intercept": 0.0, "slope": 1.0, "trainingPoints": len(points)}

    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    mean_x, mean_y = mean(xs), mean(ys)
    numerator = sum((x - mean_x) * (y - mean_y) for x, y in points)
    denominator = sum((x - mean_x) ** 2 for x in xs)
    slope = numerator / denominator if denominator != 0 else 1.0
    intercept = mean_y - slope * mean_x
    return {"intercept": intercept, "slope": slope, "trainingPoints": len(points)}


def predict_pace_gaps(model: dict, inputs: list[dict]) -> dict:
    """inputs: [{"driver": ..., "qualifyingGapSec": ...}, ...] for the race being predicted."""
    return {
        entry["driver"]: max(0.0, round(model["intercept"] + model["slope"] * entry["qualifyingGapSec"], 3))
        for entry in inputs
    }
