"""Computes and freezes the Monte Carlo simulator's benchmark (Pace + DNF + simulate_race +
walk-forward calibration) in Firestore (`modelBenchmarks/{modelVersion}`) and a local
reproducibility manifest (`benchmarks/simulator/{modelVersion}.json`).

This is the first *permanent* simulator benchmark harness — previous validations (v1, v1.1, v1.2,
the Step-5 tyre-vs-simulator comparison) all lived in one-off scripts that were deleted after use,
which is exactly the pattern that made the Pace model's original benchmark unreconcilable later.
Any future simulator hypothesis should be evaluated by running a modified copy of this script
against the current frozen number — never by overwriting it. Bump MODEL_VERSION below if the
simulator's mechanics change (this file currently reflects `simulator-v2`, ml/simulate_race.py's
correlated race/team/individual noise decomposition — see that module's docstring).

Run:
  python pipeline/evaluate_simulator_benchmark.py
"""

from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

import firebase_admin
import numpy as np
from firebase_admin import credentials, firestore
from scipy.stats import spearmanr

from ml.calibrate_probabilities import (
    apply_p1_calibrator,
    apply_podium_calibrator,
    fit_p1_calibrator,
    fit_podium_calibrator,
)
from ml.pace_features import PaceResultRow
from ml.predict_dnf import predict_dnf_probabilities
from ml.predict_pace import predict_pace_gaps
from ml.simulate_race import (
    GLOBAL_SC_RATE,
    GRID_NOISE_BUCKETS,
    INDIVIDUAL_FRACTION,
    RACE_SHOCK_FRACTION,
    TEAM_SHOCK_FRACTION,
    simulate_race,
)
from ml.tyre_features import build_tyre_trait_history, current_tyre_traits
from train_predict import _quali_lookup, to_dnf_rows, to_pace_rows, to_tyre_rows

MODEL_VERSION = "simulator-v2"
DNF_WARMUP_ROWS = 50
N_SIMULATIONS = 10_000
WARMUP_ROUNDS_PER_SEASON = 8  # Step 4/4.1/4.2's own validations used this; kept for continuity.


def init_firestore():
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise SystemExit("FIREBASE_SERVICE_ACCOUNT_JSON is not set.")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(json.loads(raw)))
    return firestore.client()


def _git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=Path(__file__).resolve().parent, stderr=subprocess.DEVNULL
        ).decode().strip()
    except Exception:
        return "unknown"


