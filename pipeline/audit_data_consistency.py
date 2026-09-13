"""Read-only sanity pass over `races`/`race_results`/`race_inputs`/`tire_stints`/`race_laps`/
`calendar`, run as the last step of every fetch-races.yml tick (see that workflow) so a data bug
shaped like 2026 round 14's shows up in the Actions log within 15 minutes of being written, instead
of waiting for a user to notice a wrong winner in the UI.

This is deliberately a *shape* check, not a re-derivation of the pipeline's own logic: it looks for
signatures that are essentially impossible in a real, correctly-fetched Grand Prix (two drivers
classified in the same position, every entrant retiring, a pole sitter who isn't even in the
results) rather than trying to re-verify any specific number. New failure modes nobody has thought
of yet are far more likely to trip one of these generic checks than to be missed by all of them -
that's the point of keeping this intentionally dumb rather than growing it into a second copy of
fetch_races.py's own reasoning.

Exit code is nonzero the moment anything is found, which fails this workflow step and shows up red
in the Actions tab / any notification wired to job failure - the pipeline's actual writes (the
steps before this one) already happened and are not rolled back; this is a smoke alarm, not a
transaction guard. Run by hand any time with `python pipeline/audit_data_consistency.py`.
"""

from __future__ import annotations

import os
import sys
from collections import Counter, defaultdict

import psycopg2


def _connect():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set.")
    return psycopg2.connect(url)


def audit_races(cur) -> list[str]:
    """One problem string per race that fails a check - empty if everything looks like a real,
    internally-consistent Grand Prix."""
    problems: list[str] = []

    cur.execute("select id, status, pole_sitter from races")
    races = {r[0]: {"status": r[1], "pole_sitter": r[2]} for r in cur.fetchall()}

    cur.execute("select race_id, driver, finish_position, status, points, grid from race_results")
    by_race: dict[str, list[tuple]] = defaultdict(list)
    for row in cur.fetchall():
        by_race[row[0]].append(row)

    for race_id, rows in by_race.items():
        race = races.get(race_id)
        if race is None:
            # A foreign key (race_results.race_id references races.id) makes this impossible in
            # practice - checked anyway since a manual DB edit or a future schema change is exactly
            # the kind of thing this audit exists to catch, not assume away.
            problems.append(f"{race_id}: {len(rows)} race_results row(s) with no matching races row")
            continue
        if race["status"] != "completed":
            problems.append(f"{race_id}: has {len(rows)} race_results row(s) but status={race['status']!r}")

        positions = [r[2] for r in rows]
        dup_positions = {p: c for p, c in Counter(positions).items() if c > 1}
        if dup_positions:
            problems.append(f"{race_id}: duplicate finish_position(s) {dup_positions}")

        drivers = [r[1] for r in rows]
        dup_drivers = {d: c for d, c in Counter(drivers).items() if c > 1}
        if dup_drivers:
            problems.append(f"{race_id}: duplicate driver(s) {dup_drivers}")

        if sorted(positions) != list(range(1, len(rows) + 1)):
            problems.append(f"{race_id}: finish_position values aren't a clean 1..{len(rows)} run: {sorted(positions)}")

        # A real Grand Prix has finishers. All 20-24 entrants retiring in the same race has never
        # happened in F1 history - this is the exact signature 2026 round 14 had (a FastF1 frame
        # with no published Status yet, read by normalize_status() as "dnf" for everyone).
        if len(rows) > 3 and all(r[3] == "dnf" for r in rows):
            problems.append(f"{race_id}: all {len(rows)} classified drivers are 'dnf'")

        # NaN points would already be rejected by the race_results_points_not_nan check constraint
        # (supabase/schema.sql) - re-checked here anyway as a second, independent line of defense,
        # and because a NaN reaching this query at all would mean that constraint itself regressed.
        if any(r[4] != r[4] for r in rows):  # NaN != NaN is the one float value this is true for
            problems.append(f"{race_id}: NaN points value present")

        if len(rows) > 3 and all(r[5] is None for r in rows):
            problems.append(f"{race_id}: every result row has a null grid position")

        pole_sitter = race["pole_sitter"]
        if pole_sitter and pole_sitter not in {d for d in drivers}:
            problems.append(f"{race_id}: pole_sitter {pole_sitter!r} does not appear in its own race_results")

    return problems


