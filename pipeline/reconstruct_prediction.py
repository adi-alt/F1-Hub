"""One-off, by-hand backfill for a single race whose `prediction` was never frozen live - never
part of the automated 15-minute pipeline (fetch-races.yml calls fetch_races.py and
train_predict.py, never this).

Why this needs to exist at all: train_predict.py computes `prediction` exactly once, the first run
where a race has qualifying data, at least one same-season completed race to train on, and
`status != 'completed'` - see its own module docstring. If a race's `status` flips to `completed`
before that window is ever reached, no run of train_predict.py will EVER compute a prediction for
it afterwards; that branch is simply unreachable for a completed race, by design (so a real,
already-known outcome can never sneak into what's supposed to be a blind pre-race call). This
happened for real to 2026 round 14: a wrong-meeting bug in the OpenF1 fallback (see
pipeline/OPENF1_FALLBACK.md) marked it "completed" using another Grand Prix's already-published
result, sometime in the qualifying-to-race-day window before a real prediction was ever frozen -
that root cause is now fixed, but round 14 itself is left with a real qualifying grid, a real
season's worth of training history, and no prediction to compare against its real result.

What this produces is NOT a live, blind prediction - it is a reconstruction, run after the fact,
that uses only the inputs a live run *would* have had at the time (this season's completed rounds
strictly before the target, cross-season DNF/tyre history the same way, this race's own real
qualifying grid) and the exact same model code train_predict.py calls. It is written with
`source: "reconstructed"` (see RacePrediction's own comment in src/lib/types/race.ts), which the
frontend renders with an explicit "Reconstructed" badge (PredictionComparison.tsx) rather than
showing it identically to a genuine frozen call - and which any future season-wide accuracy
aggregation must filter out for the same reason a live run would never have had this race to train
on.

Guardrails, all fatal (no partial/forced writes without saying so):
  - Refuses a race that isn't `completed` - reconstruction only makes sense after the fact.
  - Refuses a race that already has a `prediction` - never overwrites a real frozen call, and
    never silently re-reconstructs; pass --force to redo an existing reconstruction deliberately.
  - Refuses a race with no qualifying grid at all - nothing real to reconstruct from.

Run:
  export DATABASE_URL='<the pooled connection string, see .env.local>'
  python pipeline/reconstruct_prediction.py 2026 14
  python pipeline/reconstruct_prediction.py 2026 14 --force   # redo an existing reconstruction
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone

from ergast_utils import init_postgres, trigger_revalidation
from ml.predict_finish import chronological_backtest, predict_finish_order
from ml.predict_finish import MODEL_VERSION as FINISH_MODEL_VERSION
from ml.predict_pace import predict_pace_gaps
from ml.tyre_features import build_tyre_trait_history, current_tyre_traits
from train_predict import load_race_docs, to_pace_rows, to_training_rows, to_tyre_rows, update_race


def reconstruct(cur, year: int, round_num: int, force: bool = False) -> None:
    docs_this_race = load_race_docs(cur, "year = %s and round = %s", (year, round_num))
    if not docs_this_race:
        raise SystemExit(f"no race found for {year} round {round_num}")
    target = docs_this_race[0]
    race_id = target["id"]

    if target["status"] != "completed":
        raise SystemExit(f"{race_id}: status is {target['status']!r}, not 'completed' - nothing to reconstruct yet, let train_predict.py freeze this live")
    if target.get("prediction") and not force:
        raise SystemExit(f"{race_id}: already has a prediction (pass --force to replace it deliberately)")
    qualifying = target.get("qualifying")
    if not qualifying or not qualifying.get("grid"):
        raise SystemExit(f"{race_id}: no qualifying grid on record - nothing real to reconstruct a prediction from")

    # Every completed race, any year - then cut at exactly the (year, round) boundary a live run
    # would have had: strictly-earlier rounds this season, any round in a strictly-earlier season.
    # This is the one step that matters most here - without it, "all completed races" today would
    # silently include the target race's OWN now-known result, which is precisely the hindsight
    # leakage train_predict.py's freeze-once design exists to prevent.
    all_completed = load_race_docs(cur, "status = 'completed'", ())
    before = [d for d in all_completed if (d["year"], d["round"]) < (year, round_num)]
    if not before:
        raise SystemExit(f"{race_id}: no completed race exists before it (of any season) - nothing to train on")
    this_season_before = [d for d in before if d["year"] == year]
    if not this_season_before:
        raise SystemExit(f"{race_id}: no same-season completed race before round {round_num} - a live run would have had nothing to train on either")

    all_tyre_rows = [row for d in before for row in to_tyre_rows(d)]
    trait_history = build_tyre_trait_history(all_tyre_rows)
    driver_tyre_traits, team_tyre_traits, tyre_global = current_tyre_traits(all_tyre_rows)

    training_rows = [row for d in this_season_before for row in to_training_rows(d)]
    pace_rows = [row for d in this_season_before for row in to_pace_rows(d, trait_history)]

    inputs = [
        {
            "driver": q["driver"],
            "team": q["team"],
            "grid": q["gridPosition"],
            "qualifyingGapSec": q["qualifyingGapSec"],
            "driverTyrePaceDelta": driver_tyre_traits.get(q["driver"], {}).get("driverTyrePaceDelta", tyre_global["pace"]),
            "driverTyreDegradation": driver_tyre_traits.get(q["driver"], {}).get("driverTyreDegradation", tyre_global["degradation"]),
            "teamTyrePaceDelta": team_tyre_traits.get(q["team"], {}).get("teamTyrePaceDelta", tyre_global["pace"]),
            "teamTyreDegradation": team_tyre_traits.get(q["team"], {}).get("teamTyreDegradation", tyre_global["degradation"]),
        }
        for q in qualifying["grid"]
    ]

    finish = predict_finish_order(training_rows, inputs)
    prediction = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "modelVersion": FINISH_MODEL_VERSION,
        "finishOrder": finish["order"],
        "finishFeatureImportance": finish["featureImportance"],
        "predictedPaceGapSec": predict_pace_gaps(pace_rows, inputs),
        "backtest": chronological_backtest(training_rows),
        "source": "reconstructed",
    }
    update_race(cur, race_id, {"prediction": prediction})
    print(
        f"{race_id}: reconstructed prediction written ({len(training_rows)} training rows from "
        f"{len(this_season_before)} same-season race(s) before it) - predicted winner "
        f"{finish['order'][0]['driver'] if finish['order'] else '?'}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("year", type=int)
    parser.add_argument("round", type=int)
    parser.add_argument("--force", action="store_true", help="replace an existing prediction (real or already-reconstructed)")
    args = parser.parse_args()

    print(
        "This writes a RECONSTRUCTED prediction (source: 'reconstructed'), computed after the "
        "fact from this race's real pre-race inputs - not a genuine live blind call. See this "
        "script's own module docstring before running it on a race you haven't confirmed missed "
        "its live freeze window for a real reason."
    )
    conn = init_postgres()
    try:
        with conn.cursor() as cur:
            reconstruct(cur, args.year, args.round, force=args.force)
    finally:
        conn.close()
    trigger_revalidation("races")


if __name__ == "__main__":
    main()
