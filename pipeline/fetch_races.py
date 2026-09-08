"""Fetch a race weekend entirely from FastF1 and push it to Postgres (races/race_results/
race_inputs/tire_stints - see supabase/schema.sql). No training/prediction in this pass,
fetch+push only.

Row id: `{year}_r{round:02d}_{event-slug}`, e.g. `2026_r11_hungarian-grand-prix` — readable
without a lookup, and round-padded so ids sort correctly.

No year or round is hardcoded anywhere — run with no arguments and it processes the current
year's full schedule (discovered from FastF1 itself), skipping anything already marked
`completed`. This is what makes it safe to run unconditionally on every scheduled tick, this
season, next season, and every season after that, with no code change required at a season
boundary.

Run:
  export DATABASE_URL='<the pooled connection string, see .env.local>'
  python pipeline/fetch_races.py                  # current year, full schedule, skips done races
  python pipeline/fetch_races.py 2018              # a specific year, full schedule
  python pipeline/fetch_races.py 2018 1 2 3        # explicit rounds (backfill/manual use)
"""

from __future__ import annotations

import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path

import fastf1
import numpy as np
import pandas as pd
import psycopg2

from ergast_utils import (
    fetch_and_upload_media,
    fetch_and_upload_media_multi,
    fetch_commons_photos,
    format_timedelta,
    init_postgres,
    reconnect_postgres,
    trigger_revalidation,
    upsert,
)
from openf1_fallback import fetch_race_openf1

CACHE_DIR = Path(__file__).resolve().parent / "f1_cache"
CACHE_DIR.mkdir(exist_ok=True)
fastf1.Cache.enable_cache(str(CACHE_DIR))


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
                    "headshotUrl": getattr(row, "HeadshotUrl", None),
                    "teamColor": getattr(row, "TeamColor", None),
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


def fetch_practice(year: int, round_num: int, label: str):
    """{session: "FP1"/"FP2"/"FP3", bestLaps: [...], weather: {...}}, or None if that session
    hasn't happened (or doesn't exist for this weekend — sprint weekends have no FP2/FP3).

    Unlike qualifying/race data, this is available *before* a weekend's own quali or race — FP1-3
    always run first — which is what makes it a legitimate live predictive input for the pole
    model rather than just another historical aggregate: "how is this driver going this weekend"
    is knowable ahead of Saturday's qualifying in a way next race's grid isn't.
    """
    try:
        session = fastf1.get_session(year, round_num, label)
        session.load(laps=True, weather=True, telemetry=False, messages=False)
        if session.laps is None or session.laps.empty:
            raise fastf1.core.DataNotLoadedError("no laps")

        best_by_driver = session.laps.groupby("Driver")["LapTime"].min()
        session_best = best_by_driver.min()
        if pd.isna(session_best):
            raise fastf1.core.DataNotLoadedError("no valid lap times")

        best_laps = [
            {
                "driver": driver,
                "lapTimeSec": round(lap_time.total_seconds(), 3),
                "deltaToBestSec": round((lap_time - session_best).total_seconds(), 3),
            }
            for driver, lap_time in best_by_driver.items()
            if pd.notna(lap_time)
        ]

        weather_df = session.weather_data
        weather = (
            {
                "airTempC": round(float(weather_df["AirTemp"].mean()), 1),
                "trackTempC": round(float(weather_df["TrackTemp"].mean()), 1),
                "humidityPct": round(float(weather_df["Humidity"].mean()), 1),
                "rainfall": bool((weather_df["Rainfall"] > 0).any()),
            }
            if weather_df is not None and not weather_df.empty
            else None
        )

        return {"session": label, "bestLaps": best_laps, "weather": weather}
    except Exception as exc:
        print(f"    {label}: not available ({exc})")
        return None


