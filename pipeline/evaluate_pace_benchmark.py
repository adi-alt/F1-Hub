"""Computes and freezes the Pace model's benchmark in the `model_benchmarks` table and a local
reproducibility manifest (`benchmarks/pace/{modelVersion}.json`) — see ml/predict_pace.py's
pace_chronological_backtest for the per-race mechanics. Run on demand (when the model or underlying
data changes), not on a schedule, same as evaluate_pole_benchmark.py.

This is the first *permanent* Pace benchmark harness — the original v2 (no-tyre) 0.903 MAE number
came from a one-off script that was deleted after use, and a later reconstruction attempt landed on
a different, unreconcilable number. Never overwrite a benchmark this script produces: if the model
changes again, bump MODEL_VERSION in ml/predict_pace.py first, so the new run writes a new
model_benchmarks row and a new manifest file instead of replacing this one.

Run:
  export DATABASE_URL='<the pooled connection string, see .env.local>'
  python pipeline/evaluate_pace_benchmark.py
"""

from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

from scipy.stats import spearmanr

from ergast_utils import init_postgres, upsert
from ml.pace_features import PACE_FEATURE_ORDER
from ml.predict_pace import MODEL_VERSION, MONOTONIC_CST, pace_chronological_backtest
from ml.tyre_features import build_tyre_trait_history
from train_predict import load_race_docs, to_pace_rows, to_tyre_rows


def _git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=Path(__file__).resolve().parent, stderr=subprocess.DEVNULL
        ).decode().strip()
    except Exception:
        return "unknown"


def main():
    conn = init_postgres()
    with conn.cursor() as cur:
        docs = load_race_docs(cur, "status = 'completed'", ())
    docs.sort(key=lambda d: (d["year"], d["round"]))

    all_tyre_rows = []
    for d in docs:
        all_tyre_rows.extend(to_tyre_rows(d))
    trait_history = build_tyre_trait_history(all_tyre_rows)

    by_year: dict[int, list[dict]] = {}
    for d in docs:
        by_year.setdefault(d["year"], []).append(d)

    per_race = []
    all_predicted: list[float] = []
    all_actual: list[float] = []

    for year in sorted(by_year):
        year_docs = sorted(by_year[year], key=lambda d: d["round"])
        rows = []
        event_by_round = {d["round"]: d["eventName"] for d in year_docs}
        for d in year_docs:
            rows.extend(to_pace_rows(d, trait_history))

        for round_result in pace_chronological_backtest(rows):
            all_predicted.extend(round_result["predicted"])
            all_actual.extend(round_result["actual"])
            per_race.append(
                {
                    "season": year,
                    "round": round_result["round"],
                    "eventName": event_by_round[round_result["round"]],
                    "mae": round(round_result["mae"], 3),
                    "naiveMae": round(round_result["naiveMae"], 3),
                    "spearman": round(round_result["spearman"], 3) if round_result["spearman"] is not None else None,
                }
            )

    if not per_race:
        raise SystemExit("No evaluable rounds found — nothing to benchmark.")

    race_level_spearman = [r["spearman"] for r in per_race if r["spearman"] is not None]
    pooled_rho, _ = spearmanr(all_predicted, all_actual)
    mean_actual = mean(all_actual)
    ss_res = sum((a - p) ** 2 for a, p in zip(all_actual, all_predicted))
    ss_tot = sum((a - mean_actual) ** 2 for a in all_actual)

    aggregate = {
        "mae": round(mean(r["mae"] for r in per_race), 3),
        "naiveMae": round(mean(r["naiveMae"] for r in per_race), 3),
        "spearman": round(mean(race_level_spearman), 3) if race_level_spearman else None,
        "pooledSpearman": round(float(pooled_rho), 3),
        "r2": round(1 - ss_res / ss_tot, 3),
        "evaluatedRounds": len(per_race),
        "totalDriverRows": len(all_actual),
        "seasons": sorted({r["season"] for r in per_race}),
    }

    evaluated_at = datetime.now(timezone.utc).isoformat()
    with conn.cursor() as cur:
        upsert(
            cur,
            "model_benchmarks",
            [
                {
                    "id": MODEL_VERSION,
                    "model": "pace",
                    "generated_at": evaluated_at,
                    "metrics": json.dumps({"aggregate": aggregate, "perRace": per_race}),
                }
            ],
            ["id"],
        )
    conn.close()

    manifest = {
        "model": "pace",
        "version": MODEL_VERSION,
        "gitCommit": _git_commit(),
        "evaluatedAt": evaluated_at,
        "evaluationPopulation": f"{aggregate['seasons'][0]}-{aggregate['seasons'][-1]}",
        "raceCount": aggregate["evaluatedRounds"],
        "warmupRule": (
            "len(train) >= 10 rows per season — mirrors predict_pace_gaps' own production "
            "fallback threshold, not a fixed round-count warmup"
        ),
        "walkForward": True,
        "seasonScoping": "Elo features reset per season; the 4 tyre traits are cross-season (ml/tyre_features.py)",
        "features": PACE_FEATURE_ORDER,
        "monotonicConstraints": MONOTONIC_CST,
        "targetDefinition": "fastest_lap_sec minus that race's fastest lap (paceGapSec)",
        "dnfHandling": "excluded from target — a DNF driver's fastest lap before retiring isn't a race-pace measurement",
        "randomSeed": 42,
        "modelBenchmarksRow": f"model_benchmarks/{MODEL_VERSION}",
        "metrics": aggregate,
    }
    manifest_path = Path(__file__).resolve().parent / "benchmarks" / "pace" / f"{MODEL_VERSION}.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"Benchmark for {MODEL_VERSION}:")
    for key, value in aggregate.items():
        print(f"  {key}: {value}")
    print(f"Wrote model_benchmarks/{MODEL_VERSION} ({len(per_race)} per-race records) and {manifest_path}")


if __name__ == "__main__":
    main()
