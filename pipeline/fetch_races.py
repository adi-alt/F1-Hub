"""Fetch a race weekend entirely from FastF1 and push it to Firestore in a new, FastF1-native
schema — not the old scraper-shaped RaceDoc. No training/prediction in this pass, fetch+push only.

Document id: `{year}_r{round:02d}_{event-slug}`, e.g. `2026_r11_hungarian-grand-prix` — readable
without opening the document, and round-padded so ids sort correctly. Within a document,
qualifying and race data live under their own clearly-named top-level keys (`qualifying`, `race`)
rather than sibling fields that read ambiguously out of context.

No year or round is hardcoded anywhere — run with no arguments and it processes the current
year's full schedule (discovered from FastF1 itself), skipping anything already marked
`completed` in Firestore. This is what makes it safe to run unconditionally on every scheduled
tick, this season, next season, and every season after that, with no code change required at a
season boundary.

Run:
  python pipeline/fetch_races.py                  # current year, full schedule, skips done races
  python pipeline/fetch_races.py 2018              # a specific year, full schedule
  python pipeline/fetch_races.py 2018 1 2 3        # explicit rounds (backfill/manual use)
"""

import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import fastf1
import pandas as pd
import firebase_admin
from firebase_admin import credentials, firestore

CACHE_DIR = Path(__file__).resolve().parent / "f1_cache"
CACHE_DIR.mkdir(exist_ok=True)
fastf1.Cache.enable_cache(str(CACHE_DIR))


def init_firestore():
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise SystemExit("FIREBASE_SERVICE_ACCOUNT_JSON is not set.")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(json.loads(raw)))
    return firestore.client()


def fetch_qualifying(year: int, round_num: int):
    """{session: "Q", grid: [...]}, or None if quali hasn't happened yet."""
    try:
        session = fastf1.get_session(year, round_num, "Q")
        session.load(laps=False, weather=False, telemetry=False)
        if session.results is None or session.results.empty:
            raise fastf1.core.DataNotLoadedError("no results")

        results = session.results.sort_values("Position")
        pole_time = results["Q3"].fillna(results["Q2"]).fillna(results["Q1"]).min()
        best_laps = None
        if pd.isna(pole_time):
            # Q1/Q2/Q3 columns are occasionally just empty for a whole session (a real FastF1
            # data quirk, not a fetch failure — confirmed on 2025 Miami) even though per-lap data
            # exists. Fall back to each driver's fastest lap of the session.
            session.load(laps=True, weather=False, telemetry=False)
            best_laps = session.laps.groupby("Driver")["LapTime"].min()
            pole_time = best_laps.min()

        grid = []
        for row in results.itertuples():
            if pd.isna(row.Position):
                # No time set (e.g. withdrew before setting a lap) — nothing to rank, skip.
                print(f"    quali: skipping {row.Abbreviation}, no position set")
                continue
            best = row.Q3 if pd.notna(row.Q3) else (row.Q2 if pd.notna(row.Q2) else row.Q1)
            if pd.isna(best) and best_laps is not None:
                best = best_laps.get(row.Abbreviation)
            gap = (best - pole_time).total_seconds() if pd.notna(best) else None
            grid.append(
                {
                    "driver": row.Abbreviation,
                    "driverName": row.FullName,
                    "team": row.TeamName,
                    "gridPosition": int(row.Position),
                    "qualifyingGapSec": round(gap, 3) if gap is not None else None,
                }
            )
        return {
            "session": "Q",
            "grid": grid,
            "poleTimeSec": round(pole_time.total_seconds(), 3) if pd.notna(pole_time) else None,
        }
    except Exception as exc:
        print(f"    quali: not available ({exc})")
        return None


# FastF1's raw `Status` covers ~50 distinct values (every mechanical failure gets its own string:
# "Gearbox", "Puncture", "Water leak", ...). The app only ever needs the 3-way distinction a race
# result actually cares about, so it's collapsed here rather than pushing that enumeration problem
# onto every UI component that branches on status.
def normalize_status(raw_status: str) -> str:
    if raw_status == "Finished":
        return "finished"
    if raw_status == "Lapped" or re.match(r"^\+\d+\s+Laps?$", raw_status):
        return "lapped"
    return "dnf"


