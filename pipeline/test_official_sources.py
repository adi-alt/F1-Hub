"""Plain assert-based self-check, same style as the other pipeline tests - `python test_official_sources.py`.

The official/preliminary sources that do NOT go through FastF1, which cannot load any session on
GitHub's runners (every fetch-races log of the 2026 Madrid and Azerbaijan weekends). Fixtures are
real API responses for 2026 round 15 (Baku) and the real 2026 Bahrain session list, and the expected
values are what the app stored for Baku from a machine where FastF1 does work
(test_fixtures/db_2026_15_truth.json) - so "matches" means "the same data FastF1 would have given".
"""

import datetime
import json
from pathlib import Path

import fetch_races
import jolpica
import openf1_fallback
from fetch_races import normalize_status, qualifying_without_fastf1, with_official_classification

F = Path(__file__).resolve().parent / "test_fixtures"
load = lambda name: json.loads((F / name).read_text())
truth = load("db_2026_15_truth.json")
stored_results = {r["driver"]: r for r in truth["race_results"]}
stored_inputs = {r["driver"]: r for r in truth["race_inputs"]}
BAKU = datetime.date(2026, 9, 26)


def close(a, b):
    return a == b or (isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) < 0.002)


# --- Jolpica: official race classification == what FastF1 produced ------------------------------
results = jolpica.parse_results(load("jolpica_2026_15_results.json"), 2026, 15, BAKU)
assert len(results) == 22
for r in results:
    s = stored_results[r["driver"]]
    assert r["finishPosition"] == s["finish_position"], r
    assert normalize_status(r["rawStatus"]) == s["status"], r
    assert close(r["points"], s["points"]) and r["gridPosition"] == s["grid"], r
    assert close(r["finishGapSec"], s["gap"]), (r["driver"], r["finishGapSec"], s["gap"])
    assert close(r["fastestLapSec"], s["fl"]), r
# A car that retired late (Bottas, lap 49 of 51) gets no gap, even though Jolpica reports its time.
assert next(r for r in results if r["driver"] == "BOT")["finishGapSec"] is None
# Never the wrong round: a date that doesn't match FastF1's event date is refused, as is an
# unpublished round and an incomplete classification.
assert jolpica.parse_results(load("jolpica_2026_15_results.json"), 2026, 15, datetime.date(2026, 9, 27)) is None
assert jolpica.parse_results(load("jolpica_2026_15_results.json"), 2026, 16, BAKU) is None
assert jolpica.parse_results(load("jolpica_2026_16_results_unpublished.json"), 2026, 16, datetime.date(2026, 10, 4)) is None
partial = load("jolpica_2026_15_results.json"); partial["MRData"]["RaceTable"]["Races"][0]["Results"] = partial["MRData"]["RaceTable"]["Races"][0]["Results"][:5]
assert jolpica.parse_results(partial, 2026, 15, BAKU) is None
assert jolpica.parse_lap_time("1:44.916") == 104.916 and jolpica.parse_lap_time("59.1") == 59.1 and jolpica.parse_lap_time("") is None
print("jolpica results: all checks passed")

# --- Jolpica: official qualifying == stored grid/gaps -------------------------------------------
quali_rows = jolpica.parse_qualifying(load("jolpica_2026_15_qualifying.json"), 2026, 15, BAKU)
assert len(quali_rows) == 22 and quali_rows[0]["bestSec"] == truth["pole"]["pole_time_sec"]
for q in quali_rows:
    assert q["gridPosition"] == stored_inputs[q["driver"]]["grid"], q
print("jolpica qualifying: all checks passed")

# --- OpenF1: qualifying (available right after the session, before Jolpica) ---------------------
of1 = openf1_fallback.parse_qualifying(load("openf1_2026_15_quali_session_result.json"), load("openf1_2026_15_quali_drivers.json"))
assert of1["poleTimeSec"] == truth["pole"]["pole_time_sec"] and len(of1["grid"]) == 22
for g in of1["grid"]:
    s = stored_inputs[g["driver"]]
    assert g["gridPosition"] == s["grid"] and close(g["qualifyingGapSec"], s["gap"]), (g, s)
assert {g["team"] for g in of1["grid"]} <= {r["team"] for r in truth["race_results"]}, "OpenF1 team names match the stored ones"
assert openf1_fallback.parse_qualifying(load("openf1_2026_15_quali_session_result.json")[:4], load("openf1_2026_15_quali_drivers.json")) is None
print("openf1 qualifying: all checks passed")

# --- OpenF1 qualifying for THIS weekend: pinned to the Sepang meeting, not the cancelled April one --
sessions = load("openf1_2026_bahrain_sessions.json")
calls = []


def fake_get(path, **params):
    calls.append((path, params))
    if path == "sessions":
        return sessions
    return []  # session_result/drivers: nothing yet


