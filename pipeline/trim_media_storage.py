"""One-off: trims races/archive_races/archive_circuits down to TRIM_TO photos each, deleting the
excess directly by path - no download, no recompression, so (unlike shrink_media_storage.py) this
costs zero egress for anything it keeps. Written after that script's second pass still left
storage ~10% over the 1.1GB quota and a third full download-recompress-reupload pass would have
added meaningful egress for a comparatively small remaining gain - a pure trim closes the rest of
the gap for the price of the deletes alone.

Run:
  export DATABASE_URL='<pooled connection string>'
  export NEXT_PUBLIC_SUPABASE_URL='...'
  export SUPABASE_SECRET_KEY='...'
  python trim_media_storage.py            # DRY RUN: says what it would delete and rewrite, changes nothing
  python trim_media_storage.py --apply    # does it

Dry-run is the default (audit R-27): the deletes are not undoable.
"""

from ergast_utils import init_postgres
from shrink_media_storage import report_dry_run, storage_delete, storage_path_from_url, update_urls

TRIM_TO = 2


def trim_table(cur, table: str, id_col: str, url_col: str):
    cur.execute(f"select {id_col}, {url_col} from {table} where {url_col} is not null")
    rows = cur.fetchall()
    trimmed = 0
    for row_id, urls in rows:
        if not urls or len(urls) <= TRIM_TO:
            continue
        kept, dropped = urls[:TRIM_TO], urls[TRIM_TO:]
        storage_delete("media", [storage_path_from_url(u) for u in dropped])
        update_urls(cur, table, id_col, url_col, kept, row_id)
        trimmed += 1
    print(f"{table}: trimmed {trimmed} rows to {TRIM_TO}")


def main():
    conn = init_postgres()
    with conn.cursor() as cur:
        trim_table(cur, "archive_races", "id", "photo_urls")
        trim_table(cur, "races", "id", "photo_urls")
        trim_table(cur, "archive_circuits", "circuit_id", "image_urls")
    conn.close()
    report_dry_run()
    print("Done.")


if __name__ == "__main__":
    main()
