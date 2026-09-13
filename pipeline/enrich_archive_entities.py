"""Builds driver and team indexes for archive's "browse by racer"/"browse by team" facets — pure
Postgres aggregation, no Ergast/Wikipedia/weather calls at all, since driver_id/driver_name/
constructor already live on every archive_results row. Safe to run anytime, including
concurrently with the other three archive enrichment scripts — it touches none of their external
APIs, so there's no shared rate limit to worry about.

(Renamed from enrich_archive_drivers.py once this also started building archive_teams — same
script, wider scope, not two.)

The old Firestore version also wrote flat `driverIds: string[]` / `teamIds: string[]` fields onto
each archive_races doc — the only way to make "every race this driver/team appears in" a real
Firestore query (`array-contains`) instead of scanning every doc's nested results array by hand.
Postgres never needed that workaround: `getArchiveRacesByDriver`/`getArchiveRacesByTeam` are real
joins against archive_results, so that whole function is gone, not ported. What's still genuinely
needed from this script is archive_results.team_id itself (the resolved slug the FK from
archive_results to archive_teams depends on) and the archive_drivers/archive_teams tables — both
rebuilt from the *entire* archive every run, not just whatever range was requested: the aggregate
indexes have to see every race to be correct.

A team's identity here is a slug of its constructor display name (e.g. "Red Bull" -> "red_bull")
— not a stable Ergast constructorId, since that field was never captured by fetch_archive.py.
Real team renames/rebrands (Lotus -> Renault -> Alpine, etc.) end up as separate entries, which
for a historical archive is arguably more correct anyway: those were legally/competitively
distinct entrants, not the same thing wearing a new coat of paint. The reverse case — the same
display name reused decades later for a genuinely different team ("Mercedes" 1954-55 vs. the
2010-on Brackley team, "Alfa Romeo" 1950/79-85 vs. Sauber's 2019-23 title sponsorship, etc.) —
gets a small explicit carve-out instead: see EARLY_ERA_OVERRIDES below.

Run:
  export DATABASE_URL='<the pooled connection string, see .env.local>'
  python enrich_archive_entities.py
"""

import re

from ergast_utils import init_postgres, trigger_revalidation, upsert

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


