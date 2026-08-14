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

## Archive backfill (1950-2017)

A separate, one-off vertical: `/archive` on the site reads pre-2018 seasons from their own
`archive_races` Firestore collection, sourced from Ergast/Jolpi (`fastf1.ergast.Ergast()`, the
same dependency `fetch_races.py` doesn't need — FastF1 itself has no data before 2018) rather than
FastF1. Four scripts, run in this order, each idempotent and safe to interrupt/resume:

- **`fetch_archive.py`** — the base backfill (race name, circuit, date, final classification).
  Already ran to completion once; not something you need to run again unless a genuinely new
  historical season shows up in Ergast (it won't).
- **`enrich_archive.py`** — adds finish time/gap, driver code, fastest lap, and the Wikipedia
  race-report URL (all from the same `/results` call `fetch_archive.py` already made, just
  fields it didn't keep), plus qualifying and pit stops (two genuinely new calls per race,
  present from the early-2000s and 2011 onward respectively — absent gracefully, not an error,
  for anything older). Marks each doc `enrichedAt` once done.
- **`enrich_archive_laps.py`** — lap-by-lap position/time as an `archive_races/{id}/laps`
  subcollection, 1996 onward only. Deliberately separate from `enrich_archive.py`: ~1,300 timing
  rows for a single race means ~14 paginated requests (Jolpi caps every page at 100 rows) versus
  1-2 for everything else combined — a very different runtime profile. Marks each doc
  `lapsBackfilled` once done.
- **`enrich_archive_circuits.py`** — adds `circuitId` + race-day weather to each race doc
  (weather via Open-Meteo's free historical archive API, no key needed — confirmed working back
  to 1950), and builds a separate `archive_circuits` collection (one doc per unique circuit,
  ~70-75 total, not per race) with a real track image sourced from that circuit's Wikipedia page.
  Two services `enrich_archive.py`/`enrich_archive_laps.py` never touch, so this only shares
  Jolpi's rate limit, not Open-Meteo's or Wikipedia's — still run after the other two finish
  rather than alongside them, to avoid piling a third Jolpi-touching pass on top.

```bash
export FIREBASE_SERVICE_ACCOUNT_JSON='<same service account JSON the app itself uses>'
python3 enrich_archive.py                 # every un-enriched race, 1950-2017
python3 enrich_archive_laps.py            # every race missing lap data, 1996-2017
python3 enrich_archive_circuits.py        # every race missing circuit/weather data, 1950-2017
```

All three accept the same `[start_year]` / `[start_year] [end_year]` arguments as
`fetch_archive.py`. Given the combined call volume (~13,000+ requests against a rate-limited
public API), a full run realistically takes multiple hours and may need to be resumed across more
than one sitting — each script's own idempotency flag makes that safe. `pipeline/ergast_utils.py`
holds the shared retry logic, including a dedicated (generous, since it's routine at this call
volume, not rare) backoff for fastf1's own client-side "500 calls/hour" cap
(`fastf1.req.RateLimitExceededError`) — that one's tracked in-memory per process, not something
the server tells you how long to wait for, unlike a normal "Too Many Requests" response.
