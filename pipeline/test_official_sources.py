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

# --- OpenF1: practice == what FastF1 stored (Baku FP1, and Madrid FP1 where session_result differs) --
practice_truth = load("db_2026_practice_truth.json")
for race_id, rnd in (("2026_r15_azerbaijan-grand-prix", 15), ("2026_r14_spanish-grand-prix", 14)):
    got = openf1_fallback.parse_practice(load(f"openf1_2026_{rnd}_fp1_laps.json"), load(f"openf1_2026_{rnd}_fp1_drivers.json"))
    want = practice_truth[race_id]["FP1"]["bestLaps"]
    assert len(got) == len(want) == 22, race_id
    assert sorted(got, key=lambda b: b["driver"]) == sorted(want, key=lambda b: b["driver"]), race_id
    assert [b["lapTimeSec"] for b in got] == sorted(b["lapTimeSec"] for b in want), "stored fastest first"
# Why laps and not session_result: the official classification time leaves out deleted laps, so it
# is NOT what FastF1 stores (and what the pole model was trained on).
codes = {d["driver_number"]: d["name_acronym"] for d in load("openf1_2026_14_fp1_drivers.json")}
madrid_fp1 = {b["driver"]: b["lapTimeSec"] for b in practice_truth["2026_r14_spanish-grand-prix"]["FP1"]["bestLaps"]}
assert any(
    isinstance(r["duration"], (int, float)) and round(r["duration"], 3) != madrid_fp1[codes[r["driver_number"]]]
    for r in load("openf1_2026_14_fp1_session_result.json")
)
drivers_15 = load("openf1_2026_15_fp1_drivers.json")
nine = {d["driver_number"] for d in drivers_15[:9]}
assert openf1_fallback.parse_practice([l for l in load("openf1_2026_15_fp1_laps.json") if l["driver_number"] in nine], drivers_15) is None
saved = openf1_fallback._get
openf1_fallback._get = lambda path, **params: load("openf1_2026_15_fp1_weather.json")
try:
    assert openf1_fallback._fetch_weather(11370) == practice_truth["2026_r15_azerbaijan-grand-prix"]["FP1"]["weather"]
finally:
    openf1_fallback._get = saved
print("openf1 practice: all checks passed")

# --- OpenF1 practice for THIS weekend: Sepang's own sessions only, and only once each is over ------
baku_fp1 = {"laps": load("openf1_2026_15_fp1_laps.json"), "drivers": drivers_15, "weather": load("openf1_2026_15_fp1_weather.json")}
practice_calls = []


def fake_practice_get(path, **params):
    practice_calls.append((path, params))
    return sessions if path == "sessions" else baku_fp1[path]


def clock(when):
    class Now(datetime.datetime):
        @classmethod
        def now(cls, tz=None):
            return when

    return Now


read_sessions = lambda: sorted({p["session_key"] for path, p in practice_calls if path == "laps"})
sepang = {s["session_name"]: s["session_key"] for s in sessions if s["location"] == "Kuala Lumpur"}
decoys = {s["session_key"] for s in sessions if s["location"] != "Kuala Lumpur"}  # April Sakhir + February testing
ALL = ["FP1", "FP2", "FP3"]
utc = datetime.timezone.utc
saved = openf1_fallback._get, openf1_fallback.datetime
openf1_fallback._get = fake_practice_get
try:
    openf1_fallback.datetime = clock(datetime.datetime(2026, 10, 2, 5, 45, tzinfo=utc))  # 15 minutes after FP1
    assert openf1_fallback.fetch_practice_openf1(2026, 16, "Bahrain", datetime.date(2026, 10, 4), ALL) == {}
    assert read_sessions() == [], "nothing read inside the settle time"
    openf1_fallback.datetime = clock(datetime.datetime(2026, 10, 2, 6, 5, tzinfo=utc))  # 35 minutes after FP1
    got = openf1_fallback.fetch_practice_openf1(2026, 16, "Bahrain", datetime.date(2026, 10, 4), ALL)
    assert list(got) == ["FP1"] and read_sessions() == [sepang["Practice 1"]]
    assert got["FP1"]["session"] == "FP1" and len(got["FP1"]["bestLaps"]) == 22 and got["FP1"]["weather"]["airTempC"] == 29.1
    practice_calls.clear()
    openf1_fallback.datetime = clock(datetime.datetime(2026, 10, 3, 7, 0, tzinfo=utc))  # after FP3, before qualifying
    assert list(openf1_fallback.fetch_practice_openf1(2026, 16, "Bahrain", datetime.date(2026, 10, 4), ALL)) == ALL
    assert read_sessions() == sorted(sepang[f"Practice {n}"] for n in (1, 2, 3)), read_sessions()
    assert not any(p.get("session_key") in decoys for _, p in practice_calls), "never the Sakhir or testing sessions"
    practice_calls.clear()  # a race date that matches no meeting is refused, not guessed
    assert openf1_fallback.fetch_practice_openf1(2026, 16, "Bahrain", datetime.date(2026, 7, 1), ALL) == {}
    assert [path for path, _ in practice_calls] == ["sessions"]
