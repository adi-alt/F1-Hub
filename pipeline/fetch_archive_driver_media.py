"""Backfills date_of_birth/wikipedia_url/photo_url for every archive_drivers row (~805, 1950
onward). Same per-entity Ergast lookup pattern enrich_archive_circuits.py already uses for
circuits - Ergast's own get_driver_info(driver=driver_id) carries `driverUrl` (Wikipedia) and
`dateOfBirth` directly, so this never has to guess a Wikipedia title from a driver's name (a real
risk at this scale: plenty of drivers, especially 1950s-60s entries, share generic names with
unrelated Wikipedia pages).

date_of_birth is what makes "youngest winner at this circuit"-style facts on the personalized
homepage possible at all - nothing in this pipeline captured it before now. photo_url is the
"store every archive driver's photo too" piece - re-hosted into the same shared `media` Storage
bucket as everything else (see pipeline/ergast_utils.py's fetch_and_upload_media), never a raw
Wikipedia URL.

Not everyone has a free-licensed photo on Commons - a lot of 1950s/60s also-rans genuinely don't,
and that's not a bug to fix here; photo_url just stays null for them, same honest "we don't have
this" as archive_circuits.image_url already practices.

Run:
  export DATABASE_URL='<the pooled connection string, see .env.local>'
  export NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY  (see .env.local)
  python pipeline/fetch_archive_driver_media.py             # every driver missing date_of_birth
"""

import time

import requests
from fastf1.ergast import Ergast

from ergast_utils import clean, fetch_and_upload_media, init_postgres, with_retry

WIKIPEDIA_HEADERS = {
    "User-Agent": "F1Hub-ArchiveDriverMedia/1.0 (https://apexf1hub.vercel.app; one-off driver-photo backfill)"
}

REQUEST_DELAY_SEC = 0.5
ergast = Ergast()


def fetch_driver_info(driver_id: str):
    resp = with_retry(lambda: ergast.get_driver_info(driver=driver_id))
    if resp.empty:
        return None
    row = resp.iloc[0]
    return {
        "dateOfBirth": clean(row.get("dateOfBirth")),
        "driverUrl": clean(row.get("driverUrl")),
    }


def main():
    conn = init_postgres()
    with conn.cursor() as cur:
        cur.execute("select driver_id from archive_drivers where date_of_birth is null order by driver_id")
        driver_ids = [r[0] for r in cur.fetchall()]
        print(f"{len(driver_ids)} drivers need date_of_birth/wikipedia_url/photo_url")

        for driver_id in driver_ids:
            info = fetch_driver_info(driver_id)
            if not info:
                print(f"  {driver_id}: no Ergast driver info, skipping")
                time.sleep(REQUEST_DELAY_SEC)
                continue

            row = {"driver_id": driver_id, "date_of_birth": info["dateOfBirth"], "wikipedia_url": info["driverUrl"]}
            photo_url = None
            if info["driverUrl"]:
                title = info["driverUrl"].rstrip("/").rsplit("/", 1)[-1]
                resp = with_retry(
                    lambda: requests.get(
                        f"https://en.wikipedia.org/api/rest_v1/page/summary/{title}",
                        headers=WIKIPEDIA_HEADERS,
                        timeout=30,
                    )
                )
                if resp.status_code == 200:
                    data = resp.json()
                    image = data.get("originalimage") or data.get("thumbnail")
                    source = image.get("source") if image else None
                    if source:
                        photo_url = fetch_and_upload_media(source, "media", f"archive-drivers/{driver_id}.png")
            row["photo_url"] = photo_url

            # A plain UPDATE, not upsert(): archive_drivers.name is NOT NULL with no default, and
            # every one of these rows already exists (this only ever targets known driver_ids) -
            # confirmed live that upsert()'s ON CONFLICT DO UPDATE still validates NOT NULL on the
            # candidate insert row before it ever checks for a conflict, the same lesson
            # fetch_races.py's sync_roster() already hit for drivers.name/team.
            cur.execute(
                "update archive_drivers set date_of_birth = %s, wikipedia_url = %s, photo_url = %s where driver_id = %s",
                (row["date_of_birth"], row["wikipedia_url"], row["photo_url"], driver_id),
            )
            print(f"  {driver_id}: dob={info['dateOfBirth']}, photo={'yes' if photo_url else 'no'}")
            time.sleep(REQUEST_DELAY_SEC)

    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
