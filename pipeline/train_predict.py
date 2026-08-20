"""Trains and freezes predictions once qualifying data exists for a race — a separate pass from
fetch_races.py (which owns qualifying/race/weather/tire data), writing only `prediction`/
`pole_prediction`/`simulation` via partial UPDATE, never touching anything fetch_races.py owns.
That separation matters for the same reason the safe-merge fix in fetch_races.py did: two things
writing to one row must never be able to clobber each other's columns.

Freeze rules, ported unchanged from the deleted refreshSeason.ts:
  - A pole prediction stays "live" (recomputed every run, using only same-season prior rounds)
    until this weekend's own qualifying happens — at that point it freezes permanently, since
    there's nothing left to guess about pole once the real grid exists.
  - A finish-order prediction is computed exactly once, the first run after qualifying exists and
    there's at least one same-season completed race to train on, then never recomputed — so
    accuracy tracking against the eventual result is never retroactively flattering.

Run:
  export DATABASE_URL='<the pooled connection string, see .env.local>'
  python pipeline/train_predict.py            # current year
  python pipeline/train_predict.py 2026        # explicit year
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone

from ergast_utils import init_postgres, trigger_revalidation
from ml.calibrate_probabilities import (
    apply_p1_calibrator,
    apply_podium_calibrator,
    fit_p1_calibrator,
    fit_podium_calibrator,
)
from ml.features import TrainingResultRow
from ml.pace_features import PaceResultRow
from ml.predict_dnf import DnfResultRow, predict_dnf_probabilities
from ml.predict_finish import MODEL_VERSION as FINISH_MODEL_VERSION
from ml.predict_finish import chronological_backtest, predict_finish_order
from ml.predict_pace import predict_pace_gaps
from ml.predict_pole import MODEL_VERSION as POLE_MODEL_VERSION
from ml.predict_pole import predict_pole_order
from ml.simulate_race import simulate_race
from ml.tyre_features import (
    GLOBAL_DEGRADATION_DEFAULT,
    GLOBAL_PACE_DELTA_DEFAULT,
    TyreRaceRow,
    build_tyre_race_row,
    build_tyre_trait_history,
    current_tyre_traits,
)

SIMULATION_MODEL_VERSION = "simulator-v2"
DNF_WARMUP_ROWS = 50

# Firestore-shaped key -> real races column, used only by update_race() below — every read/
# transform function in this module still speaks the old camelCase doc shape (`prediction`,
# `polePrediction`, `simulation`), so only the one place that writes needs to know the column names.
_COLUMNS = {"prediction": "prediction", "polePrediction": "pole_prediction", "simulation": "simulation"}


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


def to_dnf_rows(race_doc: dict) -> list[DnfResultRow]:
    """One row per driver, unfiltered — unlike to_pace_rows, predict_dnf.py's target literally *is*
    the dnf flag, so DNF rows are exactly what it needs, not something to exclude. Needs year,
    unlike TrainingResultRow/PaceResultRow, since ml/predict_dnf.py's history is cross-season."""
    quali = _quali_lookup(race_doc.get("qualifying"))
    year, round_num = race_doc["year"], race_doc["round"]
    rows = []
    for r in race_doc["race"]["results"]:
        q = quali["get"](r["driver"])
        rows.append(
            DnfResultRow(
                year=year,
                round=round_num,
                driver=r["driver"],
                team=r["team"],
                grid=r["gridPosition"] if r["gridPosition"] is not None else 20,
                qualifying_gap_sec=q["qualifyingGapSec"] if q["qualifyingGapSec"] is not None else 2.0,
                dnf=1 if r["status"] == "dnf" else 0,
            )
        )
    return rows


def to_tyre_rows(race_doc: dict) -> list[TyreRaceRow]:
    """One row per driver who has real tireCompoundPace data for this race — independent of DNF
    status, unlike to_pace_rows below: a driver's clean laps before retiring are still a real
    observation of their tyre management, even though their "fastest lap" isn't a valid race-pace
    measurement."""
    tcp = (race_doc.get("race") or {}).get("tireCompoundPace") or []
    rows = []
    for r in race_doc["race"]["results"]:
        row = build_tyre_race_row(race_doc["year"], race_doc["round"], r["driver"], r["team"], tcp)
        if row:
            rows.append(row)
    return rows