def audit_related_tables(cur) -> list[str]:
    """tire_stints/race_laps each key on race_id too - a stale row surviving a corrected re-fetch
    under a wrong reading of the race (exactly what happened to round 14's tire_stints/race_laps
    before `prune()` existed, see ergast_utils.py) shows up here as a driver who set tire stints
    but was never actually classified in the race.

    race_inputs is deliberately NOT checked this way: a driver can genuinely qualify (get a
    race_inputs row) and then not start the race at all - grid penalties aside, a real DNS gets no
    race_results row (fetch_race()'s own "no classified Position" skip, see its docstring), so
    "present in race_inputs, absent from race_results" is not a defect there, it happens for real
    (confirmed live: Schumacher 2022 Saudi Arabia, Stroll twice, Mazepin 2021 Abu Dhabi). A driver
    with real tire stint data, by contrast, was physically on track, so must be classified too -
    there's no legitimate reason for that pairing to miss."""
    problems: list[str] = []

    cur.execute("select race_id, array_agg(distinct driver) from race_results group by race_id")
    roster_by_race = {r[0]: set(r[1]) for r in cur.fetchall()}

    cur.execute("select race_id, driver from tire_stints")
    for race_id, driver in cur.fetchall():
        roster = roster_by_race.get(race_id)
        if roster and driver not in roster:
            problems.append(f"tire_stints: {race_id} has driver {driver!r} not present in that race's own race_results")

    cur.execute(
        "select race_laps.race_id, count(distinct race_laps.lap_number) "
        "from race_laps join races on races.id = race_laps.race_id "
        "where races.status = 'completed' group by race_laps.race_id"
    )
    lap_counts = dict(cur.fetchall())
    cur.execute("select race_id, count(*) from race_results where status != 'dnf' group by race_id")
    classified_counts = dict(cur.fetchall())
    for race_id, laps in lap_counts.items():
        classified = classified_counts.get(race_id, 0)
        # A finished/lapped classification always completes at least one full lap - a race_laps
        # table with zero distinct lap numbers for a race that has classified finishers is exactly
        # the "wrong meeting's lap data" shape, not a legitimate zero-lap race.
        if classified > 0 and laps == 0:
            problems.append(f"race_laps: {race_id} has {classified} classified finisher(s) but zero recorded laps")

    return problems


def audit_calendar_alignment(cur) -> list[str]:
    """races and calendar are two independently-written tables for the same (year, round) rows
    (fetch_races.py and sync_calendar.py respectively) - a name/date drift between them means one
    of the two was fed the wrong event, the same root shape as the meeting-selection bug."""
    problems: list[str] = []
    cur.execute(
        "select races.id, races.name, calendar.name, races.race_date, calendar.race_date "
        "from races join calendar on calendar.year = races.year and calendar.round = races.round "
        "where races.name != calendar.name or races.race_date != calendar.race_date"
    )
    for race_id, races_name, cal_name, races_date, cal_date in cur.fetchall():
        problems.append(f"{race_id}: races=({races_name!r}, {races_date}) vs calendar=({cal_name!r}, {cal_date})")
    return problems


def main() -> int:
    conn = _connect()
    try:
        with conn.cursor() as cur:
            problems = audit_races(cur) + audit_related_tables(cur) + audit_calendar_alignment(cur)
    finally:
        conn.close()

    if not problems:
        print("audit_data_consistency: no issues found")
        return 0

    print(f"audit_data_consistency: {len(problems)} issue(s) found")
    for p in problems:
        print(f"  - {p}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
