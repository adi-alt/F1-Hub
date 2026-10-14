"""One pass that fills qualifying_results (stage-by-stage Q1/Q2/Q3, and SQ1/SQ2/SQ3 on sprint weekends) for a
season's rounds that already had qualifying before the table existed. fetch_races.py stores them from then on.

Grand Prix qualifying from Jolpica's official classification; sprint qualifying from OpenF1 (the only source), stored
as source='openf1'. Pinned to each round by date. Idempotent: per round, one transaction of upsert plus a prune
scoped to the sessions written, so a re-run rewrites the same rows.

--dry-run reads in a read-only transaction and writes nothing; it prints what each round would get.

Run:
  export DATABASE_URL='<see .env.local>'
  python pipeline/backfill_qualifying_stages.py 2026 --dry-run
  python pipeline/backfill_qualifying_stages.py 2026
"""
from __future__ import annotations

import sys

from ergast_utils import init_postgres, prune, transaction, upsert
from fetch_races import SPRINT_FORMATS, normalize_team_name
from qualifying_sessions import qualifying_result_rows, stages_for_round

ROUNDS_SQL = """
select r.id, r.round, c.race_date, c.country, c.event_format
  from races r
  join calendar c on c.id = r.id
 where r.year = %s
   and r.pole_sitter is not null
   and c.status is distinct from 'cancelled'
 order by r.round
"""


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv
    if len(args) != 1:
        raise SystemExit("usage: backfill_qualifying_stages.py <year> [--dry-run]")
    year = int(args[0])
    conn = init_postgres()
    if dry_run:
        conn.set_session(readonly=True, autocommit=False)
    cur = conn.cursor()
    cur.execute(ROUNDS_SQL, (year,))
    rounds = cur.fetchall()
    print(f"{year}: {len(rounds)} round(s) with qualifying{' (dry run: nothing is written)' if dry_run else ''}")
    missing = []
    for race_id, round_num, race_date, country, event_format in rounds:
        sprint_weekend = str(event_format or "").lower() in SPRINT_FORMATS
        sessions = stages_for_round(year, round_num, country, race_date, sprint_weekend, {})
        got = {s for s, _r, _src in sessions}
        want = {"Q", "SQ"} if sprint_weekend else {"Q"}
        if want - got:
            missing.append((round_num, sorted(want - got)))
        summary = "; ".join(f"{s} {len(rows)} cars ({src}), pole {rows[0]['driver']} {rows[0]['stages'][rows[0]['stageReached'] - 1]}" for s, rows, src in sessions)
        print(f"  round {round_num} {race_id}: {summary or 'nothing available'}")
        if dry_run or not sessions:
            continue
        written = [row for s, rows, src in sessions for row in qualifying_result_rows(race_id, s, rows, src, team_of=normalize_team_name)]
        with transaction(cur):
            upsert(cur, "qualifying_results", written, ["race_id", "session", "driver"])
            prune(cur, "qualifying_results", "race_id", race_id, ("session", "driver"), [(r["session"], r["driver"]) for r in written])
    if missing:
        print(f"not available (left empty, nothing invented): {missing}")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
