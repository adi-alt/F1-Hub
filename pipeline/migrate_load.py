"""One-time load: migration_data/*.json (written by migrate_export.py) -> Postgres, matching
supabase/schema.sql exactly.

Idempotent — every insert is `ON CONFLICT (real primary key) DO UPDATE`, so a rerun after a
partial failure (or while still getting a transform right) just re-applies the same rows. That's
the whole reason migrate_export.py wrote these to disk instead of piping straight through: this
script can be run as many times as needed against the local JSON with zero further Firestore
reads.

Scope: races (+ results/inputs/tire stints), archive_* (+ qualifying/pit stops/laps), calendar,
model_benchmarks. NOT users/picks — those need a Supabase Auth account created first (an existing
Firebase user has no Supabase uid yet), which is a separate step, not a data-shape problem this
script solves.

Run:
  export DATABASE_URL='<the pooled connection string, see .env.local>'
  python3 migrate_load.py
"""

import json
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras

sys.path.insert(0, str(Path(__file__).parent))
from enrich_archive_entities import team_slug  # noqa: E402 - reuse the exact, already-tested logic

DATA_DIR = Path(__file__).parent / "migration_data"


def _load_env_local() -> None:
    """Parsed by hand, not shell-sourced — see migrate_export.py for why."""
    import os

    env_path = Path(__file__).parent.parent / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def load_json(name: str):
    path = DATA_DIR / f"{name}.json"
    if not path.exists():
        print(f"  (skip {name}: {path} not found — run migrate_export.py first)")
        return None
    return json.loads(path.read_text())


def upsert(cur, table: str, rows: list[dict], conflict_cols: list[str], batch_size: int = 500) -> None:
    if not rows:
        print(f"  {table}: nothing to load")
        return
    # Postgres can't ON CONFLICT-resolve two rows in the *same* insert statement that target the
    # same key ("cannot affect row a second time") - confirmed live on archive_results: some
    # historical race genuinely has the same driver_id appear twice in its results (real messiness
    # in 70+ years of Ergast data, not a transform bug). Deduping here, last-one-wins, protects
    # every caller rather than each one having to know to do this itself.
    deduped: dict[tuple, dict] = {}
    for r in rows:
        deduped[tuple(r[c] for c in conflict_cols)] = r
    if len(deduped) != len(rows):
        print(f"  {table}: {len(rows) - len(deduped)} duplicate {conflict_cols} row(s) collapsed (last one wins)")
    rows = list(deduped.values())

    cols = list(rows[0].keys())
    update_cols = [c for c in cols if c not in conflict_cols]
    query = (
        f"insert into {table} ({','.join(cols)}) values %s "
        f"on conflict ({','.join(conflict_cols)}) do update set "
        f"{','.join(f'{c}=excluded.{c}' for c in update_cols)}"
    )
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        values = [tuple(r[c] for c in cols) for r in batch]
        psycopg2.extras.execute_values(cur, query, values)
    print(f"  {table}: upserted {len(rows)} rows")


def jsonb(value):
    return json.dumps(value) if value is not None else None


# ================================================================= archive

def load_archive_circuits(cur) -> None:
    docs = load_json("archive_circuits")
    if docs is None:
        return
    rows = [
        {
            "circuit_id": d["id"],
            "name": d.get("name"),
            "wikipedia_url": d.get("wikipediaUrl"),
            "image_url": d.get("imageUrl"),
            "lat": d.get("lat"),
            "long": d.get("long"),
        }
        for d in docs
    ]
    upsert(cur, "archive_circuits", rows, ["circuit_id"])


def load_archive_drivers(cur) -> None:
    docs = load_json("archive_drivers")
    if docs is None:
        return
    rows = [
        {
            "driver_id": d["id"],
            "name": d.get("name"),
            "code": d.get("code"),
            "first_year": d.get("firstYear"),
            "last_year": d.get("lastYear"),
            "race_count": d.get("raceCount"),
            "constructors": d.get("constructors"),
        }
        for d in docs
    ]
    upsert(cur, "archive_drivers", rows, ["driver_id"])


