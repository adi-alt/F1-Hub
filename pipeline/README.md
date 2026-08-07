# FastF1 → Firestore pipeline

Two independent scripts, both safe to run with no arguments and no code changes across season
boundaries — neither hardcodes a year.

- **`fetch_races.py`** — quali + race results, weather, tire stints for races that have actually
  happened. Writes to the `races` collection. Skips anything already `completed`, so it's safe to
  run on every scheduled tick.
- **`sync_calendar.py`** — the season schedule (names, dates, locations) for races that *haven't*
  happened yet, so the site has something to show for "next race" without predicting anything.
  Writes to the separate `calendar` collection.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export FIREBASE_SERVICE_ACCOUNT_JSON='<same service account JSON the app itself uses>'

python3 fetch_races.py       # current year, full schedule, skips what's already done
python3 sync_calendar.py     # current year's calendar
```

Both accept an explicit year (and `fetch_races.py` explicit rounds) for backfill/manual use —
see each file's own docstring.
