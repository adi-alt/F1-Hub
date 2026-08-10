"""Computes and freezes the pole model's benchmark in Firestore (`modelBenchmarks/{modelVersion}`)
— deliberately a separate artifact from the live per-race polePrediction, recomputed on demand
(when the model or the underlying data changes) rather than every scheduled tick. MAE alone can't
distinguish "got the competitive hierarchy right, off by a place" from "no signal at all," so this
also reports Spearman rank correlation (both per-race-averaged and pooled across every driver),
P1/top-3/top-5 hit rates, and a naive "last known quali position" baseline for comparison — see
ml/predict_pole.py's pole_chronological_backtest for the per-race mechanics.

Run:
  python pipeline/evaluate_pole_benchmark.py
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from statistics import mean

import firebase_admin
from firebase_admin import credentials, firestore
from scipy.stats import spearmanr

from ml.predict_pole import MODEL_VERSION, pole_chronological_backtest
from train_predict import to_training_rows


def init_firestore():
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise SystemExit("FIREBASE_SERVICE_ACCOUNT_JSON is not set.")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(json.loads(raw)))
    return firestore.client()


def main():
    db = init_firestore()
    docs = [d.to_dict() for d in db.collection("races").where("status", "==", "completed").stream()]
    by_year: dict[int, list[dict]] = {}
    for d in docs:
        by_year.setdefault(d["year"], []).append(d)

    per_race = []
    all_predicted: list[int] = []
    all_actual: list[int] = []

    for year in sorted(by_year):
        year_docs = sorted(by_year[year], key=lambda d: d["round"])
        rows = []
        practice_by_round = {}
        event_by_round = {d["round"]: d["eventName"] for d in year_docs}
        for d in year_docs:
            rows.extend(to_training_rows(d))
            practice_by_round[d["round"]] = d.get("practice")

        for round_result in pole_chronological_backtest(rows, practice_by_round):
            all_predicted.extend(round_result["predictedPositions"])
            all_actual.extend(round_result["actualPositions"])
            per_race.append(
                {
                    "season": year,
                    "round": round_result["round"],
                    "eventName": event_by_round[round_result["round"]],
                    "mae": round(round_result["mae"], 3),
                    "naiveMae": round(round_result["naiveMae"], 3),
                    "spearman": round(round_result["spearman"], 3) if round_result["spearman"] is not None else None,
                    "p1Hit": round_result["p1Hit"],
                    "top3Overlap": round_result["top3Overlap"],
                    "top5Overlap": round_result["top5Overlap"],
                }
            )

    if not per_race:
        raise SystemExit("No evaluable rounds found — nothing to benchmark.")

    race_level_spearman = [r["spearman"] for r in per_race if r["spearman"] is not None]
    pooled_rho, _ = spearmanr(all_predicted, all_actual)

    aggregate = {
        "mae": round(mean(r["mae"] for r in per_race), 3),
        "naiveMae": round(mean(r["naiveMae"] for r in per_race), 3),
        "spearman": round(mean(race_level_spearman), 3) if race_level_spearman else None,
        "pooledSpearman": round(float(pooled_rho), 3),
        "p1HitRate": round(mean(1.0 if r["p1Hit"] else 0.0 for r in per_race), 3),
        "top3Overlap": round(mean(r["top3Overlap"] for r in per_race), 2),
        "top5Overlap": round(mean(r["top5Overlap"] for r in per_race), 2),
        "evaluatedRounds": len(per_race),
        "seasons": sorted({r["season"] for r in per_race}),
    }

    db.collection("modelBenchmarks").document(MODEL_VERSION).set(
        {
            "modelVersion": MODEL_VERSION,
            "evaluatedAt": datetime.now(timezone.utc).isoformat(),
            "aggregate": aggregate,
            "perRace": per_race,
        }
    )

    print(f"Benchmark for {MODEL_VERSION}:")
    for key, value in aggregate.items():
        print(f"  {key}: {value}")
    print(f"Wrote modelBenchmarks/{MODEL_VERSION} ({len(per_race)} per-race records).")


if __name__ == "__main__":
    main()