def load_archive_teams(cur) -> None:
    docs = load_json("archive_teams")
    if docs is None:
        return
    rows = [
        {
            "team_id": d["id"],
            "name": d.get("name"),
            "first_year": d.get("firstYear"),
            "last_year": d.get("lastYear"),
            "race_count": d.get("raceCount"),
            "drivers": d.get("drivers"),
        }
        for d in docs
    ]
    upsert(cur, "archive_teams", rows, ["team_id"])


def load_archive_races(cur) -> None:
    """archive_races itself plus everything that lived as a nested array on the Firestore doc
    (results/qualifying/pitStops) — flattened into their own tables now, same reasoning as
    race_results/race_inputs being split from `races` below."""
    docs = load_json("archive_races")
    if docs is None:
        return

    race_rows, result_rows, quali_rows, pitstop_rows = [], [], [], []
    for d in docs:
        race_id = d["id"]
        race_rows.append(
            {
                "id": race_id,
                "year": d["year"],
                "round": d["round"],
                "race_name": d.get("raceName"),
                "circuit_name": d.get("circuitName"),
                "locality": d.get("locality"),
                "country": d.get("country"),
                "race_date": d.get("raceDate"),
                "wikipedia_url": d.get("wikipediaUrl"),
                "weather": jsonb(d.get("weather")),
                "circuit_id": d.get("circuitId"),
                "laps_backfilled": bool(d.get("lapsBackfilled", False)),
            }
        )
        for r in d.get("results") or []:
            constructor = r.get("constructor")
            # Same pure function of (name, year) rebuild_indexes() already used to build
            # archive_teams — calling it again here reproduces the identical id, not a new one.
            team_id = team_slug(constructor, d["year"]) if constructor else None
            result_rows.append(
                {
                    "archive_race_id": race_id,
                    "driver_id": r["driverId"],
                    "position": r.get("position"),
                    "position_text": r.get("positionText"),
                    "grid": r.get("grid"),
                    "laps": r.get("laps"),
                    "status": r.get("status"),
                    "points": r.get("points"),
                    "driver_name": r.get("driverName"),
                    "constructor": constructor,
                    "team_id": team_id,
                    "time": r.get("time"),
                    "driver_code": r.get("driverCode"),
                    "fastest_lap": jsonb(r.get("fastestLap")),
                }
            )
        for q in d.get("qualifying") or []:
            quali_rows.append(
                {
                    "archive_race_id": race_id,
                    "driver_id": q["driverId"],
                    "position": q["position"],
                    "driver_name": q.get("driverName"),
                    "constructor": q.get("constructor"),
                    "q1": q.get("q1"),
                    "q2": q.get("q2"),
                    "q3": q.get("q3"),
                }
            )
        for p in d.get("pitStops") or []:
            pitstop_rows.append(
                {
                    "archive_race_id": race_id,
                    "driver_id": p["driverId"],
                    "stop": p["stop"],
                    "lap": p["lap"],
                    "time": p.get("time"),
                    "duration_sec": p.get("durationSec"),
                }
            )

    upsert(cur, "archive_races", race_rows, ["id"])
    upsert(cur, "archive_results", result_rows, ["archive_race_id", "driver_id"])
    upsert(cur, "archive_qualifying", quali_rows, ["archive_race_id", "driver_id"])
    upsert(cur, "archive_pit_stops", pitstop_rows, ["archive_race_id", "driver_id", "stop"])


def load_archive_laps(cur) -> None:
    laps_by_race = load_json("archive_laps")
    if laps_by_race is None:
        return
    rows = []
    for race_id, laps in laps_by_race.items():
        for lap_doc in laps:
            for timing in lap_doc.get("timings") or []:
                rows.append(
                    {
                        "archive_race_id": race_id,
                        "lap_number": lap_doc["lap"],
                        "driver_id": timing["driverId"],
                        "position": timing.get("position"),
                        "time": timing.get("time"),
                    }
                )
    upsert(cur, "archive_laps", rows, ["archive_race_id", "lap_number", "driver_id"])


# ================================================================= current season

