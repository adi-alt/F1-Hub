"""qualifying_sessions: stage-by-stage Grand Prix qualifying and sprint qualifying, on the real 2026 Singapore data
(Jolpica's official Q1/Q2/Q3; OpenF1's sprint qualifying). Run: python test_qualifying_sessions.py"""
import json
from datetime import date
from pathlib import Path

import qualifying_sessions as qs

F = Path(__file__).parent / "test_fixtures"
load = lambda name: json.loads((F / name).read_text())

# Grand Prix qualifying, official.
rows = qs.parse_jolpica_stages(load("jolpica_2026_17_qualifying.json"), 2026, 17, date(2026, 10, 11))
assert rows and len(rows) == 22, rows and len(rows)
ver = rows[0]
assert (ver["driver"], ver["position"], ver["stageReached"], ver["status"]) == ("VER", 1, 3, "classified"), ver
assert ver["stages"] == [93.241, 91.639, 91.373], ver["stages"]
by_stage = {n: [r for r in rows if r["stageReached"] == n] for n in (1, 2, 3)}
assert len(by_stage[3]) == 10, "ten cars reached Q3"
assert all(r["stages"][2] is None and r["stages"][1] is not None for r in by_stage[2] if r["status"] == "classified"), "Q2 exits have a Q2 time and no Q3 time"
assert all(r["stages"][1] is None and r["stages"][2] is None for r in by_stage[1]), "Q1 exits have no later times - none invented"
had = next(r for r in rows if r["driver"] == "HAD")
assert had["stages"] == [None, None, None] and had["status"] == "no_time" and had["stageReached"] == 1, had
assert [r["position"] for r in rows] == list(range(1, 23))
assert qs.parse_jolpica_stages(load("jolpica_2026_17_qualifying.json"), 2026, 16, date(2026, 10, 4)) is None, "pinned to its own round"

# Sprint qualifying, OpenF1 (the only source).
sq = qs.parse_openf1_stages(load("openf1_2026_17_sprint_qualifying_result.json"), load("openf1_2026_17_sprint_qualifying_drivers.json"))
assert sq and len(sq) == 22
assert sq[0]["position"] == 1 and sq[0]["stages"] == [93.477, 92.701, 91.156] and sq[0]["stageReached"] == 3, sq[0]
assert all(r["stages"][1] is None for r in sq if r["stageReached"] == 1)
assert len({r["driver"] for r in sq}) == 22

# Rows for the table: one per driver per session, nothing mixed between sessions.
db = qs.qualifying_result_rows("2026_r17", "SQ", sq, "openf1")
assert {r["session"] for r in db} == {"SQ"} and {r["source"] for r in db} == {"openf1"}
assert db[0]["stage3_sec"] == 91.156 and db[0]["stage_reached"] == 3
gp = qs.qualifying_result_rows("2026_r17", "Q", rows, "official")
assert next(r for r in gp if r["driver"] == "HAD")["stage1_sec"] is None

# Rejected, not half-stored: too few cars, or repeated positions.
assert qs.parse_openf1_stages(load("openf1_2026_17_sprint_qualifying_result.json")[:5], load("openf1_2026_17_sprint_qualifying_drivers.json")) is None
dup = load("openf1_2026_17_sprint_qualifying_result.json")
dup[1] = {**dup[1], "position": dup[0]["position"]}
assert qs.parse_openf1_stages(dup, load("openf1_2026_17_sprint_qualifying_drivers.json")) is None

# What gets fetched: official Q never again; SQ until stored; Jolpica outage falls back to OpenF1 for Q only if nothing stored.
calls = []
qs.jolpica._get = lambda path: (calls.append(path), load("jolpica_2026_17_qualifying.json"))[1]
qs.fetch_openf1_stages = lambda y, c, d, s: (calls.append(s), sq)[1]
assert qs.stages_for_round(2026, 17, "Singapore", date(2026, 10, 11), True, {"Q": "official", "SQ": "openf1"}) == [] and calls == []
got = qs.stages_for_round(2026, 17, "Singapore", date(2026, 10, 11), True, {})
assert [(s, src) for s, _r, src in got] == [("Q", "official"), ("SQ", "openf1")], got
assert qs.stages_for_round(2026, 17, "Singapore", date(2026, 10, 11), False, {"Q": "official"}) == [], "no SQ on a standard weekend"
import fetch_races
named = qs.qualifying_result_rows("2026_r17", "Q", rows, "official", team_of=fetch_races.normalize_team_name)
teams = {r["team"] for r in named}
# The same names the 2026 race_results rows use (read from production), e.g. "Racing Bulls" for Jolpica's "RB F1 Team".
assert teams == {"Alpine", "Aston Martin", "Audi", "Cadillac", "Ferrari", "Haas F1 Team", "McLaren", "Mercedes", "Racing Bulls", "Red Bull Racing", "Williams"}, teams
sq_named = qs.qualifying_result_rows("2026_r17", "SQ", sq, "openf1", roster={"VER": {"name": "Max Verstappen"}})
assert sq_named[0]["driver_name"] == "Max Verstappen", "the app's name, not OpenF1's capitalised one"
assert next(r for r in sq_named if r["driver"] == "RUS")["driver_name"] == "George RUSSELL", "unknown to the roster: the source's name, as given"
print("qualifying_sessions: all checks passed")
