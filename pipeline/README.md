# FastF1 → Firestore pipeline

See [PROGRESS.md](./PROGRESS.md) for the full history of what's been built, tried, and rejected.

Three scripts, all safe to run with no arguments and no code changes across season boundaries —
none hardcode a year.

- **`fetch_races.py`** — quali + race results, weather, tire stints, safety-car counts for races
  that have actually happened. Writes to the `races` collection. Skips anything already
  `completed`, so it's safe to run on every scheduled tick.
- **`train_predict.py`** — trains the finish-order, pole, and pace models (`ml/`) on whatever's
  been fetched so far this season and freezes predictions once each race is ready. Always run after
  `fetch_races.py`, never before — predictions are meaningless without that run's fresh data (see
  `.github/workflows/fetch-races.yml`, which chains the two in one job for exactly this reason).
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
