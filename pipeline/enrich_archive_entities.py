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
distinct entrants, not the same thing wearing a new coat of paint. The reverse case — the same
display name reused decades later for a genuinely different team ("Mercedes" 1954-55 vs. the
2010-on Brackley team, "Alfa Romeo" 1950/79-85 vs. Sauber's 2019-23 title sponsorship, etc.) —
gets a small explicit carve-out instead: see EARLY_ERA_OVERRIDES below.

Run:
  python enrich_archive_entities.py             # every race missing driverIds/teamIds, full range
  python enrich_archive_entities.py 1994        # a single season
  python enrich_archive_entities.py 1994 2000   # an inclusive year range
"""

import re
import sys

from ergast_utils import init_firestore, with_retry

# A handful of display names have been reused, decades apart, for a genuinely different
# real-world team — not a rename of the same outfit, just the same name coming back. team_slug()
# alone can't tell "Mercedes" 1954-55 (their own works team) from "Mercedes" 2010-on (the
# Brackley team, ex-Tyrrell/BAR/Honda/Brawn, Mercedes-badged since buying in) apart; same story
# for the other four below. Found by scanning the whole archive for any display name with a
# >=10-year gap between appearances — a small, explicit list of *confirmed* real-world collisions,
# not a general year-gap heuristic, since misclassifying an actual same-team multi-year hiatus
# would be worse than leaving a rare footnote team merged.
#
# Each entry only carves out the early, unrelated era under its own id; the current/better-known
# era keeps the plain slug so nothing downstream (personalization's current-season merge, archive
# hrefs) needs to know this table exists.
EARLY_ERA_OVERRIDES = [
    # (display name, last year of the early era, id for that early era)
    ("Alfa Romeo", 1985, "alfa_romeo_works"),  # 1950/51/63/65, 79-85 factory team; 2019-23 is Sauber's title sponsorship
    ("Aston Martin", 1960, "aston_martin_1959"),  # 1959-60 works cars; 2021-on is the Force India/Racing Point lineage
    ("Mercedes", 1955, "mercedes_1954"),  # 1954-55 works team; 2010-on is the Tyrrell/BAR/Honda/Brawn lineage
    ("Honda", 1968, "honda_1964"),  # 1964-68 works team; 2006-08 inherited BAR's chassis/staff, not a revival of this
    ("Renault", 1985, "renault_1977"),  # 1977-85 French works team; 2002-on is the Benetton-bought Enstone team
]
COLLISION_NAMES = {name for name, _, _ in EARLY_ERA_OVERRIDES}

# The opposite problem: several classic-era constructors have their engine supplier tacked onto
# the display name for only *some* seasons (Ergast's own inconsistency, not a real team change) —
# e.g. plain "Brabham" for most of 1962-92, but "Brabham-Ford"/"-Climax"/"-Repco"/"-BRM"/"-Alfa
# Romeo" for the in-between years an engine name got appended. Left alone, this fragments what's
# really one continuous constructor across several archive_teams rows — confirmed against real
# numbers: McLaren (still racing today) showed only 952 races from 1968, missing 59 more from
# 1966-70 under three engine-suffixed names, and a two-year-late debut year. Canonicalizing to the
# base name here also matches how the FIA's own Constructors' Championship has always credited
# entries: by chassis (or chassis+engine at the time), not by which specific season's records
# happened to spell out the engine too.
CONSTRUCTOR_CANONICALIZATION = {
    "McLaren-Ford": "McLaren", "McLaren-Serenissima": "McLaren", "McLaren-BRM": "McLaren", "McLaren-Alfa Romeo": "McLaren",
    "Brabham-Climax": "Brabham", "Brabham-BRM": "Brabham", "Brabham-Ford": "Brabham",
    "Brabham-Repco": "Brabham", "Brabham-Alfa Romeo": "Brabham",
    "Cooper-Climax": "Cooper", "Cooper-Maserati": "Cooper", "Cooper-Borgward": "Cooper", "Cooper-OSCA": "Cooper",
    "Cooper-Castellotti": "Cooper", "Cooper-Alfa Romeo": "Cooper", "Cooper-Ferrari": "Cooper",
    "Cooper-ATS": "Cooper", "Cooper-BRM": "Cooper",
    "BRM-Ford": "BRM",
    "March-Ford": "March", "March-Alfa Romeo": "March",
    "Shadow-Ford": "Shadow", "Shadow-Matra": "Shadow",
    "Eagle-Climax": "Eagle", "Eagle-Weslake": "Eagle",  # no bare "Eagle" ever appears; this is the real-world name
    "Matra-Ford": "Matra",
    "De Tomaso-Osca": "De Tomaso", "De Tomaso-Alfa Romeo": "De Tomaso",
    "LDS-Alfa Romeo": "LDS", "LDS-Climax": "LDS",
    # Ergast recorded Colin Chapman's works team as "Team Lotus" for most of 1958-94, but as a
    # bare chassis+engine "Lotus-X" name for several 1960s seasons — canonicalizing those to
    # "Team Lotus" specifically, NOT bare "Lotus", since that string already belongs (correctly,
    # as its own separate row) to the unrelated 2010-11 revival team.
    "Lotus-Climax": "Team Lotus", "Lotus-Maserati": "Team Lotus", "Lotus-BRM": "Team Lotus",
    "Lotus-Borgward": "Team Lotus", "Lotus-Ford": "Team Lotus",
    "Lotus-Pratt &amp; Whitney": "Team Lotus",  # exact raw string, incl. the unescaped &amp; from the original fetch
}


def team_slug(name: str, year: int) -> str:
    name = CONSTRUCTOR_CANONICALIZATION.get(name, name)
    for ctor_name, cutoff_year, early_id in EARLY_ERA_OVERRIDES:
        if name == ctor_name and year <= cutoff_year:
            return early_id
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
    # Also force a recompute for any race carrying one of the EARLY_ERA_OVERRIDES names, even if
    # teamIds was already written before that table existed — otherwise an old, wrongly-merged id
    # would stick around on the race doc forever even after archive_teams itself gets fixed below.
    def needs_write(data):
        if "teamIds" not in data:
            return True
        return any(
            r.get("constructor") in COLLISION_NAMES or r.get("constructor") in CONSTRUCTOR_CANONICALIZATION
            for r in data.get("results", [])
        )

    docs = [d for d in query.stream() if needs_write(d.to_dict())]
    print(f"{len(docs)} races need driverIds/teamIds written")
    for i, doc in enumerate(docs):
        data = doc.to_dict()
        results = data.get("results", [])
        driver_ids = [r["driverId"] for r in results if r.get("driverId")]
        team_ids = sorted({team_slug(r["constructor"], data["year"]) for r in results if r.get("constructor")})
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
            if constructor:
                constructor = CONSTRUCTOR_CANONICALIZATION.get(constructor, constructor)

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
                team_id = team_slug(constructor, year)
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

    # These collections are meant to be a full overwrite every run (see module docstring), but
    # .set() on a computed id only ever adds/updates — it never removes a doc whose id this run
    # no longer produces. That happened for real: adding CONSTRUCTOR_CANONICALIZATION made ids
    # like "mclaren_ford" stop being generated, but the old docs kept sitting in Firestore until
    # deleted by hand. Deleting anything not in this run's own id set closes that gap for good.
    stale_drivers = [
        doc.reference for doc in db.collection("archive_drivers").select([]).stream() if doc.id not in drivers
    ]
    stale_teams = [doc.reference for doc in db.collection("archive_teams").select([]).stream() if doc.id not in teams]
    if stale_drivers or stale_teams:
        print(f"removing {len(stale_drivers)} stale driver docs, {len(stale_teams)} stale team docs")
        batch = db.batch()
        count = 0
        for ref in stale_drivers + stale_teams:
            batch.delete(ref)
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
