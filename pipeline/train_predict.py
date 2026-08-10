"""Trains and freezes predictions once qualifying data exists for a race — a separate pass from
fetch_races.py (which owns qualifying/race/weather/tire data), writing only `prediction`/
`polePrediction` via partial update, never touching anything fetch_races.py owns. That separation
matters for the same reason the safe-merge fix in fetch_races.py did: two things writing to one
document must never be able to clobber each other's fields.

Freeze rules, ported unchanged from the deleted refreshSeason.ts:
  - A pole prediction stays "live" (recomputed every run, using only same-season prior rounds)
    until this weekend's own qualifying happens — at that point it freezes permanently, since
    there's nothing left to guess about pole once the real grid exists.
  - A finish-order prediction is computed exactly once, the first run after qualifying exists and
    there's at least one same-season completed race to train on, then never recomputed — so
    accuracy tracking against the eventual result is never retroactively flattering.

Run:
  python pipeline/train_predict.py            # current year
  python pipeline/train_predict.py 2026        # explicit year
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore

from ml.features import TrainingResultRow
from ml.pace_features import PaceResultRow
from ml.predict_finish import MODEL_VERSION as FINISH_MODEL_VERSION
from ml.predict_finish import chronological_backtest, predict_finish_order
from ml.predict_pace import predict_pace_gaps
from ml.predict_pole import MODEL_VERSION as POLE_MODEL_VERSION
from ml.predict_pole import predict_pole_order


def init_firestore():
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise SystemExit("FIREBASE_SERVICE_ACCOUNT_JSON is not set.")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(json.loads(raw)))
    return firestore.client()


def _quali_lookup(qualifying: dict | None) -> dict[str, dict]:
    """Maps driver -> quali entry, with a fallback gap for two distinct cases that both produce
    the same missing-data problem: a driver who raced but isn't in the grid at all (never set a
    time — e.g. 3 drivers in 2026 Australia), and a driver who *is* in the grid with a real
    position but a null gap specifically (classified with no representative lap — e.g. round 4
    2026, HAD). Mirrors the old scraper's convention either way: worse than the worst real gap,
    rather than leaving it null and breaking every model that reads it. Fallback quali position
    ("last") only applies to the first case — the second already has a real position.
    """
    grid = (qualifying or {}).get("grid", [])
    lookup = {q["driver"]: q for q in grid}
    gaps = [q["qualifyingGapSec"] for q in grid if q["qualifyingGapSec"] is not None]
    fallback_gap = max(gaps) + 1 if gaps else 0.0
    fallback_position = len(grid) + 1

    def get(driver: str) -> dict:
        entry = lookup.get(driver)
        if entry is None:
            return {"qualifyingGapSec": fallback_gap, "gridPosition": fallback_position}
        return {
            "qualifyingGapSec": entry["qualifyingGapSec"] if entry["qualifyingGapSec"] is not None else fallback_gap,
            "gridPosition": entry["gridPosition"],
        }

    return {"get": get}


def to_training_rows(race_doc: dict) -> list[TrainingResultRow]:
    """One row per driver for a completed race, joining race results with that weekend's own
    qualifying grid — results don't carry qualifyingGapSec/qualiPosition directly."""
    quali = _quali_lookup(race_doc.get("qualifying"))
    rows = []
    for r in race_doc["race"]["results"]:
        q = quali["get"](r["driver"])
        rows.append(
            TrainingResultRow(
                round=race_doc["round"],
                driver=r["driver"],
                team=r["team"],
                grid=r["gridPosition"],
                qualifying_gap_sec=q["qualifyingGapSec"],
                finish_position=r["finishPosition"],
                quali_position=q["gridPosition"],
            )
        )
    return rows


def to_pace_rows(race_doc: dict) -> list[PaceResultRow]:
    """DNF drivers are excluded: their "fastest lap" is whatever they set in the handful of laps
    before retiring, not a measurement of race pace — verified on the real backtest that including
    them roughly halves the model's edge over a naive baseline (DNFs are ~15% of all results,
    enough to matter, not a rounding error). Rows with no representative qualifying gap or
    fastest lap are dropped too — nothing for the pace model to learn from or predict against."""
    quali = _quali_lookup(race_doc.get("qualifying"))
    rows = []
    for r in race_doc["race"]["results"]:
        if r["status"] == "dnf" or r["fastestLapSec"] is None:
            continue
        q = quali["get"](r["driver"])
        if q["qualifyingGapSec"] is None:
            continue
        rows.append(
            PaceResultRow(
                round=race_doc["round"],
                driver=r["driver"],
                team=r["team"],
                grid=q["gridPosition"],
                qualifying_gap_sec=q["qualifyingGapSec"],
                fastest_lap_sec=r["fastestLapSec"],
            )
        )
    return rows


