"""Fills archive_sprint_results with past seasons' sprints (2021 onwards) from Jolpica's official classifications, and
checks each season against Jolpica's official driver standings afterwards.

archive_results holds Grand Prix results only, so every archive season since sprints began has been missing its
sprint points (18 in 2021, 108 in 2022, 216 a year since). Rows are shaped like archive_results: Jolpica's driverId
is the archive's driver_id, and the team id is team_slug() as enrich_archive_entities.py derives it (left null when
that slug isn't an archive_teams row, rather than inventing one).

Idempotent: per race, one transaction of upsert plus prune, so a re-run rewrites the same rows. --dry-run reads in a
read-only transaction and writes nothing; the reconciliation it prints then shows the standings as they would be.

Run:
  export DATABASE_URL='<see .env.local>'
  python pipeline/backfill_archive_sprints.py 2021 2022 2023 2024 2025 --dry-run
  python pipeline/backfill_archive_sprints.py 2021 2022 2023 2024 2025
"""
from __future__ import annotations

import sys
import time
from collections import defaultdict

import jolpica
from enrich_archive_entities import team_slug
from ergast_utils import init_postgres, prune, transaction, upsert

PAGE = 100  # Jolpica's cap per response


def season_sprints(year: int) -> dict[int, list[dict]]:
    """Every sprint of a season from Jolpica, {round: [result rows]}, every page read."""
    out: dict[int, list[dict]] = defaultdict(list)
    offset = 0
    while True:
        data = jolpica._get(f"{year}/sprint.json?limit={PAGE}&offset={offset}")
        for race in data["RaceTable"]["Races"]:
            out[int(race["round"])].extend(race["SprintResults"])
        offset += PAGE
        if offset >= int(data["total"]):
            return dict(out)
        time.sleep(0.5)


def official_standings(year: int) -> dict[str, float]:
    lists = jolpica._get(f"{year}/driverstandings.json?limit=100")["StandingsTable"]["StandingsLists"]
    return {s["Driver"]["driverId"]: float(s["points"]) for s in (lists[0]["DriverStandings"] if lists else [])}


def sprint_rows(archive_race_id: str, year: int, results: list[dict], team_ids: set[str]) -> list[dict]:
    rows = []
    for r in results:
        constructor = r["Constructor"]["name"]
        slug = team_slug(constructor, year)
        rows.append(
            {
                "archive_race_id": archive_race_id,
                "driver_id": r["Driver"]["driverId"],
                "position": int(r["position"]) if str(r.get("position", "")).isdigit() else None,
                "position_text": r.get("positionText"),
                "grid": int(r["grid"]) if str(r.get("grid", "")).isdigit() else None,
                "laps": int(r["laps"]) if str(r.get("laps", "")).isdigit() else None,
                "status": r.get("status"),
                "points": float(r.get("points") or 0),
                "driver_name": f"{r['Driver'].get('givenName', '')} {r['Driver'].get('familyName', '')}".strip(),
                "constructor": constructor,
                "team_id": slug if slug in team_ids else None,
                "time": (r.get("Time") or {}).get("time"),
                "driver_code": r["Driver"].get("code"),
            }
        )
    return rows


def main() -> int:
    years = [int(a) for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv
    if not years:
        raise SystemExit("usage: backfill_archive_sprints.py <year> [<year> ...] [--dry-run]")
    conn = init_postgres()
    if dry_run:
        conn.set_session(readonly=True, autocommit=False)
    cur = conn.cursor()
    cur.execute("select team_id from archive_teams")
    team_ids = {r[0] for r in cur.fetchall()}
    mismatched_years = []
    for year in years:
        sprints = season_sprints(year)
        cur.execute("select round, id from archive_races where year = %s", (year,))
        race_id_by_round = dict(cur.fetchall())
        print(f"{year}: {len(sprints)} sprint(s){' (dry run: nothing is written)' if dry_run else ''}")
        planned: dict[str, list[dict]] = {}
        for round_num, results in sorted(sprints.items()):
            race_id = race_id_by_round.get(round_num)
            if race_id is None:
                print(f"  round {round_num}: no archive race - skipped")
                continue
            rows = sprint_rows(race_id, year, results, team_ids)
            planned[race_id] = rows
            no_team = sorted({r["constructor"] for r in rows if r["team_id"] is None})
            print(f"  round {round_num} {race_id}: {len(rows)} cars, {sum(r['points'] for r in rows):g} points" + (f"; no archive team for {no_team}" if no_team else ""))
            if not dry_run:
                with transaction(cur):
                    upsert(cur, "archive_sprint_results", rows, ["archive_race_id", "driver_id"])
                    prune(cur, "archive_sprint_results", "archive_race_id", race_id, "driver_id", [r["driver_id"] for r in rows])

        # The season's totals as the app adds them (Grand Prix + sprint) against the official standings.
        cur.execute("select ar.driver_id, ar.points from archive_results ar join archive_races r on r.id = ar.archive_race_id where r.year = %s", (year,))
        totals: dict[str, float] = defaultdict(float)
        for driver_id, points in cur.fetchall():
            totals[driver_id] += float(points or 0)
        if dry_run:
            for rows in planned.values():
                for r in rows:
                    totals[r["driver_id"]] += r["points"]
        else:
            cur.execute("select s.driver_id, s.points from archive_sprint_results s join archive_races r on r.id = s.archive_race_id where r.year = %s", (year,))
            for driver_id, points in cur.fetchall():
                totals[driver_id] += float(points or 0)
        time.sleep(0.5)
        official = official_standings(year)
        diffs = {d: (totals.get(d, 0.0), p) for d, p in official.items() if abs(totals.get(d, 0.0) - p) > 1e-9}
        print(f"  standings vs official: {len(official) - len(diffs)} of {len(official)} drivers match" + (f"; differ (ours, official): {diffs}" if diffs else ""))
        if diffs:
            mismatched_years.append(year)
    conn.close()
    if mismatched_years:
        print(f"seasons still differing from the official table: {mismatched_years}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