def main():
    db = init_firestore()
    docs = [d.to_dict() for d in db.collection("races").where("status", "==", "completed").stream()]
    docs.sort(key=lambda d: (d["year"], d["round"]))
    print(f"{len(docs)} completed races")

    all_tyre_rows = []
    dnf_rows = []
    pace_rows_by_year: dict[int, list[PaceResultRow]] = {}
    race_meta: dict[tuple[int, int], dict] = {}

    for data in docs:
        year, round_num = data["year"], data["round"]
        quali = _quali_lookup(data.get("qualifying"))
        results = data["race"]["results"]

        entrants, actual_finish = [], {}
        for r in results:
            q = quali["get"](r["driver"])
            entrants.append(
                {
                    "driver": r["driver"], "team": r["team"], "grid": r["gridPosition"] or 20,
                    "qualifyingGapSec": q["qualifyingGapSec"] if q["qualifyingGapSec"] is not None else 2.0,
                }
            )
            actual_finish[r["driver"]] = r["finishPosition"]
        race_meta[(year, round_num)] = {"entrants": entrants, "actual_finish": actual_finish}

        dnf_rows.extend(to_dnf_rows(data))
        all_tyre_rows.extend(to_tyre_rows(data))
        pace_rows_by_year.setdefault(year, []).extend(to_pace_rows(data, {}))

    trait_history = build_tyre_trait_history(all_tyre_rows)

    def fill_tyre_traits(rows: list[PaceResultRow], year: int) -> list[PaceResultRow]:
        out = []
        for r in rows:
            t = trait_history.get(
                (year, r.round, r.driver),
                {"driverTyrePaceDelta": 3.0, "driverTyreDegradation": 0.0, "teamTyrePaceDelta": 3.0, "teamTyreDegradation": 0.0},
            )
            out.append(
                PaceResultRow(
                    round=r.round, driver=r.driver, team=r.team, grid=r.grid,
                    qualifying_gap_sec=r.qualifying_gap_sec, fastest_lap_sec=r.fastest_lap_sec,
                    driver_tyre_pace_delta=t["driverTyrePaceDelta"], driver_tyre_degradation=t["driverTyreDegradation"],
                    team_tyre_pace_delta=t["teamTyrePaceDelta"], team_tyre_degradation=t["teamTyreDegradation"],
                )
            )
        return out

    per_race = []
    raw_p1_pool, raw_p1_actual_pool = [], []
    raw_podium_pool, raw_podium_actual_pool = [], []
    cal_p1_brier, cal_podium_brier = [], []
    raw_p1_brier, raw_podium_brier = [], []
    all_mae, all_spearman = [], []

    for year, rows in sorted(pace_rows_by_year.items()):
        rounds = sorted({r.round for r in rows})
        for idx, rnd in enumerate(rounds):
            if idx < WARMUP_ROUNDS_PER_SEASON:
                continue
            prior_pace = [r for r in rows if r.round < rnd]
            if len(prior_pace) < 10:
                continue
            prior_pace = fill_tyre_traits(prior_pace, year)

            prior_dnf = [r for r in dnf_rows if (r.year, r.round) < (year, rnd)]
            if len(prior_dnf) < DNF_WARMUP_ROWS or len({r.dnf for r in prior_dnf}) < 2:
                continue

            meta = race_meta[(year, rnd)]
            entrants, actual_finish = meta["entrants"], meta["actual_finish"]
            prior_tyre = [r for r in all_tyre_rows if (r.year, r.round) < (year, rnd)]
            driver_traits, team_traits, global_defaults = current_tyre_traits(prior_tyre)
            inputs = [
                {
                    "driver": e["driver"], "team": e["team"], "grid": e["grid"], "qualifyingGapSec": e["qualifyingGapSec"],
                    "driverTyrePaceDelta": driver_traits.get(e["driver"], {}).get("driverTyrePaceDelta", global_defaults["pace"]),
                    "driverTyreDegradation": driver_traits.get(e["driver"], {}).get("driverTyreDegradation", global_defaults["degradation"]),
                    "teamTyrePaceDelta": team_traits.get(e["team"], {}).get("teamTyrePaceDelta", global_defaults["pace"]),
                    "teamTyreDegradation": team_traits.get(e["team"], {}).get("teamTyreDegradation", global_defaults["degradation"]),
                }
                for e in entrants
            ]

            dnf_probs = predict_dnf_probabilities(prior_dnf, inputs)
            pace = predict_pace_gaps(prior_pace, inputs)
            sim = simulate_race(entrants, pace, dnf_probs, n_simulations=N_SIMULATIONS)

            p1_model = fit_p1_calibrator(raw_p1_pool, raw_p1_actual_pool)
            podium_model = fit_podium_calibrator(raw_podium_pool, raw_podium_actual_pool)

            drivers = [e["driver"] for e in entrants]
            raw_p1s = [sim[d]["p1"] for d in drivers]
            raw_podiums = [sim[d]["podium"] for d in drivers]
            cal_p1s = apply_p1_calibrator(p1_model, raw_p1s)
            cal_podiums = apply_podium_calibrator(podium_model, raw_podiums)

            preds, actuals = [], []
            for i, d in enumerate(drivers):
                actual_pos = actual_finish[d]
                preds.append(sim[d]["medianPosition"])
                actuals.append(actual_pos)
                actual_p1 = 1 if actual_pos == 1 else 0
                actual_podium = 1 if actual_pos <= 3 else 0
                raw_p1_brier.append((raw_p1s[i] - actual_p1) ** 2)
                raw_podium_brier.append((raw_podiums[i] - actual_podium) ** 2)
                cal_p1_brier.append((cal_p1s[i] - actual_p1) ** 2)
                cal_podium_brier.append((cal_podiums[i] - actual_podium) ** 2)
                raw_p1_pool.append(raw_p1s[i])
                raw_p1_actual_pool.append(actual_p1)
                raw_podium_pool.append(raw_podiums[i])
                raw_podium_actual_pool.append(actual_podium)

            all_mae.extend(abs(p - a) for p, a in zip(preds, actuals))
            if len(preds) >= 3:
                rho = spearmanr(preds, actuals).correlation
                if rho is not None and not np.isnan(rho):
                    all_spearman.append(rho)
            per_race.append({"season": year, "round": rnd, "n": len(drivers)})

    if not per_race:
        raise SystemExit("No evaluable rounds found — nothing to benchmark.")

    aggregate = {
        "mae": round(mean(all_mae), 3),
        "spearman": round(mean(all_spearman), 3),
        "rawP1Brier": round(mean(raw_p1_brier), 4),
        "rawPodiumBrier": round(mean(raw_podium_brier), 4),
        "calibratedP1Brier": round(mean(cal_p1_brier), 4),
        "calibratedPodiumBrier": round(mean(cal_podium_brier), 4),
        "evaluatedRounds": len(per_race),
        "totalDriverRows": len(all_mae),
        "seasons": sorted({r["season"] for r in per_race}),
    }

    evaluated_at = datetime.now(timezone.utc).isoformat()
    db.collection("modelBenchmarks").document(MODEL_VERSION).set(
        {"modelVersion": MODEL_VERSION, "evaluatedAt": evaluated_at, "aggregate": aggregate}
    )

    manifest = {
        "model": "simulator",
        "version": MODEL_VERSION,
        "gitCommit": _git_commit(),
        "evaluatedAt": evaluated_at,
        "evaluationPopulation": f"{aggregate['seasons'][0]}-{aggregate['seasons'][-1]}",
        "raceCount": aggregate["evaluatedRounds"],
        "warmupRule": (
            f"first {WARMUP_ROUNDS_PER_SEASON} rounds of each season skipped, plus prior-pace "
            f">=10 rows and prior-dnf >={DNF_WARMUP_ROWS} rows with both classes present"
        ),
        "walkForward": True,
        "components": {
            "pace": "ml.predict_pace.predict_pace_gaps (sklearn-rf-v3-pace-tyre)",
            "dnf": "ml.predict_dnf.predict_dnf_probabilities (sklearn-rf-v1-dnf)",
            "simulate": (
                "ml.simulate_race.simulate_race (grid-bucketed total stdev, split into correlated "
                "race-shared/team-shared/individual components, n_simulations=%d)" % N_SIMULATIONS
            ),
            "calibration": "ml.calibrate_probabilities (Platt for P1, isotonic for podium, walk-forward fit)",
        },
        "gridNoiseBuckets": GRID_NOISE_BUCKETS,
        "noiseVarianceFractions": {
            "raceShock": RACE_SHOCK_FRACTION,
            "teamShock": TEAM_SHOCK_FRACTION,
            "individual": INDIVIDUAL_FRACTION,
        },
        "safetyCarRate": GLOBAL_SC_RATE,
        "randomSeed": 42,
        "firestoreDoc": f"modelBenchmarks/{MODEL_VERSION}",
        "metrics": aggregate,
    }
    manifest_path = Path(__file__).resolve().parent / "benchmarks" / "simulator" / f"{MODEL_VERSION}.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"Benchmark for {MODEL_VERSION}:")
    for key, value in aggregate.items():
        print(f"  {key}: {value}")
    print(f"Wrote modelBenchmarks/{MODEL_VERSION} and {manifest_path}")


if __name__ == "__main__":
    main()
