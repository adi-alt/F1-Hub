"""Plain assert-based self-check (no pytest) for lap-by-lap car position from Jolpica - `python test_lap_positions.py`.

OpenF1 is the only race source that works from GitHub's runners and it has no per-lap position, so the race
page's lap chart was empty for every round CI fetched. Fixtures are the real Jolpica laps for 2026 round 15
(Baku, 976 rows) and the positions the app stored for it from a machine where FastF1 works.
"""

import copy
import datetime
import json
from pathlib import Path

import fetch_races
import jolpica

F = Path(__file__).resolve().parent / "test_fixtures"
real_fetch_laps = jolpica.fetch_laps
fixture = json.loads((F / "jolpica_2026_15_laps.json").read_text())
stored_truth = json.loads((F / "db_2026_15_laps_truth.json").read_text())
BAKU = datetime.date(2026, 9, 26)

# --- parse: the whole race, mapped to the three-letter codes the app stores ---------------------
laps = jolpica.parse_laps(fixture["pages"], fixture["results"], 2026, 15, BAKU)
assert len(laps) == 976, len(laps)
assert {r["driver"] for r in laps} >= {"VER", "HAM", "NOR", "BOT"}
assert max(r["lapNumber"] for r in laps) == 51
assert len([r for r in laps if r["lapNumber"] == 1]) == 22
assert all(r["timeSec"] is None or r["timeSec"] > 30 for r in laps)

# --- ... and it is the same data FastF1 stored: positions agree except a tie on lap 44 -----------
ours = {(r["driver"], r["lapNumber"]): r["position"] for r in laps}
differences = [(t["driver"], t["lap_number"]) for t in stored_truth if t["position"] is not None and ours.get((t["driver"], t["lap_number"])) != t["position"]]
assert sorted(differences) == [("BOR", 44), ("PER", 44)], differences  # same lap time, swapped by a tie-break
assert len([t for t in stored_truth if (t["driver"], t["lap_number"]) in ours]) >= 94

# --- never the wrong round, never a partial race, never an inconsistent one ---------------------
assert jolpica.parse_laps(fixture["pages"], fixture["results"], 2026, 15, datetime.date(2026, 9, 27)) is None
assert jolpica.parse_laps(fixture["pages"], fixture["results"], 2026, 16, BAKU) is None
assert jolpica.parse_laps(fixture["pages"][:3], fixture["results"], 2026, 15, BAKU) is None, "half-ingested race"
assert jolpica.parse_laps([], fixture["results"], 2026, 15, BAKU) is None

clash = copy.deepcopy(fixture)
race0 = clash["pages"][0].get("MRData", clash["pages"][0])["RaceTable"]["Races"][0]
lap_two = next(l for l in race0["Laps"] if l["number"] == "2")
lap_two["Timings"][1]["position"] = lap_two["Timings"][0]["position"]
assert jolpica.parse_laps(clash["pages"], clash["results"], 2026, 15, BAKU) is None, "two cars in one position"

# --- fetch: pages through the whole race, 100 rows at a time, and only the three-letter codes -----
requests = []
fixture_pages = [p.get("MRData", p) for p in fixture["pages"]]


