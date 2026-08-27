"""Syncs a season's calendar (name, dates, location) to Firestore — separate from `races`, which
only ever holds races that have actual FastF1 session data. This collection exists for *display*
("next race: Dutch GP, Aug 23") for races we have no intention of predicting yet, and is populated
straight from FastF1's schedule, which is available the moment a season is announced, long before
any session has actually run.

Also functions as season-transition seeding: with no arguments this defaults to the current year,
so once a new season's calendar is published, the very next scheduled run of this same script
(no code change) starts populating it — that's the entire "new season" story, no separate script.

Document id matches the `races` scheme (`{year}_r{round:02d}_{event-slug}`) so a calendar entry
and its eventual race-data entry (once one exists) share the same id across the two collections.

Run:
  python pipeline/sync_calendar.py            # current year
  python pipeline/sync_calendar.py 2026 2027  # explicit years
"""

import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import fastf1

from ergast_utils import fetch_completed_race_docs, init_postgres, trigger_revalidation, upsert
from ml.circuit_stats import build_circuit_records
from weather_forecast import fetch_weather_forecast

CACHE_DIR = Path(__file__).resolve().parent / "f1_cache"
CACHE_DIR.mkdir(exist_ok=True)
fastf1.Cache.enable_cache(str(CACHE_DIR))


def slugify(name: str) -> str:
    # NFKD + ascii-ignore drops accents (e.g. "São Paulo" -> "Sao Paulo") rather than mangling
    # the character entirely, which plain regex-stripping would do.
    ascii_only = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_only.lower()).strip("-")


def all_sessions(row):
    """Every session this weekend actually has, whatever they're called — a conventional weekend
    has 5 (3 practices, qualifying, race), a sprint weekend has a different 5 (practice, sprint
    qualifying, sprint, qualifying, race). Reading whichever slots are populated, rather than
    hardcoding specific labels, means this doesn't silently drop sessions on a format it wasn't
    written with in mind — including formats introduced in future seasons.
    """
    sessions = []
    for i in range(1, 6):
        label = row.get(f"Session{i}")
        date = row.get(f"Session{i}DateUtc")
        if label and date is not None and str(date) != "NaT":
            sessions.append({"label": str(label), "date": date.isoformat()})
    return sessions


def sync_year(conn, cur, year: int):
    schedule = fastf1.get_event_schedule(year)
    events = schedule[schedule["RoundNumber"] > 0]  # excludes pre-season testing entries
    print(f"{year}: {len(events)} rounds")

    # Cross-season on purpose (see ml/circuit_stats.py) — a forecast fallback for an upcoming
    # race needs every prior completed race, not just this season's.
    circuit_records = build_circuit_records(fetch_completed_race_docs(conn))
    now = datetime.now(timezone.utc)

    rows = []
    for _, row in events.iterrows():
        round_num = int(row["RoundNumber"])
        event_name = str(row["EventName"])
        location = str(row["Location"])
        row_id = f"{year}_r{round_num:02d}_{slugify(event_name)}"
        sessions = all_sessions(row)
        race_session = next((s for s in sessions if s["label"] == "Race"), None)
        race_date_str = race_session["date"] if race_session else None

        # A forecast for a race that already happened is meaningless — only compute it for races
        # still ahead of `now`, so this doesn't churn every past event on every weekly run.
        weather_forecast = None
        if race_date_str:
            race_date = datetime.fromisoformat(race_date_str)
            if race_date.tzinfo is None:
                race_date = race_date.replace(tzinfo=timezone.utc)
            if race_date > now:
                weather_forecast = fetch_weather_forecast(
                    circuit_records, event_name, location, year, round_num, race_date
                )

        rows.append(
            {
                "id": row_id,
                "year": year,
                "round": round_num,
                "name": event_name,
                "circuit": location,
                "country": str(row["Country"]),
                "event_format": str(row["EventFormat"]),
                "sessions": json.dumps(sessions),
                # Convenience copy of the one session every weekend definitely has, so "next race
                # in N days" sorting/display doesn't need to dig into the sessions list.
                "race_date": race_date_str,
                "weather_forecast": json.dumps(weather_forecast) if weather_forecast else None,
            }
        )
        print(f"  {row_id}: {len(sessions)} sessions, race={race_date_str}, forecast={weather_forecast}")

    upsert(cur, "calendar", rows, ["id"])


def main():
    years = [int(y) for y in sys.argv[1:]] or [datetime.now().year]
    conn = init_postgres()
    with conn.cursor() as cur:
        for year in years:
            sync_year(conn, cur, year)
    conn.close()
    # Busts the `calendar`-tagged unstable_cache entries (see src/lib/supabase/calendar.ts) so
    # CalendarRealtimeWatcher can pull the fresh schedule/session times in the moment it notices
    # a row changed, instead of waiting on that cache's own timer.
    trigger_revalidation("calendar")
    print("Done.")


if __name__ == "__main__":
    main()
