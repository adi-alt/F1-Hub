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
from datetime import datetime, timedelta, timezone

import psycopg2

from race_identity import REVIEWED_VENUE_CHANGES, VENUE_OVERRIDES
from run_ledger import ledgered


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
        # A retired (cancelled) calendar row can share its round with the live event that replaced
        # it - sync_calendar.py keeps it rather than deleting it; only the live row is comparable.
        "and calendar.status is distinct from 'cancelled' "
        "where races.name != calendar.name or races.race_date != calendar.race_date"
    )
    for race_id, races_name, cal_name, races_date, cal_date in cur.fetchall():
        problems.append(f"{race_id}: races=({races_name!r}, {races_date}) vs calendar=({cal_name!r}, {cal_date})")
    return problems


def audit_freshness(cur) -> list[str]:
    """A race whose own calendar session has clearly finished but still has zero race_results -
    not corrupted data (audit_races/audit_related_tables have nothing to check when nothing was
    ever written), just work that silently stopped happening. This is exactly the shape 2026
    round 15 sat in, undetected, for two days: next_relevant_round() had a real bug (see
    fetch_races.py's own comment) where one earlier round stuck at results_source =
    'openf1_preliminary' past its own retry window made every LATER round stop being selected by
    any tick at all - not delayed, never checked again. That bug is fixed, but this check exists
    so the *next* thing that silently stops a round from being fetched - for whatever reason -
    shows up here as a red CI run within 15 minutes, instead of a user noticing a stale race page
    days later.

    A generous grace period past the race's own last session before flagging anything, so a race
    that finished an hour ago and simply hasn't been fetched yet on this exact tick isn't a false
    alarm - 6 hours comfortably covers this workflow's own real observed cadence (every few hours,
    not always the scheduled 15 minutes - GitHub throttles infrequently-triggered schedules)."""
    problems: list[str] = []
    cur.execute(
        "select races.id, races.status, calendar.sessions, "
        "(select count(*) from race_results where race_results.race_id = races.id) as result_count "
        "from races join calendar on calendar.year = races.year and calendar.round = races.round "
        "and calendar.status is distinct from 'cancelled' "
        "where races.status != 'completed'"
    )
    now = datetime.now(timezone.utc)
    for race_id, status, sessions, result_count in cur.fetchall():
        # Same naive-Timestamp-means-UTC parsing next_relevant_round already relies on - see that
        # function's own comment for why (a real FastF1/sync_calendar.py convention, not a bug).
        dates = []
        for s in sessions or []:
            if not s.get("date"):
                continue
            d = datetime.fromisoformat(s["date"])
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            dates.append(d)
        if not dates:
            continue
        if result_count == 0 and now > max(dates) + timedelta(hours=6):
            days_stale = (now - max(dates)).days
            problems.append(f"{race_id}: race weekend's own last session ended {days_stale}d ago but status is {status!r} with zero race_results")
    return problems


def audit_unfetched_rounds(cur) -> list[str]:
    """A live calendar event whose weekend is clearly over but which has no races row at all. This
    is the blind spot audit_freshness() above cannot see (it starts from `races`), and exactly the
    state 2026 rounds 16-22 would have ended up in: next_relevant_round() used to consider only
    rounds that already had a races row, and nothing but a fetch creates one (audit DATA-01). Same
    6-hour grace period as audit_freshness()."""
    problems: list[str] = []
    cur.execute(
        "select c.id, c.sessions from calendar c "
        "where c.status is distinct from 'cancelled' and not exists ("
        "  select 1 from races r where r.year = c.year "
        "  and regexp_replace(r.id, '^[0-9]{4}_r[0-9]+_', '') = regexp_replace(c.id, '^[0-9]{4}_r[0-9]+_', ''))"
    )
    now = datetime.now(timezone.utc)
    for cal_id, sessions in cur.fetchall():
        dates = []
        for s in sessions or []:
            if not s.get("date"):
                continue
            d = datetime.fromisoformat(s["date"])
            dates.append(d if d.tzinfo else d.replace(tzinfo=timezone.utc))
        if dates and now > max(dates) + timedelta(hours=6):
            problems.append(f"{cal_id}: race weekend ended {(now - max(dates)).days}d ago but no races row exists - never fetched")
    return problems


def audit_venue_drift(cur) -> list[str]:
    """WARNINGS, not failures: an event whose location this season differs from its previous
    season's. Upstream naming drifts harmlessly (Yas Island/Yas Marina, Monaco/Monte Carlo) and venues
    genuinely move (Madrid 2026; Bahrain 2026, relocated to Sepang), so this cannot fail the job - it
    is how a change gets looked at by a person instead of shipped unexamined. Changes a person has
    verified (race_identity.REVIEWED_VENUE_CHANGES) are not repeated while the stored value still
    matches what was reviewed; a reviewed correction (VENUE_OVERRIDES) is reported until applied."""
    warnings: list[str] = []
    cur.execute(
        "with ev as ("
        "  select year, regexp_replace(id, '^[0-9]{4}_r[0-9]+_', '') as slug, circuit from races "
        "  union select year, regexp_replace(id, '^[0-9]{4}_r[0-9]+_', ''), circuit from calendar where status is distinct from 'cancelled'"
        "), cur as (select year, slug, circuit from ev where year = (select max(year) from ev)) "
        "select cur.year, cur.slug, cur.circuit, prev.circuit from cur "
        "join lateral (select circuit from ev where ev.slug = cur.slug and ev.year < cur.year order by ev.year desc limit 1) prev on true "
        "where prev.circuit is distinct from cur.circuit"
    )
    for year, slug, circuit, prev in cur.fetchall():
        override = VENUE_OVERRIDES.get((year, slug))
        if override:
            if circuit != override.get("location"):
                warnings.append(f"{year} {slug}: stored location {circuit!r}, reviewed correction is {override.get('location')!r} - not applied yet (next sync_calendar run)")
            continue
        reviewed = REVIEWED_VENUE_CHANGES.get((year, slug))
        if reviewed and circuit == reviewed.get("location"):
            continue
        warnings.append(f"{year} {slug}: location {circuit!r}, previous season {prev!r} - verify it: a real change goes in REVIEWED_VENUE_CHANGES, a wrong upstream value in VENUE_OVERRIDES")
    return warnings


@ledgered("data-audit")
def main() -> int:
    conn = _connect()
    try:
        with conn.cursor() as cur:
            problems = audit_races(cur) + audit_related_tables(cur) + audit_calendar_alignment(cur) + audit_freshness(cur) + audit_unfetched_rounds(cur)
            warnings = audit_venue_drift(cur)
    finally:
        conn.close()

    for w in warnings:
        print(f"audit_data_consistency: WARNING {w}")

    if not problems:
        print("audit_data_consistency: no issues found")
        return 0

    print(f"audit_data_consistency: {len(problems)} issue(s) found")
    for p in problems:
        print(f"  - {p}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
