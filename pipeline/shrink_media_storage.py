"""One-off: brings the `media` Storage bucket back under Supabase's free-tier quota after the
race/circuit/archive-driver photo galleries blew well past it - measured live before this ran:
6.1GB across races (5.1GB/2775 files), circuits (676MB/368 files), and archive-drivers
(481MB/553 files), against a 1.1GB quota.

Two levers, applied per table:
  - Cap how many photos a single race/circuit keeps (KEEP_PER_ROW) - extras are deleted from
    Storage and trimmed from photo_urls/image_urls. archive_drivers only ever had one photo each,
    so this lever doesn't apply there.
  - Recompress every *kept* file in place, same path (so its public URL - and therefore the DB
    row referencing it - never changes): re-fetches ergast_utils.PHOTO_MAX_DIMENSION/
    PHOTO_JPEG_QUALITY's target instead of whatever resolution Commons/Wikipedia originally
    served. This is the same target ergast_utils.py's fetch_and_upload_media_multi now applies to
    every *future* fetch - this script is just the retroactive pass over what already got
    uploaded before that fix existed.

Downloads from Supabase Storage itself, not Wikimedia - a Storage-to-Storage round trip, so this
doesn't re-risk Wikimedia's rate limiting/DNS hiccups the original backfills ran into.

Run:
  export DATABASE_URL='<pooled connection string>'
  export NEXT_PUBLIC_SUPABASE_URL='...'
  export SUPABASE_SECRET_KEY='...'
  python shrink_media_storage.py
"""

import os

import requests

from ergast_utils import _resize_photo, init_postgres

BASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SERVICE_KEY = os.environ["SUPABASE_SECRET_KEY"]
AUTH_HEADERS = {"Authorization": f"Bearer {SERVICE_KEY}", "apikey": SERVICE_KEY}
KEEP_PER_ROW = 3


def storage_download(bucket: str, path: str) -> bytes:
    resp = requests.get(f"{BASE_URL}/storage/v1/object/{bucket}/{path}", headers=AUTH_HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.content


def storage_upload(bucket: str, path: str, content: bytes):
    resp = requests.post(
        f"{BASE_URL}/storage/v1/object/{bucket}/{path}",
        headers={**AUTH_HEADERS, "Content-Type": "image/jpeg", "x-upsert": "true"},
        data=content,
        timeout=30,
    )
    resp.raise_for_status()


def storage_delete(bucket: str, paths: list[str]):
    if not paths:
        return
    resp = requests.delete(f"{BASE_URL}/storage/v1/object/{bucket}", headers=AUTH_HEADERS, json={"prefixes": paths}, timeout=30)
    resp.raise_for_status()


def storage_path_from_url(url: str) -> str:
    # https://{ref}.supabase.co/storage/v1/object/public/media/races/2024_..._0.png -> races/2024_..._0.png
    return url.split("/storage/v1/object/public/media/", 1)[1]


def shrink_gallery_table(cur, table: str, id_col: str, url_col: str):
    """Multi-photo tables (photo_urls/image_urls, up to KEEP_PER_ROW kept)."""
    cur.execute(f"select {id_col}, {url_col} from {table} where {url_col} is not null")
    rows = cur.fetchall()
    print(f"{table}: {len(rows)} rows to shrink")
    for row_id, urls in rows:
        if not urls:
            continue
        kept, dropped = urls[:KEEP_PER_ROW], urls[KEEP_PER_ROW:]
        if dropped:
            storage_delete("media", [storage_path_from_url(u) for u in dropped])
        for url in kept:
            try:
                content = storage_download("media", storage_path_from_url(url))
                storage_upload("media", storage_path_from_url(url), _resize_photo(content))
            except Exception as e:  # noqa: BLE001 - deliberately broad, this is best-effort
                print(f"    {row_id}: recompressing {url} failed: {e}")
        if dropped:
            cur.execute(f"update {table} set {url_col} = %s where {id_col} = %s", (kept, row_id))
        print(f"  {row_id}: kept {len(kept)}, dropped {len(dropped)}")


def shrink_single_photo_table(cur, table: str, id_col: str, url_col: str):
    """Single-photo tables (archive_drivers.photo_url) - recompress in place, nothing to trim."""
    cur.execute(f"select {id_col}, {url_col} from {table} where {url_col} is not null")
    rows = cur.fetchall()
    print(f"{table}: {len(rows)} rows to shrink")
    for row_id, url in rows:
        try:
            content = storage_download("media", storage_path_from_url(url))
            storage_upload("media", storage_path_from_url(url), _resize_photo(content))
        except Exception as e:  # noqa: BLE001 - deliberately broad, this is best-effort
            print(f"    {row_id}: recompressing {url} failed: {e}")


def main():
    conn = init_postgres()
    with conn.cursor() as cur:
        shrink_gallery_table(cur, "archive_races", "id", "photo_urls")
        shrink_gallery_table(cur, "races", "id", "photo_urls")
        shrink_gallery_table(cur, "archive_circuits", "circuit_id", "image_urls")
        shrink_single_photo_table(cur, "archive_drivers", "driver_id", "photo_url")
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