finally:
    openf1_fallback._get, openf1_fallback.datetime = saved
print("openf1 practice for the Sepang weekend: all checks passed")

# --- practice_for_round: FastF1 first, OpenF1 only for the sessions FastF1 could not load --------
def practice_doc(label, driver):
    return {"session": label, "bestLaps": [{"driver": driver, "lapTimeSec": 90.0, "deltaToBestSec": 0.0}], "weather": None}


asked = []
sepang_event = {"Country": "Bahrain", "EventDate": datetime.date(2026, 10, 4)}
source_of = lambda practice: {label: s["bestLaps"][0]["driver"] for label, s in practice.items()}
saved = fetch_races.fetch_practice, fetch_races.fetch_practice_openf1
# The fake OpenF1 has FP1 and FP2 but FP3 not yet.
fetch_races.fetch_practice_openf1 = lambda y, r, country, race_date, labels: asked.append((country, list(labels))) or {
    label: practice_doc(label, "OF1") for label in labels if label != "FP3"
}
try:
    fetch_races.fetch_practice = lambda y, r, label: practice_doc(label, "FF1")  # a machine where FastF1 works
    assert source_of(fetch_races.practice_for_round(2026, 16, sepang_event)) == {"FP1": "FF1", "FP2": "FF1", "FP3": "FF1"}
    assert asked == [], "OpenF1 is not asked when FastF1 has everything"
    fetch_races.fetch_practice = lambda y, r, label: practice_doc(label, "FF1") if label == "FP1" else None
    assert source_of(fetch_races.practice_for_round(2026, 16, sepang_event)) == {"FP1": "FF1", "FP2": "OF1"}
    assert asked == [("Bahrain", ["FP2", "FP3"])]
    asked.clear()
    fetch_races.fetch_practice = lambda y, r, label: None  # GitHub's runners
    got = fetch_races.practice_for_round(2026, 16, sepang_event)
    assert source_of(got) == {"FP1": "OF1", "FP2": "OF1"} and asked == [("Bahrain", ALL)]
    assert all(set(s) == {"bestLaps", "weather"} for s in got.values()), "same stored shape as before"
finally:
    fetch_races.fetch_practice, fetch_races.fetch_practice_openf1 = saved
print("practice_for_round: all checks passed")

# --- Sprint results (audit R-17): the official and the preliminary classification -------------
ZANDVOORT = datetime.date(2026, 8, 23)
sprint_official = jolpica.parse_sprint(load("jolpica_2026_12_sprint.json"), 2026, 12, ZANDVOORT)
assert len(sprint_official) == 22 and sum(r["points"] for r in sprint_official) == 36
assert [r["driver"] for r in sprint_official[:3]] == ["RUS", "LEC", "NOR"]
assert jolpica.parse_sprint(load("jolpica_2026_12_sprint.json"), 2026, 12, datetime.date(2026, 8, 30)) is None, "pinned to the weekend's date"
assert jolpica.parse_sprint(load("jolpica_2026_15_results.json"), 2026, 15, BAKU) is None, "a race payload has no sprint"
sprint_prelim = openf1_fallback.parse_sprint(load("openf1_2026_12_sprint_session_result.json"), load("openf1_2026_12_sprint_drivers.json"))
by_driver = lambda rows: {r["driver"]: (r["finishPosition"], r["points"]) for r in rows}
assert by_driver(sprint_prelim) == by_driver(sprint_official), "OpenF1's preliminary sprint matches the official classification"
hulkenberg = next(r for r in sprint_prelim if r["driver"] == "HUL")
assert hulkenberg["status"] == "lapped" and hulkenberg["finishPosition"] == 22, "no position in OpenF1, 22nd officially"
assert openf1_fallback.parse_sprint(load("openf1_2026_12_sprint_session_result.json")[:5], load("openf1_2026_12_sprint_drivers.json")) is None
print("sprint classifications: all checks passed")

