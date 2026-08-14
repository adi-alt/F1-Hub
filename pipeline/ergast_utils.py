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
from firebase_admin import credentials, firestore
from google.api_core.exceptions import GoogleAPICallError

MAX_RETRIES = 5


def with_retry(fn):
    """Same three failure modes fetch_archive.py already found in practice: Jolpi's hard rate
    limit (needs a real multi-minute wait — a few extra seconds never clears an hourly-scale
    limit), plain network read timeouts, and Firestore going briefly unavailable/slow."""
    for attempt in range(MAX_RETRIES):
        try:
            return fn()
        except (requests.exceptions.RequestException, GoogleAPICallError):
            if attempt == MAX_RETRIES - 1:
                raise
            print(f"    transient error, retrying in 5s ({attempt + 1}/{MAX_RETRIES})")
            time.sleep(5)
        except Exception as exc:
            if "Too Many Requests" not in str(exc) or attempt == MAX_RETRIES - 1:
                raise
            backoff = 60 * (2**attempt)  # 60s, 120s, 240s, 480s
            print(f"    rate limited, retrying in {backoff}s ({attempt + 1}/{MAX_RETRIES})")
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
