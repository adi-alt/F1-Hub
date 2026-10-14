"""One pass that fills sprint_results for a season's completed sprint weekends (audit R-17).

fetch_races.py stores a sprint from now on, but it never revisits a completed round, so the sprints
that ran before sprint_results existed need this once - five in 2026 (China, Miami, Canada, Britain
and the Netherlands), worth 180 championship points the standings have never counted.

Official data only (Jolpica), pinned to each round by its date like every other Jolpica read. Each
driver's team is taken from the same round's stored race result, so a constructor's sprint and race
points always add up under one name. Idempotent: an upsert plus prune per round, so a re-run
rewrites the same rows.

--dry-run reads the database in a read-only transaction and writes nothing. It prints what would be
written, and the driver standings the app would show afterwards next to Jolpica's official ones.

Run:
  export DATABASE_URL='<see .env.local>'
  python pipeline/backfill_sprint_results.py 2026 --dry-run
  python pipeline/backfill_sprint_results.py 2026
"""

from __future__ import annotations

import sys
from collections import defaultdict

import jolpica
from ergast_utils import init_postgres, prune, upsert
from fetch_races import load_roster, official_sprint_rows, sprint_result_rows, SPRINT_FORMATS

COMPLETED_SPRINT_ROUNDS_SQL = """
select r.id, r.round, c.race_date
  from races r
  join calendar c on c.id = r.id
 where r.year = %s
   and r.status = 'completed'
   and c.status is distinct from 'cancelled'
   and c.event_format = any(%s)
 order by r.round
"""


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv
    if len(args) != 1:
        raise SystemExit("usage: backfill_sprint_results.py <year> [--dry-run]")
    year = int(args[0])

    conn = init_postgres()
    if dry_run:
        conn.set_session(readonly=True, autocommit=False)
    cur = conn.cursor()
    roster = load_roster(cur)
    cur.execute(COMPLETED_SPRINT_ROUNDS_SQL, (year, list(SPRINT_FORMATS)))
    rounds = cur.fetchall()
    print(f"{year}: {len(rounds)} completed sprint weekend(s){' (dry run: nothing is written)' if dry_run else ''}")

    sprint_points: dict[str, float] = defaultdict(float)
    failed = []
    for race_id, round_num, race_date in rounds:
        official = jolpica.fetch_sprint(year, round_num, race_date)
        if not official:
            print(f"  round {round_num} {race_id}: no official sprint classification - skipped")
            failed.append(round_num)
            continue
        cur.execute("select driver, team from race_results where race_id = %s", (race_id,))
        team_by_driver = dict(cur.fetchall())
        rows = official_sprint_rows(official, roster)
        unmatched = sorted(r["driver"] for r in rows if r["driver"] not in team_by_driver)
        for r in rows:
            r["team"] = team_by_driver.get(r["driver"], r["team"])
            sprint_points[r["driver"]] += r["points"]
        top3 = ", ".join(f"{r['finishPosition']}. {r['driver']} {r['points']:g}" for r in rows[:3])
        print(
            f"  round {round_num} {race_id}: {len(rows)} cars, {sum(r['points'] for r in rows):g} points ({top3})"
            + (f"; no race result to take a team from for {unmatched}" if unmatched else "")
        )
        if not dry_run:
            stored = sprint_result_rows(race_id, rows, "official")
            upsert(cur, "sprint_results", stored, ["race_id", "driver"])
            prune(cur, "sprint_results", "race_id", race_id, "driver", [r["driver"] for r in stored])

    # What the championship would read afterwards, next to the official standings.
    cur.execute(
        "select rr.driver, sum(rr.points)::float from race_results rr join races r on r.id = rr.race_id "
        "where r.year = %s and r.status = 'completed' group by 1",
        (year,),
    )
    totals = {driver: points + sprint_points.get(driver, 0.0) for driver, points in cur.fetchall()}
    for driver, points in sprint_points.items():
        totals.setdefault(driver, points)
    try:
        standings = jolpica._get(f"{year}/driverstandings.json")["StandingsTable"]["StandingsLists"][0]
        official_totals = {d["Driver"]["code"]: float(d["points"]) for d in standings["DriverStandings"]}
        differences = {
            code: (totals.get(code, 0.0), official_totals.get(code, 0.0))
            for code in set(totals) | set(official_totals)
            if abs(totals.get(code, 0.0) - official_totals.get(code, 0.0)) > 0.001
        }
        print(
            f"driver standings with sprints vs Jolpica's official ones after round {standings['round']}: "
            + ("identical for every driver" if not differences else f"{len(differences)} differ: {differences}")
        )
    except Exception as exc:
        print(f"could not compare against the official standings ({exc})")

    if dry_run:
        conn.rollback()
    conn.close()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