real_get, real_now = openf1_fallback._get, openf1_fallback.datetime
openf1_fallback._get = fake_get
try:
    class After(datetime.datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.datetime(2026, 10, 3, 10, 0, tzinfo=datetime.timezone.utc)  # after Sepang qualifying

    openf1_fallback.datetime = After
    openf1_fallback.fetch_qualifying_openf1(2026, 16, "Bahrain", datetime.date(2026, 10, 4))
    quali_key = next(s["session_key"] for s in sessions if s["session_name"] == "Qualifying" and s["location"] == "Kuala Lumpur")
    assert ("session_result", {"session_key": quali_key}) in calls, calls
    assert not any(p.get("session_key") in {s["session_key"] for s in sessions if s["location"] == "Sakhir"} for _, p in calls)

    class Before(datetime.datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.datetime(2026, 10, 3, 7, 0, tzinfo=datetime.timezone.utc)  # before qualifying

    calls.clear(); openf1_fallback.datetime = Before
    assert openf1_fallback.fetch_qualifying_openf1(2026, 16, "Bahrain", datetime.date(2026, 10, 4)) is None
    assert not any(path == "session_result" for path, _ in calls), "nothing requested before the session has ended"
finally:
    openf1_fallback._get, openf1_fallback.datetime = real_get, real_now
print("openf1 qualifying for the Sepang weekend: all checks passed")

# --- Merging: official classification over preliminary analytics, canonical names --------------
roster = {d["code"]: {"name": d["name"], "team": d["team"]} for d in truth["drivers"]}
prelim = {
    "session": "R", "weather": {"airTempC": 30.0}, "tireStints": [{"driver": "RUS"}], "trafficStats": [{"driver": "RUS"}],
    "safetyCarPeriods": 1, "tireCompoundPace": [{"driver": "RUS"}], "lapTimings": [{"driver": "RUS"}],
    "results": [{"driver": r["driver"], "driverName": r["driverName"].upper(), "team": stored_results[r["driver"]]["team"], "finishPosition": 23 - r["finishPosition"], "status": "finished",
                 "points": 0, "gridPosition": None, "finishGapSec": None, "fastestLapSec": None, "headshotUrl": "h", "teamColor": "#fff"} for r in results],
}
merged = with_official_classification(prelim, results, roster)
for m in merged["results"]:
    s = stored_results[m["driver"]]
    assert (m["finishPosition"], m["status"], m["grid"] if "grid" in m else m["gridPosition"], m["team"], m["driverName"]) == (s["finish_position"], s["status"], s["grid"], s["team"], s["driver_name"]), (m, s)
    assert m["headshotUrl"] == "h"
assert merged["weather"] == {"airTempC": 30.0} and merged["lapTimings"], "the preliminary analytics are kept"
alone = with_official_classification(None, results, roster)
assert alone["lapTimings"] == [] and alone["weather"] is None and len(alone["results"]) == 22
# Teams come from the race itself (Jolpica's constructor, normalised to the app's names) - not from
# the roster, which still has Lawson at Red Bull Racing although he raced for Racing Bulls at Baku.
assert all(r["team"] == stored_results[r["driver"]]["team"] for r in alone["results"]), [(r["driver"], r["team"]) for r in alone["results"] if r["team"] != stored_results[r["driver"]]["team"]]
assert roster["LAW"]["team"] == "Red Bull Racing" and next(r for r in alone["results"] if r["driver"] == "LAW")["team"] == "Racing Bulls"
print("official-over-preliminary merge: all checks passed")

# --- qualifying_without_fastf1: Jolpica first, OpenF1 second, canonical names -------------------
real_jq, real_oq = fetch_races.jolpica.fetch_qualifying, fetch_races.fetch_qualifying_openf1
try:
    fetch_races.jolpica.fetch_qualifying = lambda *a: quali_rows
    fetch_races.fetch_qualifying_openf1 = lambda *a: (_ for _ in ()).throw(AssertionError("OpenF1 must not be asked when Jolpica has it"))
    q = qualifying_without_fastf1(2026, 15, {"EventDate": BAKU, "Country": "Azerbaijan"}, roster)
    assert q["poleTimeSec"] == truth["pole"]["pole_time_sec"]
    assert all(g["team"] == stored_results[g["driver"]]["team"] and close(g["qualifyingGapSec"], stored_inputs[g["driver"]]["gap"]) for g in q["grid"])
    fetch_races.jolpica.fetch_qualifying = lambda *a: None
    shouted = {"session": "Q", "poleTimeSec": 1.0, "grid": [{"driver": "RUS", "driverName": "George RUSSELL", "team": "Mercedes", "gridPosition": 1, "qualifyingGapSec": 0}]}
    fetch_races.fetch_qualifying_openf1 = lambda *a: shouted
    assert qualifying_without_fastf1(2026, 16, {"EventDate": BAKU, "Country": "X"}, roster)["grid"][0]["driverName"] == "George Russell"
finally:
    fetch_races.jolpica.fetch_qualifying, fetch_races.fetch_qualifying_openf1 = real_jq, real_oq
print("qualifying_without_fastf1: all checks passed")

# --- Rate limiting: a 429 is waited out and retried, anything else still fails fast --------------
class Resp:
    def __init__(self, code, body=None, headers=None):
        self.status_code, self._body, self.headers = code, body, headers or {}
    def json(self):
        return self._body
    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


responses, slept = [], []
real_requests_get, real_sleep = openf1_fallback.requests.get, openf1_fallback.time.sleep
openf1_fallback.requests.get = lambda *a, **k: responses.pop(0)
openf1_fallback.time.sleep = lambda s: slept.append(s)
try:
    responses[:] = [Resp(429, headers={"Retry-After": "3"}), Resp(503), Resp(200, [{"ok": 1}])]
    assert openf1_fallback._get("laps", session_key=1) == [{"ok": 1}] and slept == [3.0, 5]
    responses[:] = [Resp(404)]; slept.clear()
    try:
        openf1_fallback._get("session_result", session_key=1); raise AssertionError("404 must not be retried")
    except RuntimeError as e:
        assert "404" in str(e) and slept == []
    responses[:] = [Resp(429) for _ in range(4)]; slept.clear()
    try:
        openf1_fallback._get("laps", session_key=1); raise AssertionError("gives up after the retries")
    except RuntimeError as e:
        assert "429" in str(e) and slept == [2, 5, 10]
finally:
    openf1_fallback.requests.get, openf1_fallback.time.sleep = real_requests_get, real_sleep
print("openf1 retry on rate limiting: all checks passed")