def load_races(cur) -> None:
    """races itself plus its own nested qualifying.grid / race.results / race.tireStints -
    flattened the same way toRaceDoc() in the old firestore/races.ts translated them for reads,
    just writing rows instead of returning an object."""
    docs = load_json("races")
    if docs is None:
        return

    race_rows, result_rows, input_rows, stint_rows = [], [], [], []
    for d in docs:
        race_id = d["id"]
        qualifying = d.get("qualifying") or {}
        race = d.get("race") or {}
        race_rows.append(
            {
                "id": race_id,
                "year": d["year"],
                "round": d["round"],
                "name": d.get("eventName"),
                "circuit": d.get("location"),
                "status": d.get("status"),
                "race_date": None,
                "pole_sitter": next((g["driver"] for g in qualifying.get("grid", []) if g.get("gridPosition") == 1), None),
                "pole_time_sec": qualifying.get("poleTimeSec"),
                "weather": jsonb(race.get("weather")),
                "prediction": jsonb(d.get("prediction")),
                "pole_prediction": jsonb(d.get("polePrediction")),
                "simulation": jsonb(d.get("simulation")),
                "updated_at": d.get("fetchedAt"),
            }
        )
        for g in qualifying.get("grid") or []:
            input_rows.append(
                {
                    "race_id": race_id,
                    "driver": g["driver"],
                    "driver_name": g.get("driverName"),
                    "team": g.get("team"),
                    "grid": g["gridPosition"],
                    "qualifying_gap_sec": g.get("qualifyingGapSec"),
                }
            )
        for r in race.get("results") or []:
            result_rows.append(
                {
                    "race_id": race_id,
                    "driver": r["driver"],
                    "driver_name": r.get("driverName"),
                    "team": r.get("team"),
                    "grid": r.get("gridPosition"),
                    "finish_position": r["finishPosition"],
                    "finish_gap_sec": r.get("finishGapSec"),
                    "status": r.get("status"),
                    "fastest_lap_sec": r.get("fastestLapSec"),
                    "points": r.get("points", 0),
                }
            )
        for t in race.get("tireStints") or []:
            stint_rows.append(
                {
                    "race_id": race_id,
                    "driver": t["driver"],
                    "stint_number": t["stintNumber"],
                    "compound": t.get("compound"),
                    "lap_count": t.get("lapCount"),
                }
            )

    upsert(cur, "races", race_rows, ["id"])
    upsert(cur, "race_results", result_rows, ["race_id", "driver"])
    upsert(cur, "race_inputs", input_rows, ["race_id", "driver"])
    upsert(cur, "tire_stints", stint_rows, ["race_id", "driver", "stint_number"])


def load_calendar(cur) -> None:
    docs = load_json("calendar")
    if docs is None:
        return
    rows = [
        {
            "id": d["id"],
            "year": d["year"],
            "round": d["round"],
            "name": d.get("eventName"),
            "circuit": d.get("location"),
            "race_date": d.get("raceDate"),
            "status": None,
        }
        for d in docs
    ]
    upsert(cur, "calendar", rows, ["id"])


def load_model_benchmarks(cur) -> None:
    """Lower priority, best-effort: the raw doc (modelVersion/evaluatedAt/aggregate/perRace) has
    no explicit model-type field of its own (that only exists in the pipeline's local manifest
    file, never written to Firestore) - inferred here from the doc id instead."""
    docs = load_json("modelBenchmarks")
    if docs is None:
        return
    rows = []
    for d in docs:
        model_id = d["id"]
        model = next((m for m in ("finish", "pace", "pole", "simulator") if m in model_id.lower()), model_id)
        rows.append(
            {
                "id": model_id,
                "model": model,
                "generated_at": d.get("evaluatedAt"),
                "metrics": jsonb({"aggregate": d.get("aggregate"), "perRace": d.get("perRace")}),
            }
        )
    upsert(cur, "model_benchmarks", rows, ["id"])


def main():
    _load_env_local()
    import os

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = True
    with conn.cursor() as cur:
        print("Archive circuits/drivers/teams (parents first, for the FK on archive_results.team_id):")
        load_archive_circuits(cur)
        load_archive_drivers(cur)
        load_archive_teams(cur)
        print("Archive races + results/qualifying/pit stops:")
        load_archive_races(cur)
        print("Archive laps:")
        load_archive_laps(cur)
        print("Current-season races + results/inputs/tire stints:")
        load_races(cur)
        print("Calendar:")
        load_calendar(cur)
        print("Model benchmarks:")
        load_model_benchmarks(cur)
    conn.close()
    print("Done. users/picks NOT loaded - see this file's module docstring.")


if __name__ == "__main__":
    main()