def fetch_race(year: int, round_num: int):
    """{session: "R", results/weather/tireStints: ...}, or None if the race hasn't run yet."""
    try:
        session = fastf1.get_session(year, round_num, "R")
        session.load(laps=True, weather=True, telemetry=False)
        if session.results is None or session.results.empty:
            raise fastf1.core.DataNotLoadedError("no results")

        # F1's own timing convention, which FastF1's `Time` column preserves as-is: the winner's
        # `Time` is their absolute race duration, everyone else's is already their gap *to* the
        # winner — not something to compute ourselves, just read correctly per row.
        fastest_laps = session.laps.groupby("Driver")["LapTime"].min()

        results = []
        for row in session.results.sort_values("Position").itertuples():
            if pd.isna(row.Position):
                print(f"    race: skipping {row.Abbreviation}, no classified position")
                continue
            fastest_lap = fastest_laps.get(row.Abbreviation)
            results.append(
                {
                    "driver": row.Abbreviation,
                    "driverName": row.FullName,
                    "team": row.TeamName,
                    "gridPosition": int(row.GridPosition) if pd.notna(row.GridPosition) else None,
                    "finishPosition": int(row.Position),
                    "status": normalize_status(row.Status),
                    "points": float(row.Points),
                    "finishGapSec": 0 if row.Position == 1 else (
                        round(row.Time.total_seconds(), 3) if pd.notna(row.Time) else None
                    ),
                    "fastestLapSec": round(fastest_lap.total_seconds(), 3) if pd.notna(fastest_lap) else None,
                }
            )

        weather_df = session.weather_data
        weather = {
            "airTempC": round(float(weather_df["AirTemp"].mean()), 1),
            "trackTempC": round(float(weather_df["TrackTemp"].mean()), 1),
            "humidityPct": round(float(weather_df["Humidity"].mean()), 1),
            "rainfall": bool((weather_df["Rainfall"] > 0).any()),
        }

        stints_df = (
            session.laps[["Driver", "Stint", "Compound", "LapNumber"]]
            .groupby(["Driver", "Stint", "Compound"])
            .count()
            .rename(columns={"LapNumber": "lapCount"})
            .reset_index()
        )
        tire_stints = [
            {"driver": r.Driver, "stintNumber": int(r.Stint), "compound": r.Compound, "lapCount": int(r.lapCount)}
            for r in stints_df.itertuples()
        ]

        # Gap to the car directly ahead (by classified position), per lap, excluding pit in/out
        # laps since those distort the gap independent of any real on-track proximity. Not a
        # telemetry/GPS computation — FastF1's per-lap cumulative session Time is already exactly
        # what's needed: sort a lap's drivers by Position, the gap is just the Time delta between
        # consecutive rows. Aggregated to one summary per driver since the whole-race distribution,
        # not any single lap, is what could plausibly describe a persistent trait ("this driver's
        # races tend to involve a lot of close following") worth using as historical context later.
        clean_laps = session.laps[session.laps["PitInTime"].isna() & session.laps["PitOutTime"].isna()]
        gap_rows = []
        for _, lap_group in clean_laps.groupby("LapNumber"):
            ordered = lap_group[["Driver", "Position", "Time"]].dropna().sort_values("Position")
            ordered["gapAheadSec"] = ordered["Time"].diff().dt.total_seconds()
            gap_rows.append(ordered[["Driver", "gapAheadSec"]])
        traffic_stats = []
        if gap_rows:
            all_gaps = pd.concat(gap_rows).dropna()
            for driver, gaps in all_gaps.groupby("Driver")["gapAheadSec"]:
                traffic_stats.append(
                    {
                        "driver": driver,
                        "avgGapAheadSec": round(float(gaps.mean()), 3),
                        "pctLapsCloseBehind": round(float((gaps < 1.5).mean()), 3),
                    }
                )

        return {
            "session": "R",
            "results": results,
            "weather": weather,
            "tireStints": tire_stints,
            "trafficStats": traffic_stats,
        }
    except Exception as exc:
        print(f"    race: not available ({exc})")
        return None


