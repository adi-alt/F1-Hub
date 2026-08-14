"""Builds a driver index for archive's "browse by racer" facet — pure Firestore aggregation, no
Ergast/Wikipedia/weather calls at all, since driverId/driverName are already sitting in every
race doc's results[]. Safe to run anytime, including concurrently with the other three archive
enrichment scripts — it touches none of their external APIs, so there's no shared rate limit to
worry about.

Writes a flat `driverIds: string[]` field onto each archive_races doc — the only way to make
"every race this driver ran" a real Firestore query (`array-contains`) instead of scanning every
doc's nested results array by hand — and (re)builds the small `archive_drivers` collection from
the *entire* archive every run, regardless of what year range was passed for the driverIds write.
That split matters: the driverIds write is naturally incremental/resumable per race (same as
every other archive enrichment pass), but the aggregate index has to see every race to be
correct — rebuilding it from just whatever range happens to have been requested would silently
truncate it down to that range's drivers.

Run:
  python enrich_archive_drivers.py             # every race missing driverIds, full range
  python enrich_archive_drivers.py 1994        # a single season
  python enrich_archive_drivers.py 1994 2000   # an inclusive year range
"""

import sys

from ergast_utils import init_firestore, with_retry


def write_driver_ids(db, start, end):
    query = db.collection("archive_races")
    if start is not None:
        query = query.where("year", ">=", start)
    if end is not None:
        query = query.where("year", "<=", end)
    docs = [d for d in query.stream() if "driverIds" not in d.to_dict()]
    print(f"{len(docs)} races need driverIds written")
    for i, doc in enumerate(docs):
        driver_ids = [r["driverId"] for r in doc.to_dict().get("results", []) if r.get("driverId")]
        with_retry(lambda ref=doc.reference, ids=driver_ids: ref.update({"driverIds": ids}))
        if (i + 1) % 100 == 0:
            print(f"  ...{i + 1}/{len(docs)}")


def rebuild_driver_index(db):
    print("Rebuilding archive_drivers from the full archive...")
    all_docs = list(db.collection("archive_races").stream())
    drivers = {}
    for doc in all_docs:
        data = doc.to_dict()
        year = data["year"]
        for r in data.get("results", []):
            driver_id = r.get("driverId")
            if not driver_id:
                continue
            entry = drivers.setdefault(
                driver_id,
                {
                    "driverId": driver_id,
                    "name": r.get("driverName"),
                    "code": None,
                    "firstYear": year,
                    "lastYear": year,
                    "raceCount": 0,
                },
            )
            entry["firstYear"] = min(entry["firstYear"], year)
            entry["lastYear"] = max(entry["lastYear"], year)
            entry["raceCount"] += 1
            if r.get("driverCode"):
                entry["code"] = r["driverCode"]
            if r.get("driverName"):
                entry["name"] = r["driverName"]

    print(f"{len(drivers)} unique drivers found; writing archive_drivers")
    batch = db.batch()
    count = 0
    for driver_id, entry in drivers.items():
        batch.set(db.collection("archive_drivers").document(driver_id), entry)
        count += 1
        if count % 400 == 0:
            with_retry(lambda b=batch: b.commit())
            batch = db.batch()
    with_retry(lambda b=batch: b.commit())


def main():
    args = sys.argv[1:]
    if len(args) == 0:
        start, end = None, None
    elif len(args) == 1:
        start = end = int(args[0])
    else:
        start, end = int(args[0]), int(args[1])

    db = init_firestore()
    write_driver_ids(db, start, end)
    rebuild_driver_index(db)
    print("Done.")


if __name__ == "__main__":
    main()
