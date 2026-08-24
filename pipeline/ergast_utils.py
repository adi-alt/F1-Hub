"""Shared helpers for every pipeline script: Ergast retry/formatting logic, and (since the
Firebase -> Supabase migration) the Postgres read/write primitives every script that used to
talk to Firestore now uses instead."""

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


def reconnect_postgres(dead_conn):
    """Best-effort recovery for a long-running per-row backfill loop whose connection drops mid-
    run on a transient network blip - seen live, twice, as `psycopg2.DatabaseError: ... SSL SYSCALL
    error: Can't assign requested address`, both times moments after an unrelated Wikimedia DNS
    resolution hiccup (this sandbox's network, not Wikimedia's or Supabase's fault specifically).
    `with_retry` doesn't cover this - it's scoped to network/API exceptions the fetch side raises,
    not psycopg2 errors on the write side. Closing the dead connection and opening a fresh one lets
    a loop recover instead of crashing the whole batch over one write."""
    try:
        dead_conn.close()
    except Exception:  # noqa: BLE001 - the old connection is already broken, closing it is best-effort
        pass
    return init_postgres()


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


def upload_media(bucket, path, content, content_type):
    """Pushes `content` into a Supabase Storage bucket via the plain REST API (no supabase-py
    dependency - every other pipeline script already just uses `requests` directly) and returns
    the public URL, or None on failure. Best-effort: a missing photo is never worth failing an
    otherwise-successful fetch run over. Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY -
    the same two vars the Next.js app itself uses for its own service-role client (see
    src/lib/supabase/admin.ts) - not DATABASE_URL, since Storage is a REST API, not Postgres.
    """
    base_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SECRET_KEY")
    if not base_url or not service_key:
        print("    (skipping media upload: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SECRET_KEY not set)")
        return None
    try:
        resp = with_retry(lambda: requests.post(
            f"{base_url}/storage/v1/object/{bucket}/{path}",
            headers={
                "Authorization": f"Bearer {service_key}",
                "apikey": service_key,
                "Content-Type": content_type,
                "x-upsert": "true",
            },
            data=content,
            timeout=30,
        ))
        resp.raise_for_status()
        return f"{base_url}/storage/v1/object/public/{bucket}/{path}"
    except Exception as e:  # noqa: BLE001 - deliberately broad, this is best-effort
        print(f"    media upload failed for {bucket}/{path}: {e}")
        return None


MEDIA_FETCH_HEADERS = {
    # Wikimedia's image CDN (upload.wikimedia.org), not just its page API, 403s any request with
    # no identifying User-Agent — confirmed live, the same rule enrich_archive_circuits.py already
    # discovered for the summary API also applies to the raw image host itself. F1's media CDN
    # doesn't seem to care either way, but there's no reason to send it a blank one specifically.
    "User-Agent": "F1Hub-MediaPipeline/1.0 (https://apexf1hub.vercel.app; re-hosting a driver/team/circuit photo)"
}


MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # under the media bucket's 10MB file_size_limit, with headroom
MAX_IMAGE_DIMENSION = 2400  # long edge, px - plenty for a full-bleed website backdrop


def _downscale_if_huge(content: bytes, content_type: str):
    """Commons genuinely hosts multi-ten-megabyte, many-thousand-pixel press photos (verified
    live: a real 2026 Austrian GP shot at 68MB/68MP) - wildly oversized for a website backdrop,
    and well past the Storage bucket's file_size_limit. Re-encodes only when actually needed; the
    huge majority of re-hosted media (headshots, logos, typical circuit photos) is already well
    under this and passes through untouched, byte-for-byte. Lazy-imports Pillow so nothing outside
    this one path pays for it."""
    if len(content) <= MAX_UPLOAD_BYTES:
        return content, content_type
    try:
        from io import BytesIO

        from PIL import Image

        img = Image.open(BytesIO(content))
        img.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION))
        buf = BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=85)
        return buf.getvalue(), "image/jpeg"
    except Exception as e:  # noqa: BLE001 - deliberately broad, this is best-effort
        print(f"    downscaling oversized image failed, uploading as-is: {e}")
        return content, content_type