def slugify(name: str) -> str:
    # NFKD + ascii-ignore drops accents (e.g. "São Paulo" -> "Sao Paulo") rather than mangling
    # the character entirely, which plain regex-stripping would do.
    ascii_only = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_only.lower()).strip("-")


def build_and_push(db, year: int, round_num: int):
    # Event calendar info exists regardless of whether quali/race have happened yet, so it's
    # fetched independently rather than borrowed from whichever session happened to load — that
    # also means the doc id (which needs the event name) doesn't depend on the race having run.
    calendar_event = fastf1.get_event(year, round_num)
    event_name = str(calendar_event["EventName"])
    doc_id = f"{year}_r{round_num:02d}_{slugify(event_name)}"
    print(f"  {doc_id}:")

    qualifying = fetch_qualifying(year, round_num)
    race = fetch_race(year, round_num)

    if not qualifying and not race:
        # Nothing has happened for this round yet — `calendar` (sync_calendar.py) is what covers
        # "what's coming up"; pushing an empty placeholder here is exactly the clutter this
        # collection is meant to avoid.
        print("    nothing available yet, not pushing a placeholder")
        return

    # A transient failure (rate limiting, a network blip) on a *re*-fetch must never regress a
    # race that's already known to be completed — `.set()` overwrites the whole document, so
    # silently falling back to "upcoming" here would erase real results that were already stored.
    # This actually happened once already: Hungary got downgraded and lost its race data this way.
    if not race:
        existing = db.collection("races").document(doc_id).get()
        if existing.exists and existing.to_dict().get("race"):
            print("    race fetch failed but a completed race already exists — keeping it, not overwriting")
            race = existing.to_dict()["race"]

    doc = {
        "year": year,
        "round": round_num,
        "status": "completed" if race else ("upcoming" if qualifying else "scheduled"),
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "eventName": event_name,
        "location": str(calendar_event["Location"]),
        "country": str(calendar_event["Country"]),
        "qualifying": (
            {"session": "Q", "grid": qualifying["grid"], "poleTimeSec": qualifying["poleTimeSec"]}
            if qualifying
            else None
        ),
        "race": (
            {
                "session": "R",
                "results": race["results"],
                "weather": race["weather"],
                "tireStints": race["tireStints"],
                "trafficStats": race["trafficStats"],
            }
            if race
            else None
        ),
    }

    db.collection("races").document(doc_id).set(doc)
    quali_rows = len(qualifying["grid"]) if qualifying else 0
    race_rows = len(race["results"]) if race else 0
    print(f"    pushed: status={doc['status']}, qualifying.grid={quali_rows} rows, race.results={race_rows} rows")


def discover_rounds(year: int) -> list[int]:
    """Every real round FastF1 knows about for this year — excludes pre-season testing entries,
    which carry RoundNumber 0. No hardcoded count: a season can have 17 rounds or 24."""
    schedule = fastf1.get_event_schedule(year)
    rounds = schedule[schedule["RoundNumber"] > 0]["RoundNumber"]
    return sorted(int(r) for r in rounds)


def is_already_completed(db, year: int, round_num: int) -> bool:
    """Race results never change after the fact — once a round is `completed`, re-fetching it
    is pure waste, which matters once this runs on every scheduled tick rather than by hand."""
    docs = list(
        db.collection("races").where("year", "==", year).where("round", "==", round_num).limit(1).stream()
    )
    return bool(docs) and docs[0].to_dict().get("status") == "completed"


def main():
    args = sys.argv[1:]
    year = int(args[0]) if args else datetime.now().year
    rounds = [int(r) for r in args[1:]] if len(args) > 1 else discover_rounds(year)

    db = init_firestore()
    print(f"Processing {len(rounds)} round(s) for {year}: {rounds}")
    for round_num in rounds:
        if is_already_completed(db, year, round_num):
            print(f"  round {round_num}: already completed, skipping")
            continue
        build_and_push(db, year, round_num)
    print("Done.")


if __name__ == "__main__":
    main()
