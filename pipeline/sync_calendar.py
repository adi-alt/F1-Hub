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
import os
import re
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

import fastf1
import firebase_admin
from firebase_admin import credentials, firestore

fastf1.Cache.enable_cache(str(Path(__file__).resolve().parent / "f1_cache"))


def slugify(name: str) -> str:
    # NFKD + ascii-ignore drops accents (e.g. "São Paulo" -> "Sao Paulo") rather than mangling
    # the character entirely, which plain regex-stripping would do.
    ascii_only = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_only.lower()).strip("-")


def init_firestore():
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise SystemExit("FIREBASE_SERVICE_ACCOUNT_JSON is not set.")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(json.loads(raw)))
    return firestore.client()


def session_date(row, label: str):
    """Session slot numbers shift by weekend format (sprint weekends have 5 sessions, not 3) —
    find a session by its label ("Race", "Qualifying") rather than assuming a fixed slot."""
    for i in range(1, 6):
        if row.get(f"Session{i}") == label:
            date = row.get(f"Session{i}DateUtc")
            return date.isoformat() if date is not None and not str(date) == "NaT" else None
    return None


def sync_year(db, year: int):
    schedule = fastf1.get_event_schedule(year)
    events = schedule[schedule["RoundNumber"] > 0]  # excludes pre-season testing entries
    print(f"{year}: {len(events)} rounds")

    for _, row in events.iterrows():
        round_num = int(row["RoundNumber"])
        event_name = str(row["EventName"])
        doc_id = f"{year}_r{round_num:02d}_{slugify(event_name)}"
        doc = {
            "year": year,
            "round": round_num,
            "eventName": event_name,
            "location": str(row["Location"]),
            "country": str(row["Country"]),
            "eventFormat": str(row["EventFormat"]),
            "qualifyingDate": session_date(row, "Qualifying"),
            "raceDate": session_date(row, "Race"),
        }
        db.collection("calendar").document(doc_id).set(doc)
        print(f"  {doc_id}: race={doc['raceDate']}")


def main():
    years = [int(y) for y in sys.argv[1:]] or [datetime.now().year]
    db = init_firestore()
    for year in years:
        sync_year(db, year)
    print("Done.")


if __name__ == "__main__":
    main()