def extract_lap_rows(session) -> list[dict]:
    """Every driver's per-lap track position + lap time, off an already-`session.load(laps=True)`
    session - real FastF1 data (`session.laps`'s own Position/LapTime columns), the same DataFrame
    fetch_race() below already loads for fastest-lap/tyre-stint/traffic-stat purposes and otherwise
    discards. Plays the same role for race_laps that enrich_archive_laps.py's Ergast fetch plays
    for archive_laps - lap-by-lap position, not just start/finish."""
    if session.laps is None or session.laps.empty:
        return []
    return [
        {
            "driver": row.Driver,
            "lapNumber": int(row.LapNumber),
            "position": int(row.Position) if pd.notna(row.Position) else None,
            "time": format_timedelta(row.LapTime) if pd.notna(row.LapTime) else None,
        }
        for row in session.laps.itertuples()
        if pd.notna(row.LapNumber)
    ]


def fetch_race(year: int, round_num: int):
    """{session: "R", results/weather/tireStints: ...}, or None if the race hasn't run yet."""
    try:
        session = fastf1.get_session(year, round_num, "R")
        session.load(laps=True, weather=True, telemetry=False, messages=True)
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
                    "headshotUrl": getattr(row, "HeadshotUrl", None),
                    "teamColor": getattr(row, "TeamColor", None),
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

        # Race-level, not driver-level, on purpose: this is the input to a future P(safety car)
        # race-environment model, not a per-driver ranking feature — that earlier attempt (safety
        # car rate as a finish-model feature) failed for a structural reason (identical for every
        # driver in a race, no ranking signal), not because the data itself is uninformative. Race
        # control uses a clean structured Category field ("SafetyCar", with DEPLOYED/ENDING message
        # pairs) rather than needing to pattern-match free text — counting DEPLOYED events avoids
        # double-counting a period's start and end as two periods.
        messages = session.race_control_messages
        safety_car_periods = int(
            messages[(messages["Category"] == "SafetyCar") & messages["Message"].str.contains("DEPLOYED", na=False)].shape[0]
        )

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

        # Per-driver, per-compound pace and degradation — not stint counts (already tested and
        # rejected as a Pace-model feature; too coarse to carry real signal). `degradationSecPerLap`
        # is the actual lap_time-vs-tyre_age slope within a compound, so it captures how fast a
        # compound falls off, not just how long a driver ran it. This conflates tire wear with
        # fuel-burn-off and track evolution (all three move lap time as a stint progresses, and lap
        # time alone can't separate them) — a real limitation of this proxy, not hidden from anyone
        # using it. `IsAccurate` + excluding in/out laps filters out the safety-car/traffic/pit
        # laps that would otherwise swamp the signal with noise unrelated to the tyre itself.
        tyre_laps = session.laps[
            session.laps["PitInTime"].isna()
            & session.laps["PitOutTime"].isna()
            & session.laps["IsAccurate"]
            & session.laps["LapTime"].notna()
            & session.laps["TyreLife"].notna()
        ].copy()
        tyre_laps["LapTimeSec"] = tyre_laps["LapTime"].dt.total_seconds()
        compound_pace = []
        if not tyre_laps.empty:
            session_best_sec = float(tyre_laps["LapTimeSec"].min())
            for (driver, compound), group in tyre_laps.groupby(["Driver", "Compound"]):
                if len(group) < 3:
                    continue
                degradation = None
                if group["TyreLife"].nunique() >= 2:
                    slope, _ = np.polyfit(group["TyreLife"], group["LapTimeSec"], 1)
                    degradation = round(float(slope), 4)
                compound_pace.append(
                    {
                        "driver": driver,
                        "compound": compound,
                        "lapCount": int(len(group)),
                        "avgPaceDeltaSec": round(float(group["LapTimeSec"].mean() - session_best_sec), 3),
                        "degradationSecPerLap": degradation,
                    }
                )

        return {
            "session": "R",
            "results": results,
            "weather": weather,
            "tireStints": tire_stints,
            "trafficStats": traffic_stats,
            "safetyCarPeriods": safety_car_periods,
            "tireCompoundPace": compound_pace,
            "lapTimings": extract_lap_rows(session),
        }
    except Exception as exc:
        print(f"    race: not available ({exc})")
        return None