def to_pace_rows(race_doc: dict, trait_history: dict) -> list[PaceResultRow]:
    """DNF drivers are excluded: their "fastest lap" is whatever they set in the handful of laps
    before retiring, not a measurement of race pace — verified on the real backtest that including
    them roughly halves the model's edge over a naive baseline (DNFs are ~15% of all results,
    enough to matter, not a rounding error). Rows with no representative qualifying gap or
    fastest lap are dropped too — nothing for the pace model to learn from or predict against.

    `trait_history`: (year, round, driver) -> tyre trait dict, built once across every completed
    race regardless of season (see ml/tyre_features.py) — cross-season, unlike the Elo features
    computed later from just this row's season.
    """
    quali = _quali_lookup(race_doc.get("qualifying"))
    year, round_num = race_doc["year"], race_doc["round"]
    rows = []
    for r in race_doc["race"]["results"]:
        if r["status"] == "dnf" or r["fastestLapSec"] is None:
            continue
        q = quali["get"](r["driver"])
        if q["qualifyingGapSec"] is None:
            continue
        trait = trait_history.get(
            (year, round_num, r["driver"]),
            {
                "driverTyrePaceDelta": GLOBAL_PACE_DELTA_DEFAULT,
                "driverTyreDegradation": GLOBAL_DEGRADATION_DEFAULT,
                "teamTyrePaceDelta": GLOBAL_PACE_DELTA_DEFAULT,
                "teamTyreDegradation": GLOBAL_DEGRADATION_DEFAULT,
            },
        )
        rows.append(
            PaceResultRow(
                round=round_num,
                driver=r["driver"],
                team=r["team"],
                grid=q["gridPosition"],
                qualifying_gap_sec=q["qualifyingGapSec"],
                fastest_lap_sec=r["fastestLapSec"],
                driver_tyre_pace_delta=trait["driverTyrePaceDelta"],
                driver_tyre_degradation=trait["driverTyreDegradation"],
                team_tyre_pace_delta=trait["teamTyrePaceDelta"],
                team_tyre_degradation=trait["teamTyreDegradation"],
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


def build_simulation_calibration_pool(all_completed_docs: list[dict]) -> tuple[list, list, list, list]:
    """Walk-forward calibration pool: (year, round) ascending, drawing only from races that
    already have a frozen `simulation` — reading the raw probabilities *already stored* on each
    past race, never resimulating them. Leakage-safe by construction: a race's own outcome is
    never in the pool used to calibrate its own probabilities, since a race is only added here
    after it's completed."""
    ordered = sorted(
        (d for d in all_completed_docs if d.get("simulation")),
        key=lambda d: (d["year"], d["round"]),
    )
    p1_probs, p1_actuals, podium_probs, podium_actuals = [], [], [], []
    for d in ordered:
        actual_by_driver = {r["driver"]: r["finishPosition"] for r in d["race"]["results"]}
        for row in d["simulation"]["drivers"]:
            actual_pos = actual_by_driver.get(row["driver"])
            if actual_pos is None:
                continue
            p1_probs.append(row["p1Raw"])
            p1_actuals.append(1 if actual_pos == 1 else 0)
            podium_probs.append(row["podiumRaw"])
            podium_actuals.append(1 if actual_pos <= 3 else 0)
    return p1_probs, p1_actuals, podium_probs, podium_actuals


def compute_race_simulation(
    entrants: list[dict],
    prior_pace_rows: list[PaceResultRow],
    prior_dnf_rows: list[DnfResultRow],
    calibration_pool: tuple[list, list, list, list],
) -> dict:
    """entrants: [{"driver","team","grid","qualifyingGapSec", 4 tyre-trait keys}, ...] — same shape
    `inputs` already takes for predict_pace_gaps/predict_finish_order. `prior_pace_rows`/
    `prior_dnf_rows` must already be leakage-safe (strictly prior to the race being computed) —
    this function trusts the caller, same convention as predict_pace_gaps/predict_dnf_probabilities
    themselves. Returns the dict stored verbatim as the `simulation` field.
    """
    p1_probs, p1_actuals, podium_probs, podium_actuals = calibration_pool
    dnf_probs = predict_dnf_probabilities(prior_dnf_rows, entrants)
    pace = predict_pace_gaps(prior_pace_rows, entrants)
    sim = simulate_race(entrants, pace, dnf_probs)

    p1_model = fit_p1_calibrator(p1_probs, p1_actuals)
    podium_model = fit_podium_calibrator(podium_probs, podium_actuals)
    drivers = [e["driver"] for e in entrants]
    raw_p1s = [sim[d]["p1"] for d in drivers]
    raw_podiums = [sim[d]["podium"] for d in drivers]
    cal_p1s = apply_p1_calibrator(p1_model, raw_p1s)
    cal_podiums = apply_podium_calibrator(podium_model, raw_podiums)

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "modelVersion": SIMULATION_MODEL_VERSION,
        "drivers": [
            {
                "driver": e["driver"],
                "team": e["team"],
                "medianPosition": sim[e["driver"]]["medianPosition"],
                "positionProbabilities": sim[e["driver"]]["positionProbabilities"],
                "p1Raw": round(raw_p1s[i], 4),
                "podiumRaw": round(raw_podiums[i], 4),
                "top5": round(sim[e["driver"]]["top5"], 4),
                "p1": round(cal_p1s[i], 4),
                "podium": round(cal_podiums[i], 4),
            }
            for i, e in enumerate(entrants)
        ],
    }


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


def load_race_docs(cur, where_clause: str, params: tuple) -> list[dict]:
    """Reconstructs the Firestore-doc shape ({id, year, round, eventName, status, practice,
    qualifying, race, prediction, polePrediction, simulation}) every function above (and the
    evaluate_*_benchmark.py scripts, which import this directly) was written against, from
    `races` joined against its two real child tables (`race_inputs` = the old qualifying.grid
    array, `race_results` = the old race.results array) — the read-side counterpart of the
    partial UPDATEs update_race() does below. One extra pair of queries per race rather than a
    single join, same tradeoff ergast_utils.fetch_completed_race_docs already made (a season is a
    few dozen races, cross-season history a few hundred — not the volume N+1 would actually hurt).
    Not reused from that adapter directly: this needs qualifying/status/prediction/polePrediction/
    simulation too, fields that one deliberately leaves out since sync_calendar.py never needs them.
    """
    cur.execute(
        f"select id, year, round, name, status, practice, tire_compound_pace, prediction, "
        f"pole_prediction, simulation from races where {where_clause} order by year, round",
        params,
    )
    races = cur.fetchall()
    docs = []
    for race_id, year, round_num, event_name, status, practice, tire_compound_pace, prediction, pole_prediction, simulation in races:
        cur.execute(
            "select driver, driver_name, team, grid, qualifying_gap_sec from race_inputs where race_id = %s",
            (race_id,),
        )
        # `numeric` columns come back from psycopg2 as decimal.Decimal, not float (Postgres has no
        # native IEEE-double column type the way Firestore stored every number) — every ml/*.py
        # function downstream does plain Python arithmetic assuming float (confirmed the hard way:
        # Decimal survives silently through sklearn/numpy, which auto-casts on the way in, but
        # crashes the instant it hits raw Python arithmetic, e.g. predict_pace.py's own MAE calc).
        # Cast at this one read boundary rather than chase it through every consumer.
        grid = [
            {"driver": d, "driverName": dn, "team": t, "gridPosition": g, "qualifyingGapSec": float(qg) if qg is not None else None}
            for d, dn, t, g, qg in cur.fetchall()
        ]
        cur.execute(
            "select driver, driver_name, team, grid, finish_position, status, fastest_lap_sec "
            "from race_results where race_id = %s",
            (race_id,),
        )
        results = [
            {
                "driver": d,
                "driverName": dn,
                "team": t,
                "gridPosition": g,
                "finishPosition": fp,
                "status": st,
                "fastestLapSec": float(fl) if fl is not None else None,
            }
            for d, dn, t, g, fp, st, fl in cur.fetchall()
        ]
        docs.append(
            {
                "id": race_id,
                "year": year,
                "round": round_num,
                "eventName": event_name,
                "status": status,
                "practice": practice,
                "qualifying": {"grid": grid} if grid else None,
                "race": {"results": results, "tireCompoundPace": tire_compound_pace or []} if results else None,
                "prediction": prediction,
                "polePrediction": pole_prediction,
                "simulation": simulation,
            }
        )
    return docs


def update_race(cur, race_id: str, fields: dict) -> None:
    """Partial UPDATE — same convention every other converted pipeline script uses for existing
    rows. Only the passed columns change, mirroring the old Firestore `doc.reference.update({...})`
    partial-write semantics this module depends on throughout: prediction/polePrediction/simulation
    each freeze once written, so a later run must never touch a column it didn't just (re)compute."""
    set_clause = ", ".join(f"{_COLUMNS[k]} = %s" for k in fields)
    values = [json.dumps(v) for v in fields.values()]
    cur.execute(f"update races set {set_clause} where id = %s", (*values, race_id))


def process_year(conn, year: int):
    with conn.cursor() as cur:
        docs = load_race_docs(cur, "year = %s", (year,))

        # Cross-season on purpose (see ml/tyre_features.py) — unlike the season-scoped Elo features
        # below, tyre-management traits are built from every completed race regardless of year, one
        # query, done once per run rather than once per race. `build_tyre_trait_history` is itself a
        # strictly-chronological builder (keyed by (year, round, driver)), so it's leakage-safe to pull
        # from even though `all_completed_docs` spans every season, including ones later than `year`.
        all_completed_docs = load_race_docs(cur, "status = 'completed'", ())
        all_tyre_rows: list[TyreRaceRow] = []
        for completed_doc in all_completed_docs:
            all_tyre_rows.extend(to_tyre_rows(completed_doc))
        trait_history = build_tyre_trait_history(all_tyre_rows)
        driver_tyre_traits, team_tyre_traits, tyre_global = current_tyre_traits(all_tyre_rows)

        # DNF history and the simulation calibration pool are NOT leakage-safe the same easy way —
        # unlike tyre traits, there's no chronological builder doing the filtering internally, so this
        # must explicitly use only strictly-earlier *seasons* (`< year`, not `!= year`: every season
        # 2018-2026 already exists as "completed" in Postgres, this isn't backfilled incrementally
        # over real time). Same-season-so-far rows are threaded through the loop below, exactly like
        # `pace_rows`/`training_rows` already are.
        dnf_rows_other_seasons = [r for d in all_completed_docs if d["year"] < year for r in to_dnf_rows(d)]
        dnf_rows_this_season: list[DnfResultRow] = []
        p1_probs, p1_actuals, podium_probs, podium_actuals = build_simulation_calibration_pool(
            [d for d in all_completed_docs if d["year"] < year]
        )

        training_rows: list[TrainingResultRow] = []
        pace_rows: list[PaceResultRow] = []
        completed_docs: list[dict] = []
        practice_by_round: dict[int, dict | None] = {}

        for data in docs:
            round_num = data["round"]
            race_id = data["id"]

            if data.get("status") == "completed":
                # Whatever prediction/polePrediction this race already has (frozen while it was still
                # upcoming) is left exactly as-is — this is what makes later accuracy comparisons
                # honest, not retroactively flattering. `simulation` is backfilled here the first time
                # any run sees this race lacking it — computed *before* this round's own rows join
                # pace_rows/dnf_rows_this_season/the calibration pool below, so it never leaks into its
                # own inputs.
                if data.get("simulation") is None and len(dnf_rows_other_seasons) + len(dnf_rows_this_season) >= DNF_WARMUP_ROWS:
                    quali = _quali_lookup(data.get("qualifying"))
                    entrants_real = []
                    for r in data["race"]["results"]:
                        q = quali["get"](r["driver"])
                        trait = trait_history.get(
                            (year, round_num, r["driver"]),
                            {
                                "driverTyrePaceDelta": GLOBAL_PACE_DELTA_DEFAULT,
                                "driverTyreDegradation": GLOBAL_DEGRADATION_DEFAULT,
                                "teamTyrePaceDelta": GLOBAL_PACE_DELTA_DEFAULT,
                                "teamTyreDegradation": GLOBAL_DEGRADATION_DEFAULT,
                            },
                        )
                        entrants_real.append(
                            {
                                "driver": r["driver"],
                                "team": r["team"],
                                "grid": r["gridPosition"] or 20,
                                "qualifyingGapSec": q["qualifyingGapSec"] if q["qualifyingGapSec"] is not None else 2.0,
                                **trait,
                            }
                        )
                    simulation = compute_race_simulation(
                        entrants_real,
                        prior_pace_rows=pace_rows,
                        prior_dnf_rows=dnf_rows_other_seasons + dnf_rows_this_season,
                        calibration_pool=(p1_probs, p1_actuals, podium_probs, podium_actuals),
                    )
                    update_race(cur, race_id, {"simulation": simulation})
                    data["simulation"] = simulation
                    print(f"  round {round_num}: simulation backfilled")

                if data.get("simulation"):
                    actual_by_driver = {r["driver"]: r["finishPosition"] for r in data["race"]["results"]}
                    for row in data["simulation"]["drivers"]:
                        actual_pos = actual_by_driver.get(row["driver"])
                        if actual_pos is None:
                            continue
                        p1_probs.append(row["p1Raw"])
                        p1_actuals.append(1 if actual_pos == 1 else 0)
                        podium_probs.append(row["podiumRaw"])
                        podium_actuals.append(1 if actual_pos <= 3 else 0)

                training_rows.extend(to_training_rows(data))
                pace_rows.extend(to_pace_rows(data, trait_history))
                dnf_rows_this_season.extend(to_dnf_rows(data))
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
                    update_race(cur, race_id, {"polePrediction": pole_prediction})
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
                    update_race(cur, race_id, update)
                print(f"  round {round_num}: no same-season history yet, skipping finish prediction")
                continue

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

            update["prediction"] = {
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "modelVersion": FINISH_MODEL_VERSION,
                "finishOrder": finish["order"],
                "finishFeatureImportance": finish["featureImportance"],
                "predictedPaceGapSec": predict_pace_gaps(pace_rows, inputs),
                "backtest": chronological_backtest(training_rows),
            }
            # Same freeze point as `prediction` — qualifying exists, there's same-season history to
            # train on, and this hasn't been frozen yet. `inputs` is already entrant-shaped (driver/
            # team/grid/qualifyingGapSec/4 tyre keys), same as every other model call above.
            if len(dnf_rows_other_seasons) + len(dnf_rows_this_season) >= DNF_WARMUP_ROWS:
                update["simulation"] = compute_race_simulation(
                    inputs,
                    prior_pace_rows=pace_rows,
                    prior_dnf_rows=dnf_rows_other_seasons + dnf_rows_this_season,
                    calibration_pool=(p1_probs, p1_actuals, podium_probs, podium_actuals),
                )
            update_race(cur, race_id, update)
            print(f"  round {round_num}: prediction frozen ({len(training_rows)} training rows)")


def main():
    year = int(sys.argv[1]) if len(sys.argv) > 1 else datetime.now().year
    conn = init_postgres()
    print(f"Training/predicting for {year}...")
    process_year(conn, year)
    conn.close()
    # Same reasoning as fetch_races.py's call — a frozen prediction/pole/simulation is exactly
    # the kind of change RaceRealtimeWatcher exists to surface immediately.
    trigger_revalidation("races")
    print("Done.")


if __name__ == "__main__":
    main()
