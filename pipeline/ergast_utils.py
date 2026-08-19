"""Shared helpers for the archive-enrichment scripts (enrich_archive.py, enrich_archive_laps.py).

fetch_archive.py isn't touched to use this — it already ran successfully once and works; this
exists only because the two *new* scripts need the same retry/init/formatting logic, and two real
call sites is exactly the point past which duplicating it stops being the lazier option.
"""

import datetime
import json
import os
import time

import firebase_admin
import pandas as pd
import psycopg2
import psycopg2.extras
import requests
from fastf1.ergast.interface import ErgastInvalidRequestError
from fastf1.req import RateLimitExceededError
from firebase_admin import credentials, firestore
from google.api_core.exceptions import GoogleAPICallError

MAX_RETRIES = 5
# fastf1's own client-side hard cap (see fastf1/req.py's _CallsPerIntervalLimitRaise: "any API:
# 500 calls/h") is tracked in-memory per process, not something the server tells us how long to
# wait for — a bulk run making thousands of calls hits this routinely, not as a rare failure, so
# it gets many more attempts than a genuine error would, with a fixed generous pause each time.
MAX_RATE_LIMIT_RETRIES = 12
RATE_LIMIT_WAIT_SEC = 360
# fastf1 wraps *every* non-200 HTTP response from Ergast/Jolpi in this one exception type, keyed
# only by the HTTP reason phrase in its message — 429 Too Many Requests, 502 Bad Gateway, 503
# Service Unavailable, 504 Gateway Timeout have all actually been seen on this run. All of them
# are routine at this call volume, not rare, so this gets the same generous capped-backoff
# treatment as the rate limit above instead of pattern-matching one specific message string (which
# is exactly what let "Bad Gateway" slip through uncaught and crash the whole run before this).
MAX_HTTP_ERROR_RETRIES = 15
HTTP_ERROR_MAX_BACKOFF_SEC = 480


def with_retry(fn):
    """Failure modes seen in practice on a several-thousand-request run: fastf1's own client-side
    rate cap (RateLimitExceededError — see above), any non-200 HTTP response from Ergast/Jolpi
    itself (ErgastInvalidRequestError — see above), and plain network read timeouts / Firestore
    going briefly unavailable."""
    rate_limit_attempts = 0
    http_error_attempts = 0
    attempt = 0
    while True:
        try:
            return fn()
        except RateLimitExceededError:
            rate_limit_attempts += 1
            if rate_limit_attempts >= MAX_RATE_LIMIT_RETRIES:
                raise
            print(
                f"    fastf1's 500-calls/hour cap hit, waiting {RATE_LIMIT_WAIT_SEC}s "
                f"({rate_limit_attempts}/{MAX_RATE_LIMIT_RETRIES})"
            )
            time.sleep(RATE_LIMIT_WAIT_SEC)
        except ErgastInvalidRequestError as exc:
            http_error_attempts += 1
            if http_error_attempts >= MAX_HTTP_ERROR_RETRIES:
                raise
            backoff = min(HTTP_ERROR_MAX_BACKOFF_SEC, 60 * (2 ** (http_error_attempts - 1)))
            print(
                f"    Ergast/Jolpi HTTP error ({exc}), retrying in {backoff}s "
                f"({http_error_attempts}/{MAX_HTTP_ERROR_RETRIES})"
            )
            time.sleep(backoff)
        except (requests.exceptions.RequestException, GoogleAPICallError):
            attempt += 1
            if attempt >= MAX_RETRIES:
                raise
            print(f"    transient error, retrying in 5s ({attempt}/{MAX_RETRIES})")
            time.sleep(5)


def init_firestore():
    """Only migrate_export.py still needs this — everything else that used to write here writes
    to Postgres now (see init_postgres below)."""
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise SystemExit("FIREBASE_SERVICE_ACCOUNT_JSON is not set.")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(json.loads(raw)))
    return firestore.client()


def init_postgres():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set.")
    conn = psycopg2.connect(url)
    conn.autocommit = True
    return conn