def slugify(name: str) -> str:
    # NFKD + ascii-ignore drops accents (e.g. "São Paulo" -> "Sao Paulo") rather than mangling
    # the character entirely, which plain regex-stripping would do.
    ascii_only = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_only.lower()).strip("-")


def get_existing_race(cur, race_id: str) -> dict | None:
    cur.execute("select status, practice, photo_urls, results_source from races where id = %s", (race_id,))
    row = cur.fetchone()
    return {"status": row[0], "practice": row[1] or {}, "photo_urls": row[2], "results_source": row[3]} if row else None


def upsize_headshot(url: str | None) -> str | None:
    """F1's own media CDN serves session.results' HeadshotUrl at a tiny default rendition
    (.transform/1col/, 93x93) — verified live that swapping the preset to 12col instead (same
    Scene7-style dynamic-imaging path every size on that CDN uses) returns the same photo at
    1336x1336, the largest preset that doesn't 400. No new API, no extra request — same URL,
    different path segment."""
    return url.replace(".transform/1col/", ".transform/12col/") if url else url


def sync_roster(cur, entrants: list[dict], known_driver_codes: set[str]) -> None:
    """Upserts `drivers`/`teams` from whichever of this round's qualifying/race sessions
    succeeded. name/team/color refresh every call (so a mid-season team swap shows up
    immediately), but a driver's headshot is only fetched-and-reuploaded once — verified
    unnecessary to repeat (a driver's photo doesn't change race to race) and one more thing this
    won't do 20 times over on every single scheduled run for the rest of the season.

    Headshot writes are a plain UPDATE, not a second upsert() call, for a real reason: `drivers`
    has other NOT NULL columns (name/team) with no default, and Postgres's ON CONFLICT DO UPDATE
    still validates NOT NULL on the *candidate insert row* before it ever checks for a conflict -
    confirmed live (`null value in column "name" violates not-null constraint`) even though every
    driver here already has a row from the upsert right above. A plain UPDATE has no such
    candidate-row step; the row is guaranteed to already exist by this point.
    """
    if not entrants:
        return

    now = datetime.now(timezone.utc).isoformat()
    driver_rows = [{"code": e["driver"], "name": e["driverName"], "team": e["team"], "updated_at": now} for e in entrants]
    upsert(cur, "drivers", driver_rows, ["code"])

    for e in entrants:
        if e["driver"] in known_driver_codes or not e.get("headshotUrl"):
            continue
        uploaded = fetch_and_upload_media(upsize_headshot(e["headshotUrl"]), "media", f"drivers/{e['driver']}.png")
        if uploaded:
            cur.execute("update drivers set headshot_url = %s where code = %s", (uploaded, e["driver"]))
            known_driver_codes.add(e["driver"])

    team_rows = {e["team"]: {"name": e["team"], "color": e.get("teamColor"), "updated_at": now} for e in entrants}
    upsert(cur, "teams", list(team_rows.values()), ["name"])