# --- The OpenF1 sprint for a sprint weekend: its own meeting, and only once the sprint is over --
nl_sessions = load("openf1_2026_netherlands_sessions.json")
sprint_calls = []


def fake_sprint_get(path, **params):
    sprint_calls.append((path, params))
    if path == "sessions":
        return nl_sessions
    return load("openf1_2026_12_sprint_session_result.json" if path == "session_result" else "openf1_2026_12_sprint_drivers.json")


saved = openf1_fallback._get, openf1_fallback.datetime
openf1_fallback._get = fake_sprint_get
try:
    openf1_fallback.datetime = clock(datetime.datetime(2026, 8, 22, 10, 30, tzinfo=utc))  # mid-sprint
    assert openf1_fallback.fetch_sprint_openf1(2026, 12, "Netherlands", ZANDVOORT) is None
    assert not any(path == "session_result" for path, _ in sprint_calls), "nothing requested before the sprint has ended"
    openf1_fallback.datetime = clock(datetime.datetime(2026, 8, 22, 12, 0, tzinfo=utc))
    sprint_key = next(s["session_key"] for s in nl_sessions if s["session_name"] == "Sprint")
    assert len(openf1_fallback.fetch_sprint_openf1(2026, 12, "Netherlands", ZANDVOORT)) == 22
    assert ("session_result", {"session_key": sprint_key}) in sprint_calls
finally:
    openf1_fallback._get, openf1_fallback.datetime = saved
print("openf1 sprint for a sprint weekend: all checks passed")

# --- sprint_for_round: FastF1, else Jolpica (official), else OpenF1 (preliminary) ---------------
saved = fetch_races.fetch_sprint, jolpica.fetch_sprint, fetch_races.fetch_sprint_openf1
asked = []
sprint_weekend = {"EventFormat": "sprint_qualifying", "Country": "Netherlands", "EventDate": ZANDVOORT}
roster_nl = {"RUS": {"name": "George Russell", "team": "Mercedes"}}
try:
    fetch_races.fetch_sprint = lambda y, r: asked.append("fastf1") or None
    jolpica.fetch_sprint = lambda y, r, d: asked.append("jolpica") or None
    fetch_races.fetch_sprint_openf1 = lambda y, r, c, d: asked.append("openf1") or None
    assert fetch_races.sprint_for_round(2026, 15, {"EventFormat": "conventional", "Country": "Azerbaijan", "EventDate": BAKU}, {}) == (None, None)
    assert asked == [], "a weekend without a sprint asks nobody"
    assert fetch_races.sprint_for_round(2026, 12, sprint_weekend, roster_nl) == (None, None)
    assert asked == ["fastf1", "jolpica", "openf1"]

    fetch_races.fetch_sprint_openf1 = lambda y, r, c, d: openf1_fallback.parse_sprint(load("openf1_2026_12_sprint_session_result.json"), load("openf1_2026_12_sprint_drivers.json"))
    rows, source = fetch_races.sprint_for_round(2026, 12, sprint_weekend, roster_nl)
    assert source == "openf1_preliminary" and len(rows) == 22
    assert next(r for r in rows if r["driver"] == "RUS")["driverName"] == "George Russell", "the app's own driver names"

    jolpica.fetch_sprint = lambda y, r, d: sprint_official
    rows, source = fetch_races.sprint_for_round(2026, 12, sprint_weekend, roster_nl)
    assert source == "official" and rows[0]["driver"] == "RUS" and rows[0]["status"] == "finished"
    assert all(r["team"] and r["team"] not in fetch_races.TEAM_NAME_ALIASES for r in rows), "Jolpica's constructor names normalised"

    fetch_races.fetch_sprint = lambda y, r: [{"driver": "RUS", "driverName": "George Russell", "team": "Mercedes", "gridPosition": 1, "finishPosition": 1, "status": "finished", "points": 8.0, "finishGapSec": 0}]
    assert fetch_races.sprint_for_round(2026, 12, sprint_weekend, roster_nl)[1] == "official"
finally:
    fetch_races.fetch_sprint, jolpica.fetch_sprint, fetch_races.fetch_sprint_openf1 = saved
assert all(fetch_races.is_sprint_weekend({"EventFormat": f}) for f in ("sprint", "sprint_shootout", "sprint_qualifying"))
assert not fetch_races.is_sprint_weekend({"EventFormat": "conventional"}) and not fetch_races.is_sprint_weekend({})
print("sprint_for_round: all checks passed")