def fetch_and_upload_media(url, bucket, path):
    """Downloads an external image and re-hosts it in Supabase Storage - the actual "don't
    hotlink" step every driver-headshot/team-logo/circuit-image fetch goes through, so the app
    never depends on F1's or Wikipedia's own hosting staying put. Content-Type comes from the
    source response (both F1's CDN and Wikipedia set it correctly), not guessed from the URL."""
    try:
        resp = with_retry(lambda: requests.get(url, headers=MEDIA_FETCH_HEADERS, timeout=30))
        resp.raise_for_status()
        content_type = resp.headers.get("Content-Type", "image/png").split(";")[0]
        content, content_type = _downscale_if_huge(resp.content, content_type)
        return upload_media(bucket, path, content, content_type)
    except Exception as e:  # noqa: BLE001 - deliberately broad, this is best-effort
        print(f"    fetching {url} for re-hosting failed: {e}")
        return None


COMMONS_MIN_DIMENSION_PX = 500  # below this on the short edge, it reads as a thumbnail/icon/logo,
                                # not a usable photo - confirmed live: Zandvoort's own category
                                # holds a 900x900 team-logo jpg right alongside real 4928x3264 shots


def resolve_commons_category(wikipedia_title):
    """The real Commons category for a Wikipedia article, via Wikidata's P373 ("Commons
    category") property - assuming the category matches the article's own title verbatim (this
    pipeline's usual shortcut, and it works often enough: Zandvoort, Monaco, Spa and Silverstone
    all matched literally) fails for a real chunk of circuits whose English Wikipedia title is an
    anglicized/shortened name while Commons kept the original - confirmed live: "Monza Circuit"'s
    own Commons category holds nothing, because the real one is "Autodromo Nazionale Monza" (same
    story for Suzuka, Interlagos, Baku, the Nurburgring - all verified live). Two extra API calls
    (pageprops for the Wikidata item, then that item's claims) - only worth paying for circuits,
    not the much higher-volume per-race lookups, where the naive title already has a solid hit
    rate. Falls back to the literal title on any failure or missing property - never worse than
    the old behavior, just sometimes not better."""
    try:
        pageprops_resp = with_retry(
            lambda: requests.get(
                "https://en.wikipedia.org/w/api.php",
                params={"action": "query", "titles": wikipedia_title, "prop": "pageprops", "format": "json"},
                headers=MEDIA_FETCH_HEADERS,
                timeout=15,
            )
        )
        pageprops_resp.raise_for_status()
        pages = pageprops_resp.json().get("query", {}).get("pages", {})
        wikibase_item = next((p.get("pageprops", {}).get("wikibase_item") for p in pages.values() if p.get("pageprops")), None)
        if not wikibase_item:
            return wikipedia_title

        wikidata_resp = with_retry(
            lambda: requests.get(
                "https://www.wikidata.org/w/api.php",
                params={"action": "wbgetentities", "ids": wikibase_item, "props": "claims", "format": "json"},
                headers=MEDIA_FETCH_HEADERS,
                timeout=15,
            )
        )
        wikidata_resp.raise_for_status()
        claims = wikidata_resp.json().get("entities", {}).get(wikibase_item, {}).get("claims", {})
        p373 = claims.get("P373")
        return p373[0]["mainsnak"]["datavalue"]["value"] if p373 else wikipedia_title
    except Exception as e:  # noqa: BLE001 - deliberately broad, this is best-effort
        print(f"    Commons category resolution failed for {wikipedia_title}: {e}")
        return wikipedia_title