def build_and_push(cur, year: int, round_num: int, known_driver_codes: set[str]):
    # Event calendar info exists regardless of whether quali/race have happened yet, so it's
    # fetched independently rather than borrowed from whichever session happened to load — that
    # also means the doc id (which needs the event name) doesn't depend on the race having run.
    calendar_event = fastf1.get_event(year, round_num)
    event_name = str(calendar_event["EventName"])
    race_id = f"{year}_r{round_num:02d}_{slugify(event_name)}"
    print(f"  {race_id}:")

    practice = {}
    for label in ("FP1", "FP2", "FP3"):
        result = fetch_practice(year, round_num, label)
        if result:
            practice[label] = {"bestLaps": result["bestLaps"], "weather": result["weather"]}
    qualifying = fetch_qualifying(year, round_num)
    race = fetch_race(year, round_num)
    results_source = "official"

    if not practice and not qualifying and not race:
        # Nothing has happened for this round yet — `calendar` (sync_calendar.py) is what covers
        # "what's coming up"; pushing an empty placeholder here is exactly the clutter this
        # table is meant to avoid.
        print("    nothing available yet, not pushing a placeholder")
        return

    # A transient failure (rate limiting, a network blip) on a *re*-fetch must never regress
    # anything that's already known to have happened. Postgres makes this simpler than the old
    # whole-document overwrite did: not including a column in this run's upsert leaves whatever
    # was already there untouched, so there's nothing to read back and merge except `practice`
    # (one jsonb blob covering all three sessions, so a failed FP3 refetch needs to merge onto
    # whatever FP1/FP2 already got stored, not just get skipped wholesale like race/qualifying can).
    existing = get_existing_race(cur, race_id)

    # FastF1/Jolpica came back empty - try OpenF1's preliminary classification before giving up.
    # Never attempted if an official *completed* result already exists (nothing to gain, and no
    # reason to risk a downgrade) - only relevant the first time a round has no official data yet.
    # Checking status == 'completed' too, not just results_source == 'official' alone: the schema
    # migration's DEFAULT 'official' backfilled every pre-existing row regardless of whether it
    # actually has a real result yet (an 'upcoming' row with no race at all also reads as
    # results_source='official' from that default) - a real bug caught live on this exact round
    # before this fix. See pipeline/OPENF1_FALLBACK.md for the full architecture.
    already_official = bool(existing) and existing.get("status") == "completed" and existing.get("results_source") == "official"
    if not race and not already_official:
        race = fetch_race_openf1(year, round_num, str(calendar_event["Country"]), qualifying["grid"] if qualifying else [])
        if race:
            results_source = "openf1_preliminary"
            print("    race: FastF1/Jolpica had nothing yet, used OpenF1 preliminary classification")

    merged_practice = {**(existing["practice"] if existing else {}), **practice}
    keep_old_race = not race and bool(existing) and existing["status"] == "completed"
    if keep_old_race:
        print("    race fetch failed but a completed race already exists — keeping it, not overwriting")
        results_source = existing.get("results_source") or "official"

    data_completeness = None
    if race:
        data_completeness = json.dumps(
            {
                "classification": True,
                "grid": bool(qualifying),
                "laps": bool(race.get("lapTimings")),
                "weather": race.get("weather") is not None,
                "tireData": bool(race.get("tireCompoundPace")),
                "trafficAnalysis": bool(race.get("trafficStats")),
                "safetyCarAnalysis": race.get("safetyCarPeriods") is not None,
                "fastestLap": any(r.get("fastestLapSec") is not None for r in race["results"]),
            }
        )

    race_row = {
        "id": race_id,
        "year": year,
        "round": round_num,
        "name": event_name,
        "circuit": str(calendar_event["Location"]),
        "country": str(calendar_event["Country"]),
        "race_date": calendar_event["EventDate"].strftime("%Y-%m-%d"),
        "status": "completed" if (race or keep_old_race) else ("upcoming" if qualifying else "scheduled"),
        "practice": json.dumps(merged_practice) if merged_practice else None,
        "results_source": results_source,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if qualifying:
        race_row["pole_sitter"] = next((g["driver"] for g in qualifying["grid"] if g["gridPosition"] == 1), None)
        race_row["pole_time_sec"] = qualifying["poleTimeSec"]
    if race:
        race_row["weather"] = json.dumps(race["weather"])
        race_row["traffic_stats"] = json.dumps(race["trafficStats"])
        race_row["safety_car_periods"] = race["safetyCarPeriods"]
        race_row["tire_compound_pace"] = json.dumps(race["tireCompoundPace"])
        race_row["data_completeness"] = data_completeness
        # Once, not every run - re-hit Commons every 6 hours for photos that never change once
        # found. `existing` (fetched above) already tells us if a prior run already got them.
        if not (existing and existing.get("photo_urls")):
            photo_sources = fetch_commons_photos(f"{year} {event_name}")
            uploaded = fetch_and_upload_media_multi(photo_sources, "media", f"races/{race_id}")
            if uploaded:
                race_row["photo_url"] = uploaded[0]
                race_row["photo_urls"] = uploaded
    upsert(cur, "races", [race_row], ["id"])

    roster = race["results"] if race else (qualifying["grid"] if qualifying else [])
    sync_roster(cur, roster, known_driver_codes)

    if qualifying:
        input_rows = [
            {
                "race_id": race_id,
                "driver": g["driver"],
                "driver_name": g["driverName"],
                "team": g["team"],
                "grid": g["gridPosition"],
                "qualifying_gap_sec": g["qualifyingGapSec"],
            }
            for g in qualifying["grid"]
        ]
        upsert(cur, "race_inputs", input_rows, ["race_id", "driver"])
    if race:
        # status_source: per-driver provenance for the *derived* status specifically (not the
        # whole race) - 'official' when FastF1/Jolpica classified it directly, 'lap_distance_derived'
        # for every OpenF1-fallback row (see openf1_fallback.py's own doc comment on why a
        # race-control-based refinement was tried and rejected - it produced a real false positive
        # on a real historical race). This is what lets predict_dnf.py's training data eventually be
        # filtered/weighted by confidence if that ever matters, without re-deriving it after the fact.
        status_source = "official" if results_source == "official" else "lap_distance_derived"
        result_rows = [
            {
                "race_id": race_id,
                "driver": r["driver"],
                "driver_name": r["driverName"],
                "team": r["team"],
                "grid": r["gridPosition"],
                "finish_position": r["finishPosition"],
                "finish_gap_sec": r["finishGapSec"],
                "status": r["status"],
                "status_source": status_source,
                "fastest_lap_sec": r["fastestLapSec"],
                "points": r["points"],
            }
            for r in race["results"]
        ]
        upsert(cur, "race_results", result_rows, ["race_id", "driver"])
        stint_rows = [
            {"race_id": race_id, "driver": t["driver"], "stint_number": t["stintNumber"], "compound": t["compound"], "lap_count": t["lapCount"]}
            for t in race["tireStints"]
        ]
        upsert(cur, "tire_stints", stint_rows, ["race_id", "driver", "stint_number"])
        lap_rows = [
            {"race_id": race_id, "driver": t["driver"], "lap_number": t["lapNumber"], "position": t["position"], "time": t["time"]}
            for t in race["lapTimings"]
        ]
        upsert(cur, "race_laps", lap_rows, ["race_id", "lap_number", "driver"])

    quali_rows = len(qualifying["grid"]) if qualifying else 0
    race_rows_n = len(race["results"]) if race else 0
    print(
        f"    pushed: status={race_row['status']}, practice={sorted(merged_practice.keys())}, "
        f"qualifying.grid={quali_rows} rows, race.results={race_rows_n} rows"
    )


def backfill_race_photos(cur):
    """Separate, independently-idempotent pass (gated on `photo_urls is null`, not `status` -
    completed races are never revisited by the main per-round loop below, `is_already_completed`
    skips calling build_and_push at all once results are in, correctly avoiding a wasted refetch of
    data that never changes - but photo_urls specifically can still be missing on an old completed
    row, either because it predates this column, or because no Commons category existed for that
    race yet the first time it was tried and one's shown up since). Runs every tick regardless of
    which year/rounds were targeted, same as enrich_archive.py's own backfill_race_photos() for
    the archive side - cheap once caught up, since it only ever touches rows still missing photos."""
    cur.execute("select id, year, name from races where photo_urls is null order by year, round")
    rows = cur.fetchall()
    if not rows:
        return
    print(f"{len(rows)} races (any year) need re-hosted photos")
    for race_id, year, name in rows:
        sources = fetch_commons_photos(f"{year} {name}")
        if not sources:
            continue
        uploaded = fetch_and_upload_media_multi(sources, "media", f"races/{race_id}")
        if not uploaded:
            continue
        try:
            cur.execute("update races set photo_url = %s, photo_urls = %s where id = %s", (uploaded[0], uploaded, race_id))
        except psycopg2.Error as exc:
            # Seen live in enrich_archive.py's own version of this loop: a transient network blip
            # can take the whole Postgres connection down mid-loop - see reconnect_postgres.
            print(f"  {race_id}: DB write failed ({exc}), reconnecting and retrying once")
            cur = reconnect_postgres(cur.connection).cursor()
            cur.execute("update races set photo_url = %s, photo_urls = %s where id = %s", (uploaded[0], uploaded, race_id))
        print(f"  {race_id}: {len(uploaded)} photo(s) uploaded")


def backfill_race_laps(cur):
    """Same shape as backfill_race_photos above - completed races are never revisited by the main
    per-round loop, so any already-completed race with zero race_laps rows (every race that
    finished before this feature shipped, or a transient per-race failure) needs its own catch-up
    pass. Cheap once caught up: only touches completed races with no race_laps rows at all, and
    unlike the photo backfill this is a single already-cached-by-fastf1 session load per race, not
    a paginated Ergast fetch."""
    cur.execute(
        "select id, year, round from races where status = 'completed' "
        "and not exists (select 1 from race_laps where race_laps.race_id = races.id) "
        "order by year, round"
    )
    rows = cur.fetchall()
    if not rows:
        return
    print(f"{len(rows)} completed race(s) missing lap data")
    for race_id, year, round_num in rows:
        try:
            session = fastf1.get_session(year, round_num, "R")
            session.load(laps=True, weather=False, telemetry=False, messages=False)
            lap_rows = [
                {"race_id": race_id, "driver": t["driver"], "lap_number": t["lapNumber"], "position": t["position"], "time": t["time"]}
                for t in extract_lap_rows(session)
            ]
            if not lap_rows:
                print(f"  {race_id}: no lap data available")
                continue
            upsert(cur, "race_laps", lap_rows, ["race_id", "lap_number", "driver"])
        except Exception as exc:
            print(f"  {race_id}: lap backfill failed ({exc})")


def discover_rounds(year: int) -> list[int]:
    """Every real round FastF1 knows about for this year — excludes pre-season testing entries,
    which carry RoundNumber 0. No hardcoded count: a season can have 17 rounds or 24."""
    schedule = fastf1.get_event_schedule(year)
    rounds = schedule[schedule["RoundNumber"] > 0]["RoundNumber"]
    return sorted(int(r) for r in rounds)


def is_already_completed(cur, year: int, round_num: int) -> bool:
    """Race results never change after the fact once truly `completed` AND `official` - re-fetching
    that is pure waste, which matters once this runs on every scheduled tick rather than by hand.
    A round that's `completed` via `results_source = 'openf1_preliminary'` is NOT considered done
    here on purpose - see openf1_fallback.py/OPENF1_FALLBACK.md - it's a real, displayable result,
    but the pipeline keeps retrying FastF1/Jolpica for the official upgrade (fuller analytics,
    real points) within next_relevant_round()'s own fetch window."""
    cur.execute("select status, results_source from races where year = %s and round = %s limit 1", (year, round_num))
    row = cur.fetchone()
    return bool(row) and row[0] == "completed" and row[1] == "official"


# How long before a race weekend's first session to start actually attempting fetches, and how
# long after its last session to keep retrying before falling quiet again. The "after" window is
# generous specifically because our results source (FastF1 -> Jolpica-F1, Ergast's community
# successor) documents its own update cadence as "a single update per race weekend on the Monday
# after the event," with an explicit caveat that there can be further delay "outside of their
# control while refining import scripts" - see https://github.com/jolpica/jolpica-f1. A week of
# retries comfortably covers that, without polling forever if a weekend's data is unusually late.
FETCH_WINDOW_BEFORE = timedelta(hours=24)
FETCH_WINDOW_AFTER = timedelta(days=7)


def next_relevant_round(cur, year: int) -> int | None:
    """The earliest non-completed round whose session window (first session minus
    FETCH_WINDOW_BEFORE, through last session plus FETCH_WINDOW_AFTER) contains right now - or
    None if nothing is due yet. This is what makes it safe to run this script every 15 minutes
    instead of every 6 hours: discover_rounds()/looping every remaining round in the season on
    every tick was real, measured waste - each round's fetch costs ~30 FastF1 API calls (5
    sessions x ~7 calls each, see pipeline/PROGRESS.md's own 500-calls/hour figure), attempted
    for rounds that are still months away and can't possibly have data yet. Falls back to
    "fetch anyway" only when a round has no calendar row at all yet (sync_calendar.py hasn't run
    for it) - better to attempt a fetch we have no session data to gate on than to silently never
    check a round forever. A round completed only via `results_source = 'openf1_preliminary'`
    counts as "not really done" here too - see is_already_completed()'s own comment - so it keeps
    getting retried for the official upgrade within this same fetch window."""
    cur.execute(
        "select round from races where year = %s and (status != 'completed' or results_source = 'openf1_preliminary') "
        "order by round asc limit 1",
        (year,),
    )
    row = cur.fetchone()
    if not row:
        return None
    round_num = row[0]

    cur.execute("select sessions from calendar where year = %s and round = %s", (year, round_num))
    cal_row = cur.fetchone()
    if not cal_row or not cal_row[0]:
        return round_num

    # sync_calendar.py writes these from FastF1's own SessionXDateUtc columns, which pandas
    # returns as tz-naive Timestamps despite the "Utc" name (a real FastF1 convention/quirk, not
    # a sync_calendar.py bug) - .isoformat() on a naive Timestamp has no offset suffix at all, so
    # a naive parse here means UTC, not "unknown timezone."
    dates = []
    for s in cal_row[0]:
        if not s.get("date"):
            continue
        d = datetime.fromisoformat(s["date"])
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        dates.append(d)
    if not dates:
        return round_num

    now = datetime.now(timezone.utc)
    window_start = min(dates) - FETCH_WINDOW_BEFORE
    window_end = max(dates) + FETCH_WINDOW_AFTER
    return round_num if window_start <= now <= window_end else None


def main():
    args = sys.argv[1:]
    year = int(args[0]) if args else datetime.now().year
    force_all = os.environ.get("FORCE_ALL_ROUNDS", "").lower() == "true"

    conn = init_postgres()

    if len(args) > 1:
        rounds = [int(r) for r in args[1:]]
    elif force_all:
        rounds = discover_rounds(year)
    else:
        with conn.cursor() as gate_cur:
            target = next_relevant_round(gate_cur, year)
        if target is None:
            print(f"No race weekend within the fetch window right now for {year} - skipping "
                  "(saves ~30 FastF1 API calls this tick; see next_relevant_round's docstring).")
            conn.close()
            return
        rounds = [target]

    print(f"Processing {len(rounds)} round(s) for {year}: {rounds}")
    with conn.cursor() as cur:
        # `headshot_url is not null`, not just "has a row" - a row can exist without a photo yet
        # (a prior run's upload failed, or the driver row was seeded before this backfill ever
        # ran), and treating that as "already known" would permanently skip it.
        cur.execute("select code from drivers where headshot_url is not null")
        known_driver_codes = {r[0] for r in cur.fetchall()}
        for round_num in rounds:
            if is_already_completed(cur, year, round_num):
                print(f"  round {round_num}: already completed, skipping")
                continue
            build_and_push(cur, year, round_num, known_driver_codes)

        backfill_race_photos(cur)
        backfill_race_laps(cur)
    conn.close()
    # Busts the `races`-tagged unstable_cache entries (see src/lib/supabase/races.ts) so anyone
    # with the race page or home page open right now sees this run's data the moment their
    # RaceRealtimeWatcher notices the row changed, not up to 300s later.
    trigger_revalidation("races")
    # Same idea for drivers/teams (see update_entrants above, called from build_and_push per
    # round) - busts the `media`-tagged cache (src/lib/supabase/media.ts) so MediaRealtimeWatcher
    # can pull the fresh roster in the moment it notices, instead of waiting on that cache's own
    # timer.
    trigger_revalidation("media")
    print("Done.")


if __name__ == "__main__":
    main()