def fetch_completed_race_docs(conn):
    """Reconstructs the old Firestore-doc-shaped dict ({eventName, year, round, race: {results,
    tireStints, safetyCarPeriods, weather, tireCompoundPace}}) for every completed race - an
    adapter so the ml/*.py feature-engineering code (which expects that exact nested shape, built
    back when races lived in Firestore) doesn't need touching just because storage moved to
    Postgres. One extra query per race (results, tire stints) rather than a single clever join:
    a join across both child tables fans out and needs de-duplicating carefully to avoid losing
    per-stint granularity (e.g. a driver's *count* of stints, used as a pit-stop-count proxy) -
    not worth the risk when completed-race counts are in the low hundreds, not the kind of volume
    that N+1 queries would actually hurt."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            'select id, name as "eventName", year, round, safety_car_periods, weather, tire_compound_pace '
            "from races where status = 'completed'"
        )
        races = cur.fetchall()
        docs = []
        for r in races:
            cur.execute(
                'select driver, driver_name as "driverName", team, grid as "gridPosition", '
                'finish_position as "finishPosition", status, points, finish_gap_sec as "finishGapSec", '
                'fastest_lap_sec as "fastestLapSec" from race_results where race_id = %s',
                (r["id"],),
            )
            results = [dict(row) for row in cur.fetchall()]
            cur.execute(
                'select driver, stint_number as "stintNumber", compound, lap_count as "lapCount" '
                "from tire_stints where race_id = %s",
                (r["id"],),
            )
            tire_stints = [dict(row) for row in cur.fetchall()]
            docs.append(
                {
                    "eventName": r["eventName"],
                    "year": r["year"],
                    "round": r["round"],
                    "race": {
                        "results": results,
                        "tireStints": tire_stints,
                        "safetyCarPeriods": r["safety_car_periods"],
                        "weather": r["weather"],
                        "tireCompoundPace": r["tire_compound_pace"],
                    },
                }
            )
        return docs


def upsert(cur, table, rows, conflict_cols, batch_size=500):
    """Insert-or-update by real primary key — the one write primitive every pipeline script uses
    now, same idempotent-rerun discipline each already has for its own external API calls,
    extended to its own writes too. Dedupes input rows on the conflict key first: Postgres can't
    ON CONFLICT-resolve two rows in the *same* insert statement that target the same key ("cannot
    affect row a second time") - hit live during the one-time migration (some historical race
    genuinely has one driver_id twice in its own results) and just as possible from a normal
    pipeline run reprocessing overlapping data."""
    if not rows:
        print(f"  {table}: nothing to load")
        return
    deduped = {}
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


def clean(value):
    """Ergast/pandas gives back NaN/NaT for anything not tracked in a given era — store that as
    a real `None` rather than a NaN float, so the JS side can just use `??` / optional chaining."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, datetime.time):
        return value.strftime("%H:%M:%S")
    if hasattr(value, "item"):  # numpy scalar (int64, float64, ...)
        value = value.item()
        return None if isinstance(value, float) and pd.isna(value) else value
    return value


def format_timedelta(td, is_gap: bool = False):
    """Formats a pandas Timedelta into the display string F1 broadcasts/sites use: absolute
    "H:MM:SS.mmm" (fastest laps, qualifying times, the race winner's total time) or, when is_gap
    is set (every other classified finisher's *gap* to the winner — Ergast already represents it
    this way rather than a second absolute total; confirmed by checking real values: P1's
    totalRaceTime is ~1.5 hours, P2's is ~24 seconds, not another ~1.5-hour figure),
    "+M:SS.mmm" / "+SS.mmm"."""
    if td is None or pd.isna(td):
        return None
    total_ms = int(round(td.total_seconds() * 1000))
    hours, rem = divmod(total_ms, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    seconds, ms = divmod(rem, 1000)
    if is_gap:
        if hours or minutes:
            return f"+{hours * 60 + minutes}:{seconds:02d}.{ms:03d}"
        return f"+{seconds}.{ms:03d}"
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}.{ms:03d}"
    return f"{minutes}:{seconds:02d}.{ms:03d}"


def timedelta_seconds(td):
    if td is None or pd.isna(td):
        return None
    return round(td.total_seconds(), 3)


def trigger_revalidation(tag: str = "archive-data") -> None:
    """Tells the deployed app "real data changed" the moment a backfill run actually finishes,
    instead of leaving every page to notice on its own next timed cache check — see
    src/app/api/admin/revalidate/route.ts. Best-effort and silent on failure: a missing secret or
    a network hiccup here shouldn't fail a backfill run that otherwise succeeded, it just means
    that pass's freshness falls back to the (now 24h) timer instead of showing up immediately.
    """
    secret = os.environ.get("CRON_SECRET")
    if not secret:
        print("  (skipping cache revalidation: CRON_SECRET not set in this environment)")
        return
    base_url = os.environ.get("APP_BASE_URL", "https://apexf1hub.vercel.app")
    try:
        resp = requests.post(
            f"{base_url}/api/admin/revalidate",
            json={"tag": tag},
            headers={"x-cron-secret": secret},
            timeout=10,
        )
        print(f"  cache revalidation: {resp.status_code}")
    except Exception as e:  # noqa: BLE001 - deliberately broad, this is best-effort
        print(f"  (cache revalidation call failed, non-fatal: {e})")