def fetch_commons_photos(category, limit=4):
    """Real photos from a Wikimedia Commons category - `Category:{category}`, the same naming
    convention Wikipedia article titles use (a race's "{year} {EventName}", or a circuit's own
    article title). Wikipedia's own lead/infobox image is frequently just a diagram (a race
    article leads with the circuit map; a circuit article leads with the track-layout SVG -
    confirmed live for both), since real photography is almost always copyright-restricted and
    can't be hosted there. Wikimedia Commons' separate category (when one exists) holds real
    attendee/photographer-contributed photos under a free license instead - verified live across
    a wide span (1958-2026) for races, and across several current circuits (Monza, Silverstone,
    Monaco, Spa, Zandvoort) for circuits too.

    Filters to .jpg/.jpeg (a real camera photo is virtually always a JPEG, while diagrams/graphics
    in the same category are almost always .svg/.png), excludes filenames containing "logo", and
    drops anything under COMMONS_MIN_DIMENSION_PX on its short edge (thumbnails/icons that
    otherwise pass the extension filter). Resolves up to `limit` in ONE batched imageinfo call
    (MediaWiki's API accepts pipe-separated titles) rather than one call per photo. Returns an
    empty list if the category doesn't exist or holds no qualifying files - a real, accepted gap
    for less-documented races/circuits (confirmed live: some categories return zero members at
    all), not an error.
    """
    try:
        list_resp = with_retry(
            lambda: requests.get(
                "https://commons.wikimedia.org/w/api.php",
                params={
                    "action": "query",
                    "list": "categorymembers",
                    "cmtitle": f"Category:{category}",
                    "cmtype": "file",
                    "cmlimit": 50,
                    "format": "json",
                },
                headers=MEDIA_FETCH_HEADERS,
                timeout=15,
            )
        )
        list_resp.raise_for_status()
        members = list_resp.json().get("query", {}).get("categorymembers", [])
        candidates = [m["title"] for m in members if m["title"].lower().endswith((".jpg", ".jpeg")) and "logo" not in m["title"].lower()]
        if not candidates:
            return []

        info_resp = with_retry(
            lambda: requests.get(
                "https://commons.wikimedia.org/w/api.php",
                params={"action": "query", "titles": "|".join(candidates), "prop": "imageinfo", "iiprop": "url|size", "format": "json"},
                headers=MEDIA_FETCH_HEADERS,
                timeout=15,
            )
        )
        info_resp.raise_for_status()
        pages = info_resp.json().get("query", {}).get("pages", {})
        photos = []
        for page in pages.values():
            imageinfo = page.get("imageinfo")
            if not imageinfo:
                continue
            info = imageinfo[0]
            if min(info.get("width", 0), info.get("height", 0)) < COMMONS_MIN_DIMENSION_PX:
                continue
            photos.append(info["url"])
        return photos[:limit]
    except Exception as e:  # noqa: BLE001 - deliberately broad, this is best-effort
        print(f"    Commons photos lookup failed for {category}: {e}")
        return []


PHOTO_MAX_DIMENSION = 1600  # long edge, px - a website backdrop never needs press-photo-original
                            # resolution (Commons routinely serves 4000-5000px+ JPEGs); this is
                            # still sharp at full-bleed on any real display
PHOTO_JPEG_QUALITY = 78


def _resize_photo(content: bytes) -> bytes:
    """Always resizes+recompresses, unlike _downscale_if_huge's "only if it blows the bucket
    limit" - this is specifically for fetch_and_upload_media_multi's callers (race/circuit real-
    photo galleries), where every source is already a filtered-to-.jpg real photo, never a
    transparent logo/graphic, so flattening to JPEG can't lose anything. Directly caused a real
    quota incident: 3,729 files / 6.1GB across races+circuits+archive-drivers after the first
    multi-photo backfill, well past the original-size-only 8MB safety net (_downscale_if_huge) -
    most real press photos are well under 8MB but still several MB at full resolution, and there
    were thousands of them. At this target, a typical photo lands in the 150-400KB range instead."""
    from io import BytesIO

    from PIL import Image

    img = Image.open(BytesIO(content))
    img.thumbnail((PHOTO_MAX_DIMENSION, PHOTO_MAX_DIMENSION))
    buf = BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=PHOTO_JPEG_QUALITY)
    return buf.getvalue()


def fetch_and_upload_media_multi(urls, bucket, path_prefix):
    """Downloads each url, resizes it down to a website-backdrop-appropriate size (see
    _resize_photo - this is what keeps a real-photo gallery from re-creating the storage-quota
    incident), and uploads to `{path_prefix}-{i}.png` - returns the Storage URLs that actually
    succeeded (skips, doesn't abort, on a single failure, same best-effort convention as
    everything else here)."""
    uploaded = []
    for i, url in enumerate(urls):
        try:
            resp = with_retry(lambda: requests.get(url, headers=MEDIA_FETCH_HEADERS, timeout=30))
            resp.raise_for_status()
            content = _resize_photo(resp.content)
        except Exception as e:  # noqa: BLE001 - deliberately broad, this is best-effort
            print(f"    fetching {url} for re-hosting failed: {e}")
            continue
        result = upload_media(bucket, f"{path_prefix}-{i}.png", content, "image/jpeg")
        if result:
            uploaded.append(result)
    return uploaded