def derive_entrants(completed_docs: list[dict]) -> list[dict]:
    """Who's racing this weekend isn't published ahead of qualifying — the most recent completed
    race's driver/team lineup stands in, same assumption the deleted refreshSeason.ts made."""
    if not completed_docs:
        return []
    most_recent = completed_docs[-1]
    return [{"driver": r["driver"], "team": r["team"]} for r in most_recent["race"]["results"]]


def build_pole_prediction(
    training_rows: list[TrainingResultRow],
    entrants: list[dict],
    practice_by_round: dict[int, dict | None],
    current_practice: dict | None,
) -> dict | None:
    if not entrants:
        return None
    pole = predict_pole_order(training_rows, entrants, practice_by_round, current_practice)
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "modelVersion": POLE_MODEL_VERSION,
        "order": pole["order"],
        "featureImportance": pole["featureImportance"],
    }


def process_year(db, year: int):
    docs = list(db.collection("races").where("year", "==", year).order_by("round").stream())
    training_rows: list[TrainingResultRow] = []
    pace_rows: list[PaceResultRow] = []
    completed_docs: list[dict] = []
    practice_by_round: dict[int, dict | None] = {}

    for doc in docs:
        data = doc.to_dict()
        round_num = data["round"]

        if data.get("status") == "completed":
            # Whatever prediction/polePrediction this race already has (frozen while it was still
            # upcoming) is left exactly as-is — this is what makes later accuracy comparisons
            # honest, not retroactively flattering.
            training_rows.extend(to_training_rows(data))
            pace_rows.extend(to_pace_rows(data))
            completed_docs.append(data)
            practice_by_round[round_num] = data.get("practice")
            print(f"  round {round_num}: completed, added to training history ({len(training_rows)} rows so far)")
            continue

        qualifying = data.get("qualifying")
        entrants = derive_entrants(completed_docs)
        current_practice = data.get("practice")

        if not qualifying:
            pole_prediction = build_pole_prediction(training_rows, entrants, practice_by_round, current_practice)
            if pole_prediction:
                doc.reference.update({"polePrediction": pole_prediction})
                print(f"  round {round_num}: polePrediction updated (live, {len(training_rows)} training rows)")
            else:
                print(f"  round {round_num}: no history yet, nothing to predict")
            continue

        # Qualifying just became available (or already was) — freeze whatever pole prediction
        # exists right now; from this point there's nothing left to guess about pole.
        pole_prediction = data.get("polePrediction") or build_pole_prediction(
            training_rows, entrants, practice_by_round, current_practice
        )

        if data.get("prediction"):
            print(f"  round {round_num}: prediction already frozen, leaving it alone")
            continue

        update: dict = {}
        if pole_prediction and not data.get("polePrediction"):
            update["polePrediction"] = pole_prediction

        if not training_rows:
            # Season's first race, before it's run — nothing to train the finish model on yet.
            if update:
                doc.reference.update(update)
            print(f"  round {round_num}: no same-season history yet, skipping finish prediction")
            continue

        inputs = [
            {
                "driver": q["driver"],
                "team": q["team"],
                "grid": q["gridPosition"],
                "qualifyingGapSec": q["qualifyingGapSec"],
            }
            for q in qualifying["grid"]
        ]
        finish = predict_finish_order(training_rows, inputs)

        update["prediction"] = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "modelVersion": FINISH_MODEL_VERSION,
            "finishOrder": finish["order"],
            "finishFeatureImportance": finish["featureImportance"],
            "predictedPaceGapSec": predict_pace_gaps(pace_rows, inputs),
            "backtest": chronological_backtest(training_rows),
        }
        doc.reference.update(update)
        print(f"  round {round_num}: prediction frozen ({len(training_rows)} training rows)")


def main():
    year = int(sys.argv[1]) if len(sys.argv) > 1 else datetime.now().year
    db = init_firestore()
    print(f"Training/predicting for {year}...")
    process_year(db, year)
    print("Done.")


if __name__ == "__main__":
    main()
