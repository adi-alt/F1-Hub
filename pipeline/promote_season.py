"""Promotes a finished season into the archive (audit R-22): fetches and enriches it with the same scripts
the historical archive was built with, so /archive gains last season without anyone remembering to run
five scripts by hand each winter.

A season is promoted when every round on its calendar has a completed race with an official result, and the
archive doesn't yet hold it completely (every round present, enriched, with circuit and lap data). Both
checks are by data, not by date, so the job is safe to schedule across December and January and to run
again: a season that is unfinished, or already fully archived, is left alone. Every step it runs is
idempotent and skips what it already has.

  DATABASE_URL=... python promote_season.py                 # every finished, not-yet-archived season
  DATABASE_URL=... python promote_season.py 2026            # just that season (still only if it is finished)
  DATABASE_URL=... python promote_season.py --dry-run       # say what would run, change nothing
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from ergast_utils import init_postgres

HERE = Path(__file__).resolve().parent
LAPS_FROM_YEAR = 1996  # enrich_archive_laps: Ergast has lap timing from 1996

# In this order: the base rows first, then what reads them. Entities is pure aggregation, so it goes last.
STEPS = ["fetch_archive.py", "enrich_archive.py", "enrich_archive_circuits.py", "enrich_archive_laps.py", "enrich_archive_entities.py"]


def plan_for_year(year: int, rounds: int, official: int, archive: dict) -> tuple[str, str]:
    """('skip' | 'promote', why) from counts only, so the rule is testable without a database.

    `archive` holds the counts of archive_races rows for the year: rows, enriched, with circuit, with laps."""
    if rounds == 0:
        return "skip", "no calendar for this season"
    if official < rounds:
        return "skip", f"not finished: {official} of {rounds} rounds have an official result"
    needs_laps = year >= LAPS_FROM_YEAR
    complete = (
        archive["rows"] >= rounds
        and archive["enriched"] >= archive["rows"]
        and archive["circuits"] >= archive["rows"]
        and (not needs_laps or archive["laps"] >= archive["rows"])
    )
    if complete:
        return "skip", f"already archived ({archive['rows']} rounds, enriched, with circuits and laps)"
    return "promote", f"finished ({official} of {rounds} rounds official), archive has {archive['rows']} rows"


def season_counts(cur, year: int) -> tuple[int, int, dict]:
    cur.execute(
        "select count(distinct c.round), "
        "count(distinct c.round) filter (where r.status = 'completed' and r.results_source = 'official') "
        "from calendar c left join races r on r.year = c.year and r.round = c.round where c.year = %s",
        (year,),
    )
    rounds, official = cur.fetchone()
    cur.execute(
        "select count(*), count(*) filter (where enriched_at is not null), count(*) filter (where circuit_id is not null), "
        "count(*) filter (where laps_backfilled) from archive_races where year = %s",
        (year,),
    )
    rows, enriched, circuits, laps = cur.fetchone()
    return rounds, official, {"rows": rows, "enriched": enriched, "circuits": circuits, "laps": laps}


def candidate_years(cur, only: int | None) -> list[int]:
    if only is not None:
        return [only]
    cur.execute("select distinct year from calendar order by year")
    return [y for (y,) in cur.fetchall()]


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv[1:]
    only = int(args[0]) if args else None

    conn = init_postgres()
    todo = []
    with conn.cursor() as cur:
        for year in candidate_years(cur, only):
            rounds, official, archive = season_counts(cur, year)
            action, why = plan_for_year(year, rounds, official, archive)
            print(f"{year}: {action} - {why}")
            if action == "promote":
                todo.append(year)
    conn.close()

    for year in todo:
        for step in STEPS:
            command = [sys.executable, str(HERE / step)] + ([] if step == "enrich_archive_entities.py" else [str(year)])
            print(f"  {'would run' if dry_run else 'running'}: {' '.join(Path(command[1]).name.split() + command[2:])}")
            if dry_run:
                continue
            result = subprocess.run(command, cwd=HERE, check=False)
            if result.returncode != 0:
                print(f"{step} failed for {year} (exit {result.returncode}); stopping here, the next run resumes", file=sys.stderr)
                return 1
    print("Done." if todo else "Nothing to promote.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