def rebuild_indexes(cur):
    print("Rebuilding archive_drivers/archive_teams from the full archive...")
    cur.execute(
        "select ar.id, ar.year, res.driver_id, res.driver_name, res.driver_code, res.constructor "
        "from archive_results res join archive_races ar on ar.id = res.archive_race_id"
    )
    drivers = {}
    teams = {}
    # A race has ~2 result rows per team (one per car) - dedupes so a team's raceCount counts
    # races entered, not result rows/cars entered. One set for the whole run, keyed on
    # (team_id, archive_race_id) - rows here are flat, not grouped by race the way the Firestore
    # nested results array naturally was, so there's no per-race loop to reset it between.
    team_races_seen = set()
    for archive_race_id, year, driver_id, driver_name, driver_code, constructor in cur.fetchall():
        if constructor:
            constructor = CONSTRUCTOR_CANONICALIZATION.get(constructor, constructor)

        if driver_id:
            entry = drivers.setdefault(
                driver_id,
                {
                    "driverId": driver_id,
                    "name": driver_name,
                    "code": None,
                    "firstYear": year,
                    "lastYear": year,
                    "raceCount": 0,
                    "constructors": set(),
                },
            )
            entry["firstYear"] = min(entry["firstYear"], year)
            entry["lastYear"] = max(entry["lastYear"], year)
            entry["raceCount"] += 1
            if driver_code:
                entry["code"] = driver_code
            if driver_name:
                entry["name"] = driver_name
            if constructor:
                entry["constructors"].add(constructor)

        if constructor:
            team_id = team_slug(constructor, year)
            team_entry = teams.setdefault(
                team_id,
                {"teamId": team_id, "name": constructor, "firstYear": year, "lastYear": year, "raceCount": 0, "drivers": set()},
            )
            team_entry["firstYear"] = min(team_entry["firstYear"], year)
            team_entry["lastYear"] = max(team_entry["lastYear"], year)
            race_key = (team_id, archive_race_id)
            if race_key not in team_races_seen:
                team_entry["raceCount"] += 1
                team_races_seen.add(race_key)
            if driver_name:
                team_entry["drivers"].add(driver_name)
            team_entry["name"] = constructor  # keep the most-recently-seen display spelling

    print(f"{len(drivers)} unique drivers, {len(teams)} unique teams found; writing indexes")

    driver_rows = [
        {
            "driver_id": d["driverId"],
            "name": d["name"],
            "code": d["code"],
            "first_year": d["firstYear"],
            "last_year": d["lastYear"],
            "race_count": d["raceCount"],
            "constructors": sorted(d["constructors"]),
        }
        for d in drivers.values()
    ]
    upsert(cur, "archive_drivers", driver_rows, ["driver_id"])

    team_rows = [
        {
            "team_id": t["teamId"],
            "name": t["name"],
            "first_year": t["firstYear"],
            "last_year": t["lastYear"],
            "race_count": t["raceCount"],
            "drivers": sorted(t["drivers"]),
        }
        for t in teams.values()
    ]
    upsert(cur, "archive_teams", team_rows, ["team_id"])

    # Full-overwrite semantics every run (see module docstring): upsert only adds/updates, it never
    # removes a row this run no longer produces - the exact bug that let stale "mclaren_ford"-style
    # rows linger in Firestore after CONSTRUCTOR_CANONICALIZATION stopped generating them. Deleting
    # anything not in this run's own id set closes that gap for good.
    cur.execute("select driver_id from archive_drivers")
    stale_drivers = [row[0] for row in cur.fetchall() if row[0] not in drivers]
    cur.execute("select team_id from archive_teams")
    stale_teams = [row[0] for row in cur.fetchall() if row[0] not in teams]
    if stale_drivers:
        print(f"removing {len(stale_drivers)} stale driver rows")
        cur.execute("delete from archive_drivers where driver_id = any(%s)", (stale_drivers,))
    if stale_teams:
        print(f"removing {len(stale_teams)} stale team rows")
        cur.execute("delete from archive_teams where team_id = any(%s)", (stale_teams,))

    return teams


def update_team_ids(cur, known_team_ids):
    """archive_results.team_id itself - the resolved slug the FK to archive_teams depends on.
    Recomputes from today's team_slug() logic rather than only filling in nulls, so a newly added
    CONSTRUCTOR_CANONICALIZATION/EARLY_ERA_OVERRIDES entry corrects rows that already had a
    (now-stale) team_id, not just ones that never got one."""
    cur.execute(
        "select res.archive_race_id, res.driver_id, res.constructor, res.team_id, ar.year "
        "from archive_results res join archive_races ar on ar.id = res.archive_race_id "
        "where res.constructor is not null"
    )
    to_update = []
    for archive_race_id, driver_id, constructor, current_team_id, year in cur.fetchall():
        new_team_id = team_slug(constructor, year)
        if new_team_id != current_team_id and new_team_id in known_team_ids:
            to_update.append((new_team_id, archive_race_id, driver_id))

    print(f"{len(to_update)} archive_results rows need team_id recomputed")
    for new_team_id, archive_race_id, driver_id in to_update:
        cur.execute(
            "update archive_results set team_id = %s where archive_race_id = %s and driver_id = %s",
            (new_team_id, archive_race_id, driver_id),
        )


def main():
    conn = init_postgres()
    with conn.cursor() as cur:
        known_team_ids = rebuild_indexes(cur)
        update_team_ids(cur, known_team_ids)
    conn.close()
    trigger_revalidation()
    print("Done.")


if __name__ == "__main__":
    main()
