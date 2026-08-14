"""Builds driver and team indexes for archive's "browse by racer"/"browse by team" facets — pure
Firestore aggregation, no Ergast/Wikipedia/weather calls at all, since driverId/driverName/
constructor are already sitting in every race doc's results[]. Safe to run anytime, including
concurrently with the other three archive enrichment scripts — it touches none of their external
APIs, so there's no shared rate limit to worry about.

(Renamed from enrich_archive_drivers.py once this also started building archive_teams — same
script, wider scope, not two.)

Writes flat `driverIds: string[]` / `teamIds: string[]` fields onto each archive_races doc — the
only way to make "every race this driver/team appears in" a real Firestore query
(`array-contains`) instead of scanning every doc's nested results array by hand — and (re)builds
the small archive_drivers / archive_teams collections from the *entire* archive every run,
regardless of what year range was passed for the driverIds/teamIds write. That split matters: the
per-race write is naturally incremental/resumable (same as every other archive enrichment pass),
but the aggregate indexes have to see every race to be correct — rebuilding them from just
whatever range happens to have been requested would silently truncate them down to that range.

A team's identity here is a slug of its constructor display name (e.g. "Red Bull" -> "red_bull")
— not a stable Ergast constructorId, since that field was never captured by fetch_archive.py.
Real team renames/rebrands (Lotus -> Renault -> Alpine, etc.) end up as separate entries, which
for a historical archive is arguably more correct anyway: those were legally/competitively
distinct entrants, not the same thing wearing a new coat of paint.

Run:
  python enrich_archive_entities.py             # every race missing driverIds/teamIds, full range
  python enrich_archive_entities.py 1994        # a single season
  python enrich_archive_entities.py 1994 2000   # an inclusive year range
"""

import re
import sys

from ergast_utils import init_firestore, with_retry


def team_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def write_entity_ids(db, start, end):
    query = db.collection("archive_races")
    if start is not None:
        query = query.where("year", ">=", start)
    if end is not None:
        query = query.where("year", "<=", end)
    # "teamIds" is the field that matters here, not "driverIds" — every doc already got
    # driverIds from this script's previous incarnation (enrich_archive_drivers.py), so gating on
    # that alone would skip every race and never backfill the new teamIds field onto anything.
    docs = [d for d in query.stream() if "teamIds" not in d.to_dict()]
    print(f"{len(docs)} races need driverIds/teamIds written")
    for i, doc in enumerate(docs):
        results = doc.to_dict().get("results", [])
        driver_ids = [r["driverId"] for r in results if r.get("driverId")]
        team_ids = sorted({team_slug(r["constructor"]) for r in results if r.get("constructor")})
        with_retry(lambda ref=doc.reference, d=driver_ids, t=team_ids: ref.update({"driverIds": d, "teamIds": t}))
        if (i + 1) % 100 == 0:
            print(f"  ...{i + 1}/{len(docs)}")


def rebuild_indexes(db):
    print("Rebuilding archive_drivers/archive_teams from the full archive...")
    all_docs = list(db.collection("archive_races").stream())
    drivers = {}
    teams = {}
    for doc in all_docs:
        data = doc.to_dict()
        year = data["year"]
        # A race has ~2 result rows per team (one per car) — teams_seen_this_race dedupes so a
        # team's raceCount below counts races entered, not result rows/cars entered.
        teams_seen_this_race = set()
        for r in data.get("results", []):
            driver_id = r.get("driverId")
            constructor = r.get("constructor")

            if driver_id:
                entry = drivers.setdefault(
                    driver_id,
                    {
                        "driverId": driver_id,
                        "name": r.get("driverName"),
                        "code": None,
                        "firstYear": year,
                        "lastYear": year,
                        "raceCount": 0,
                        "constructors": set(),  # sorted into a list below — no Firestore set type
                    },
                )
                entry["firstYear"] = min(entry["firstYear"], year)
                entry["lastYear"] = max(entry["lastYear"], year)
                entry["raceCount"] += 1
                if r.get("driverCode"):
                    entry["code"] = r["driverCode"]
                if r.get("driverName"):
                    entry["name"] = r["driverName"]
                if constructor:
                    entry["constructors"].add(constructor)

            if constructor:
                team_id = team_slug(constructor)
                team_entry = teams.setdefault(
                    team_id,
                    {
                        "teamId": team_id,
                        "name": constructor,
                        "firstYear": year,
                        "lastYear": year,
                        "raceCount": 0,
                        "drivers": set(),
                    },
                )
                team_entry["firstYear"] = min(team_entry["firstYear"], year)
                team_entry["lastYear"] = max(team_entry["lastYear"], year)
                if team_id not in teams_seen_this_race:
                    team_entry["raceCount"] += 1
                    teams_seen_this_race.add(team_id)
                if r.get("driverName"):
                    team_entry["drivers"].add(r["driverName"])
                team_entry["name"] = constructor  # keep the most-recently-seen display spelling

    print(f"{len(drivers)} unique drivers, {len(teams)} unique teams found; writing indexes")
    batch = db.batch()
    count = 0
    for driver_id, entry in drivers.items():
        entry["constructors"] = sorted(entry["constructors"])
        batch.set(db.collection("archive_drivers").document(driver_id), entry)
        count += 1
        if count % 400 == 0:
            with_retry(lambda b=batch: b.commit())
            batch = db.batch()
    for team_id, entry in teams.items():
        entry["drivers"] = sorted(entry["drivers"])
        batch.set(db.collection("archive_teams").document(team_id), entry)
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
    write_entity_ids(db, start, end)
    rebuild_indexes(db)
    print("Done.")


if __name__ == "__main__":
    main()