def fake_get(path):
    requests.append(path)
    if "results.json" in path:
        return fixture["results"].get("MRData", fixture["results"])
    offset = int(path.split("offset=")[1])
    return fixture_pages[offset // 100]


real_get, real_sleep = jolpica._get, jolpica.time.sleep
jolpica._get, jolpica.time.sleep = fake_get, lambda s: None
try:
    fetched = jolpica.fetch_laps(2026, 15, BAKU)
finally:
    jolpica._get, jolpica.time.sleep = real_get, real_sleep
assert fetched == laps and len(requests) == 11, (len(requests), requests[:3])


def boom(path):
    raise OSError("network down")


jolpica._get = boom
assert jolpica.fetch_laps(2026, 15, BAKU) is None, "a network failure is 'not available', never fatal"
jolpica._get = real_get

# --- merge: fills what is missing, replaces nothing -----------------------------------------------
official = [
    {"driver": "HAM", "lapNumber": 1, "position": 2, "timeSec": 105.5},
    {"driver": "HAM", "lapNumber": 2, "position": 2, "timeSec": 99.25},
    {"driver": "NOR", "lapNumber": 1, "position": 1, "timeSec": 104.0},
    {"driver": "NOR", "lapNumber": 2, "position": 1, "timeSec": None},
]
openf1 = [
    {"driver": "HAM", "lapNumber": 1, "position": None, "time": "1:45.512"},
    {"driver": "NOR", "lapNumber": 1, "position": 5, "time": "1:44.001"},  # FastF1's own, already stored: wins
    {"driver": "HAM", "lapNumber": 2, "position": None, "time": None},
]
merged, changed = fetch_races.merge_lap_positions(openf1, official)
by = {(t["driver"], t["lapNumber"]): t for t in merged}
assert by[("HAM", 1)]["position"] == 2 and by[("HAM", 1)]["time"] == "1:45.512", "position filled, time kept"
assert by[("NOR", 1)]["position"] == 5 and by[("NOR", 1)]["time"] == "1:44.001", "a stored position is never replaced"
assert by[("HAM", 2)]["position"] == 2 and by[("HAM", 2)]["time"] is None, "a missing time is not rewritten here"
assert by[("NOR", 2)] == {"driver": "NOR", "lapNumber": 2, "position": 1, "time": None}, "a lap only Jolpica has is added"
assert changed == 3, changed
assert [(t["lapNumber"], t["driver"]) for t in merged] == sorted((t["lapNumber"], t["driver"]) for t in merged)
again, changed_again = fetch_races.merge_lap_positions(merged, official)
assert changed_again == 0 and again == merged, "running it twice changes nothing"

# the time of a lap added from Jolpica is in the same format as every other lap time
added, _ = fetch_races.merge_lap_positions([], [{"driver": "HAM", "lapNumber": 1, "position": 1, "timeSec": 107.845}])
assert added[0]["time"] == "1:47.845", added

# --- with_jolpica_lap_positions: no request when it isn't needed, and a miss leaves the race alone --
calls = []
fetch_races.jolpica.fetch_laps = lambda *a: calls.append(a) or official
full = {"lapTimings": [{"driver": "HAM", "lapNumber": 1, "position": 1, "time": "1:45.000"}]}
assert fetch_races.with_jolpica_lap_positions(full, 2026, 16, None) is full and calls == [], "positions already there: no request"
assert fetch_races.with_jolpica_lap_positions(None, 2026, 16, None) is None and calls == []
filled = fetch_races.with_jolpica_lap_positions({"lapTimings": openf1, "results": []}, 2026, 16, None)
assert len(calls) == 1 and {(t["driver"], t["lapNumber"]) for t in filled["lapTimings"]} >= {("NOR", 2)} and filled["results"] == []
fetch_races.jolpica.fetch_laps = lambda *a: None
unpublished = {"lapTimings": openf1}
assert fetch_races.with_jolpica_lap_positions(unpublished, 2026, 16, None) is unpublished, "Jolpica has no laps yet: unchanged"


# --- the catch-up: only races that need it, only the rows that change -----------------------------
class Cur:
    def __init__(self, races, stored):
        self.races, self.stored, self.queries, self._rows = races, stored, [], []

    def execute(self, sql, params=None):
        self.queries.append(" ".join(sql.split()))
        if sql.startswith("select r.id"):
            self._rows = self.races
        elif sql.startswith("select driver, lap_number"):
            self._rows = self.stored

    def fetchall(self):
        return self._rows


writes = []
fetch_races.upsert = lambda cur, table, rows, key, **kw: writes.append((table, rows, kw))
fetch_races.jolpica.fetch_laps = lambda *a: official
stored = [("HAM", 1, None, "1:45.512"), ("NOR", 1, 5, "1:44.001"), ("HAM", 2, None, None)]
cur = Cur([("2026_r16_bahrain-grand-prix", 2026, 16, datetime.date(2026, 10, 4))], stored)
fetch_races.os.environ.pop("FORCE_ALL_ROUNDS", None)
fetch_races.backfill_lap_positions(cur)
assert "current_date - 21" in cur.queries[0] and "position is null" in cur.queries[0], cur.queries[0]
assert cur.queries[1] == "begin" or "begin" in cur.queries, cur.queries
assert "commit" in cur.queries and "rollback" not in cur.queries
(table, rows, kw), = writes
assert table == "race_laps" and kw["skip_unchanged"] and kw["keep_known_cols"] == ("position", "time")
assert {(r["driver"], r["lap_number"]) for r in rows} == {("HAM", 1), ("HAM", 2), ("NOR", 2)}, rows
assert all(r["race_id"] == "2026_r16_bahrain-grand-prix" for r in rows)

# a manual full clean-up (FORCE_ALL_ROUNDS) looks at every season, not just the last three weeks
cur = Cur([], [])
fetch_races.os.environ["FORCE_ALL_ROUNDS"] = "true"
fetch_races.backfill_lap_positions(cur)
assert "current_date" not in cur.queries[0], cur.queries[0]
fetch_races.os.environ.pop("FORCE_ALL_ROUNDS")

# Jolpica not ready: no write
writes.clear()
fetch_races.jolpica.fetch_laps = lambda *a: None
fetch_races.backfill_lap_positions(Cur([("2026_r16_bahrain-grand-prix", 2026, 16, datetime.date(2026, 10, 4))], stored))
assert writes == []

jolpica.fetch_laps = real_fetch_laps
print("lap positions: all checks passed")
