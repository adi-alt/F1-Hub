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
An event keeps its id when upstream renumbers it, and an event that disappears from the schedule is
marked `cancelled` rather than deleted - see race_identity.py and plan_calendar_sync(). Venue
corrections (race_identity.VENUE_OVERRIDES) are applied here too, so this weekly sync cannot restore
a known-bad upstream location.

Run:
  python pipeline/sync_calendar.py            # current year
  python pipeline/sync_calendar.py 2026 2027  # explicit years
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import fastf1

from ergast_utils import fetch_completed_race_docs, init_postgres, trigger_revalidation, upsert
from ml.circuit_stats import build_circuit_records
from race_identity import calendar_row_id, calendar_rows_to_retire, corrected_location, id_slug, slugify
from weather_forecast import fetch_weather_forecast

CACHE_DIR = Path(__file__).resolve().parent / "f1_cache"
CACHE_DIR.mkdir(exist_ok=True)
fastf1.Cache.enable_cache(str(CACHE_DIR))

# Statuses the pipeline never writes on its own, so a row carrying one was set deliberately (by a
# person, or by an earlier sync retiring an event that has since disappeared upstream). A later sync
# keeps them instead of flipping the row back to upcoming/completed from the date alone.
STICKY_STATUSES = ("cancelled", "postponed")


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


def _utc(iso: str) -> datetime:
    d = datetime.fromisoformat(iso)
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def plan_calendar_sync(year, events, existing, race_ids, now, forecast=None):
    """Pure planning step for one season, separated from I/O so it can be tested without FastF1 or
    Postgres. `events` is an iterable of FastF1 schedule rows (dict-like, testing entries already
    excluded); `existing` is (id, round, status) for every calendar row of `year`; `race_ids` every
    races id of `year`; `forecast(event_name, location, round_num, race_date)` returns the weather
    snapshot or None.

    Returns (rows to upsert, ids to retire as 'cancelled', warnings). Upserting is idempotent: the
    same schedule planned twice gives the same rows, and a row is always written under the id its
    event already has (calendar_row_id), so a repeated or renumbered sync never adds a second row
    for an event. Rows are never deleted - see calendar_rows_to_retire for what gets retired and the
    partial-calendar protection."""
    status_by_id = {rid: status for rid, _, status in existing}
    rows, warnings = [], []
    for row in events:
        round_num = int(row["RoundNumber"])
        event_name = str(row["EventName"])
        upstream_location = str(row["Location"])
        # Applied before anything is written or looked up (the circuit column AND the live-forecast
        # geocoding), so a sync can never restore an upstream value that race_identity.py corrects.
        location = corrected_location(year, event_name, upstream_location)
        if location != upstream_location:
            warnings.append(f"{event_name}: upstream location {upstream_location!r} overridden to {location!r} (race_identity.VENUE_OVERRIDES)")
        row_id = calendar_row_id(existing, race_ids, year, round_num, event_name)
        sessions = all_sessions(row)
        race_session = next((s for s in sessions if s["label"] == "Race"), None)
        race_date_str = race_session["date"] if race_session else None

        # A forecast for a race that already happened is meaningless — only compute it for races
        # still ahead of `now`, so this doesn't churn every past event on every weekly run.
        weather_forecast = None
        if race_date_str and forecast and _utc(race_date_str) > now:
            weather_forecast = forecast(event_name, location, round_num, _utc(race_date_str))

        # A simple, always-derivable lifecycle state - "has this event's race already happened",
        # not a richer "confirmed/provisional" schedule flag (FastF1's schedule doesn't expose one
        # cleanly). RaceDoc.status already covers the exact same completed/upcoming/scheduled
        # distinction once a `races` row exists (see races.ts's toCalendarPlaceholder) - this is
        # the calendar-only equivalent, available even before that row does.
        status = "completed" if race_date_str and _utc(race_date_str) <= now else "upcoming"
        previous = status_by_id.get(row_id)
        if previous in STICKY_STATUSES:
            warnings.append(f"{row_id}: upstream still lists this event but the row is {previous!r} - kept; clear the status by hand if it is back on")
            status = previous

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
                "status": status,
            }
        )

    fresh_ids = {r["id"] for r in rows}
    fresh_slug_rounds = {id_slug(r["id"]) or slugify(r["name"]): r["round"] for r in rows}
    retire, keep = calendar_rows_to_retire(existing, fresh_ids, fresh_slug_rounds)
    for rid in keep:
        warnings.append(f"{rid}: not in upstream's schedule, but beyond its last round - kept (possibly a partial calendar)")
    return rows, retire, warnings


def sync_year(conn, cur, year: int):
    schedule = fastf1.get_event_schedule(year)
    events = schedule[schedule["RoundNumber"] > 0]  # excludes pre-season testing entries
    print(f"{year}: {len(events)} rounds")

    # Cross-season on purpose (see ml/circuit_stats.py) — a forecast fallback for an upcoming
    # race needs every prior completed race, not just this season's.
    circuit_records = build_circuit_records(fetch_completed_race_docs(conn))
    now = datetime.now(timezone.utc)

    cur.execute("select id, round, status from calendar where year = %s", (year,))
    existing = [tuple(r) for r in cur.fetchall()]
    cur.execute("select id from races where year = %s", (year,))
    race_ids = [r[0] for r in cur.fetchall()]

    def forecast(event_name, location, round_num, race_date):
        return fetch_weather_forecast(circuit_records, event_name, location, year, round_num, race_date)

    rows, retire, warnings = plan_calendar_sync(year, (row for _, row in events.iterrows()), existing, race_ids, now, forecast)
    for w in warnings:
        print(f"  WARNING {w}")
    # Retired first: a renumbered event's new round may be the round a now-retired row still holds,
    # and a unique index on live rows per (year, round), where one exists, must never see both at once.
    if retire:
        cur.execute("update calendar set status = 'cancelled' where id = any(%s) and status is distinct from 'cancelled'", (retire,))
        print(f"  retired (status -> cancelled, not deleted): {sorted(retire)}")
    for r in rows:
        print(f"  {r['id']}: round {r['round']}, {len(json.loads(r['sessions']))} sessions, race={r['race_date']}, status={r['status']}")
    upsert(cur, "calendar", rows, ["id"])


def main():
    # UTC, not the runner's local clock - the season boundary is a calendar-year boundary.
    years = [int(y) for y in sys.argv[1:]] or [datetime.now(timezone.utc).year]
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
