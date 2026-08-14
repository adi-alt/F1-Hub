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
import requests
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
# Jolpi's own server-side "Too Many Requests" — also routine at this call volume, not rare. Caps
# at 480s rather than growing forever, but gets many more attempts at that ceiling than a genuine
# error would (each one of these several-thousand-request runs previously died outright once it
# exhausted 5 total attempts here, which — at this call volume — was reliably not enough).
MAX_TOO_MANY_REQUESTS_RETRIES = 15
TOO_MANY_REQUESTS_MAX_BACKOFF_SEC = 480


def with_retry(fn):
    """Three failure modes seen in practice on a several-thousand-request run: fastf1's own
    client-side rate cap (RateLimitExceededError — see above), Jolpi's own server-side "Too Many
    Requests" response (needs a real multi-minute wait — a few extra seconds never clears an
    hourly-scale limit), and plain network read timeouts / Firestore going briefly unavailable."""
    rate_limit_attempts = 0
    too_many_requests_attempts = 0
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
        except (requests.exceptions.RequestException, GoogleAPICallError):
            attempt += 1
            if attempt >= MAX_RETRIES:
                raise
            print(f"    transient error, retrying in 5s ({attempt}/{MAX_RETRIES})")
            time.sleep(5)
        except Exception as exc:
            if "Too Many Requests" not in str(exc):
                raise
            too_many_requests_attempts += 1
            if too_many_requests_attempts >= MAX_TOO_MANY_REQUESTS_RETRIES:
                raise
            backoff = min(TOO_MANY_REQUESTS_MAX_BACKOFF_SEC, 60 * (2 ** (too_many_requests_attempts - 1)))
            print(
                f"    rate limited, retrying in {backoff}s "
                f"({too_many_requests_attempts}/{MAX_TOO_MANY_REQUESTS_RETRIES})"
            )
            time.sleep(backoff)


def init_firestore():
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise SystemExit("FIREBASE_SERVICE_ACCOUNT_JSON is not set.")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(json.loads(raw)))
    return firestore.client()


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
