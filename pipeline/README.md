# Data pipeline

Python 3.11 jobs that keep the database current: results and timing, the season calendar, the
prediction models, group scores, media, and the archive. Everything writes to Supabase Postgres
(`DATABASE_URL`, `ergast_utils.init_postgres()`); images are re-hosted in Supabase Storage's `media`
bucket (`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY`). The site was on Firestore once; only the
one-off `migrate_export.py` still reads it.

See [PROGRESS.md](./PROGRESS.md) for the history of what was built, tried and rejected, and
[OPENF1_FALLBACK.md](./OPENF1_FALLBACK.md) for the fallback design.

## Data sources

- **Jolpica-F1** (`jolpica.py`, `https://api.jolpi.ca/ergast/f1`, the Ergast successor): the official
  classification, qualifying and sprint results, standings, and the whole archive back to 1950. A
  round is accepted only when Jolpica's race date matches the event's date, so a numbering
  difference can never write the wrong race.
- **OpenF1** (`openf1_fallback.py`): a preliminary classification derived from live timing when no
  official result exists yet (`races.results_source = 'openf1_preliminary'`), upgraded to the
  official one on a later tick. Also driver and team names. OpenF1 refuses free access (401 on every
  endpoint) while a session is live; data returns once it ends.
- **FastF1:** the event schedule, and the full timing (laps, tyre stints, per-lap positions) when it
  can load a session. F1's live-timing service is unreachable from GitHub's runners, so in CI FastF1
  returns no session data and Jolpica + OpenF1 carry the results. `run_local.sh` runs the same
  pipeline from a machine where FastF1 works, which upgrades a round to full official timing.
- **Wikimedia Commons / Wikipedia:** race photos (approved by a person), circuit track maps and
  photos, team logos and archive driver photos, each licence-checked.
- **Open-Meteo:** historical race-day weather for the archive (no key).

## Scheduled workflows (`.github/workflows/`)

| Workflow | When | Runs |
|---|---|---|
| `fetch-races.yml` | every 15 min | `fetch_races.py` → `train_predict.py` → `compute_group_scores.py` → `audit_data_consistency.py`. Most ticks exit after one query: `next_relevant_round()` only lets a round through inside its fetch window. Manual run: `force_all_rounds` to catch up after an outage |
| `sync-calendar.yml` | Mondays 00:00 UTC | `sync_calendar.py`: the season schedule in `calendar`, including races not yet run |
| `archive-promotion.yml` | Mondays in Dec and Jan | `promote_season.py`: moves a finished season into the archive; prints "Nothing to promote" otherwise |
| `race-photos.yml` | Tuesdays | `race_photos.py`: Commons candidates for recent races (approved on `/admin/race-photos`) and a re-check of approved ones |
| `circuit-track-maps.yml` | manual | `circuit_track_maps.py` (dry run by default) |
| `email-jobs.yml` | hourly | calls the site's `/api/cron/emails` (not Python) |

Every job that changes what the site shows calls the site's `/api/admin/revalidate` (`CRON_SECRET`, `APP_BASE_URL`) so
cached pages see new data at once. Each job is recorded in the `pipeline_runs` ledger (`run_ledger.py`)
and failures go to Sentry when `SENTRY_DSN` is set; `/api/health` reports the last successful run.
`audit_data_consistency.py` turns the run red within one tick if a bad write lands. What to do when
something fails: [docs/RUNBOOK.md](../docs/RUNBOOK.md#pipeline-failures).

## The jobs

- **`fetch_races.py`:** qualifying (stage by stage), sprint and race results, grid, weather, tyre
  stints, laps and safety-car counts for the round that is due. Race identity rules
  (`race_identity.py`) stop it writing a duplicate event; a conflict fails the step for a person.
- **`train_predict.py`:** trains the finish-order, pole and pace models (`ml/`) on the season so far,
  and freezes each race's `prediction`, `pole_prediction` and `simulation` once qualifying exists.
- **`compute_group_scores.py`:** scores community prediction rounds and picks once a race has a result.
- **`sync_calendar.py`:** the season calendar; an event that leaves the schedule is marked `cancelled`.
- **`race_track_story.py`, `race_replay.py`, `circuit_layouts.py`:** circuit outlines, lead changes and
  the replay files under `public/replays/`.
- **`evaluate_*_benchmark.py`:** freeze each model's benchmark in `model_benchmarks`.
- **Archive:** `fetch_archive.py`, `enrich_archive*.py`, `fetch_archive_driver_media.py`,
  `backfill_*.py`. Idempotent and resumable; `promote_season.py` runs the right ones each winter.
- **One-offs:** `reconstruct_prediction.py`, `shrink_media_storage.py`, `trim_media_storage.py`,
  `migrate_export.py` / `migrate_load.py` (the Firestore migration). Read each docstring first.

## Running locally

```sh
python3 -m venv .venv && source .venv/bin/activate
pip install -r pipeline/requirements.txt
export DATABASE_URL='<Postgres connection string>'
export NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=...   # only for steps that upload media
export CRON_SECRET=... APP_BASE_URL=...                       # optional: revalidate the site's cache

./pipeline/run_local.sh            # the same chain CI runs, for whatever round is due
./pipeline/run_local.sh 2026 13    # one specific round
python pipeline/sync_calendar.py   # the current season's calendar
```

No script hardcodes a season; each accepts an explicit year (and `fetch_races.py` rounds) for
backfills, see its docstring. Tests are plain-assert scripts (`cd pipeline && python test_<name>.py`), run by
`ci.yml`'s `pipeline-tests` job.
