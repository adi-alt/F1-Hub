"""backfill_archive_sprints.sprint_rows: a Jolpica sprint result -> an archive_sprint_results row shaped like
archive_results, with the archive's own ids and no invented team. Run: python test_archive_sprints.py"""
import backfill_archive_sprints as b

result = {
    "position": "1", "positionText": "1", "points": "8", "grid": "2", "laps": "19", "status": "Finished",
    "Driver": {"driverId": "norris", "code": "NOR", "givenName": "Lando", "familyName": "Norris"},
    "Constructor": {"name": "McLaren"}, "Time": {"time": "30:41.451"},
}
row = b.sprint_rows("2025_r06_miami-grand-prix", 2025, [result], {"mclaren"})[0]
assert row == {
    "archive_race_id": "2025_r06_miami-grand-prix", "driver_id": "norris", "position": 1, "position_text": "1", "grid": 2, "laps": 19,
    "status": "Finished", "points": 8.0, "driver_name": "Lando Norris", "constructor": "McLaren", "team_id": "mclaren", "time": "30:41.451", "driver_code": "NOR",
}, row
# A team the archive doesn't know: left null, never invented.
assert b.sprint_rows("x", 2025, [result], set())[0]["team_id"] is None
# Unclassified ("R", "D") positions and missing grids stay null.
odd = {**result, "position": "R", "grid": "", "Time": None}
r = b.sprint_rows("x", 2025, [odd], {"mclaren"})[0]
assert r["position"] is None and r["grid"] is None and r["time"] is None, r
print("archive sprints: all checks passed")
