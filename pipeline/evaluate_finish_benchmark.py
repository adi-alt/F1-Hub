"""Computes and freezes the Finish model's benchmark in the `model_benchmarks` table and a local
reproducibility manifest (`benchmarks/finish/{modelVersion}.json`) — see ml/predict_finish.py's
chronological_backtest for the per-race mechanics. Run on demand, not on a schedule, same as
evaluate_pole_benchmark.py.

The frozen 3.453 MAE figure quoted elsewhere in this project predates this script — it came from a
one-off validation run that was never persisted this way. This script doesn't assume that number is
reproduced; it establishes a new, permanent, reproducible one going forward. Never overwrite a
benchmark this script produces: if the model changes again, bump MODEL_VERSION in
ml/predict_finish.py first.

Run:
  export DATABASE_URL='<the pooled connection string, see .env.local>'
  python pipeline/evaluate_finish_benchmark.py
"""

from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

from ergast_utils import init_postgres, upsert
from ml.features import FEATURE_ORDER
from ml.predict_finish import MODEL_VERSION, MONOTONIC_CST, chronological_backtest
from train_predict import load_race_docs, to_training_rows


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

    by_year: dict[int, list[dict]] = {}
    for d in docs:
        by_year.setdefault(d["year"], []).append(d)

    per_race = []
    for year in sorted(by_year):
        year_docs = sorted(by_year[year], key=lambda d: d["round"])
        rows = []
        event_by_round = {d["round"]: d["eventName"] for d in year_docs}
        for d in year_docs:
            rows.extend(to_training_rows(d))

        for round_result in chronological_backtest(rows):
            per_race.append(
                {
                    "season": year,
                    "round": round_result["round"],
                    "eventName": event_by_round[round_result["round"]],
                    "mae": round(round_result["positionMAE"], 3),
                    "gridBaselineMae": round(round_result["gridBaselineMAE"], 3),
                }
            )

    if not per_race:
        raise SystemExit("No evaluable rounds found — nothing to benchmark.")

    aggregate = {
        "mae": round(mean(r["mae"] for r in per_race), 3),
        "gridBaselineMae": round(mean(r["gridBaselineMae"] for r in per_race), 3),
        "evaluatedRounds": len(per_race),
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
                    "model": "finish",
                    "generated_at": evaluated_at,
                    "metrics": json.dumps({"aggregate": aggregate, "perRace": per_race}),
                }
            ],
            ["id"],
        )
    conn.close()

    manifest = {
        "model": "finish",
        "version": MODEL_VERSION,
        "gitCommit": _git_commit(),
        "evaluatedAt": evaluated_at,
        "evaluationPopulation": f"{aggregate['seasons'][0]}-{aggregate['seasons'][-1]}",
        "raceCount": aggregate["evaluatedRounds"],
        "warmupRule": "first round of each season excluded (no prior same-season data); no other minimum",
        "walkForward": True,
        "seasonScoping": "Elo/history-count features reset per season",
        "features": FEATURE_ORDER,
        "monotonicConstraints": MONOTONIC_CST,
        "targetDefinition": "classified finish position, blended with a grid-baseline shrink while same-season training data is small (see _blend_with_grid)",
        "dnfHandling": "included — DNF drivers keep their classified finish position",
        "randomSeed": 42,
        "modelBenchmarksRow": f"model_benchmarks/{MODEL_VERSION}",
        "metrics": aggregate,
    }
    manifest_path = Path(__file__).resolve().parent / "benchmarks" / "finish" / f"{MODEL_VERSION}.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"Benchmark for {MODEL_VERSION}:")
    for key, value in aggregate.items():
        print(f"  {key}: {value}")
    print(f"Wrote model_benchmarks/{MODEL_VERSION} ({len(per_race)} per-race records) and {manifest_path}")


if __name__ == "__main__":
    main()
