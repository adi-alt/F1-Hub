"""Plain assert-based self-check, same style as test_compute_group_scores.py - no pytest, nothing
to install, just `python test_fetch_races.py`. Covers the exact failure that corrupted 2026 round
14 (see pipeline/OPENF1_FALLBACK.md): a country hosting more than one Grand Prix in a season, and a
FastF1 frame that has live-timing positions but no published classification yet. Both are real,
recurring shapes of data (2026 alone has Spain x2 and the United States x3 - see the collision
check below), not one-off edge cases, so this is wired into CI (see .github/workflows/ci.yml)
rather than left as a script nobody remembers to run by hand.
"""

import datetime

import pandas as pd

import fetch_races
from fetch_races import has_official_classification, next_relevant_round, points_for, seasons_to_check
from openf1_fallback import _as_date, _pick_race_session


class Row:
    """Minimal stand-in for a pandas itertuples() row - the attributes points_for() reads,
    including Abbreviation (used only in its own diagnostic print on the NaN path)."""

    def __init__(self, points, abbreviation="XXX"):
        self.Points = points
        self.Abbreviation = abbreviation


# --- _pick_race_session: the actual 2026 round 14 collision -----------------------------------
# Spain hosted Barcelona (round 7, 2026-06-14) and Madrid (round 14, 2026-09-13) in the same
# season. Barcelona's session (already run by September) must never be matched for Madrid just
# because both share country_name="Spain" and both appear in one /v1/sessions response.
barcelona_and_madrid = [
    {"session_name": "Race", "meeting_key": 1287, "location": "Barcelona", "date_start": "2026-06-14T13:00:00+00:00"},
    {"session_name": "Race", "meeting_key": 1294, "location": "Madrid", "date_start": "2026-09-13T13:00:00+00:00"},
]

picked = _pick_race_session(barcelona_and_madrid, datetime.date(2026, 9, 13))
assert picked is not None and picked["meeting_key"] == 1294, picked

picked = _pick_race_session(barcelona_and_madrid, datetime.date(2026, 6, 14))
assert picked is not None and picked["meeting_key"] == 1287, picked

# A three-way collision (2026: Miami round 4, Austin round 18, Las Vegas round 21 are all
# "United States") must resolve the same way - not just the two-race case.
three_us_rounds = [
    {"session_name": "Race", "meeting_key": 1, "location": "Miami", "date_start": "2026-05-03T19:00:00+00:00"},
    {"session_name": "Race", "meeting_key": 2, "location": "Austin", "date_start": "2026-10-25T19:00:00+00:00"},
    {"session_name": "Race", "meeting_key": 3, "location": "Las Vegas", "date_start": "2026-11-22T06:00:00+00:00"},
]
assert _pick_race_session(three_us_rounds, datetime.date(2026, 10, 25))["meeting_key"] == 2
assert _pick_race_session(three_us_rounds, datetime.date(2026, 11, 22))["meeting_key"] == 3

# No race_date to disambiguate with, and more than one candidate: refuse rather than guess. This
# is the exact condition that silently took "the first Race match" before this fix existed.
assert _pick_race_session(barcelona_and_madrid, None) is None

# A single, unambiguous candidate is fine even with nothing to compare it against.
assert _pick_race_session([barcelona_and_madrid[0]], None) == barcelona_and_madrid[0]

# Nothing within tolerance of the given date: refuse, don't return the nearest wrong one.
assert _pick_race_session(barcelona_and_madrid, datetime.date(2020, 1, 1)) is None

# No sessions at all.
assert _pick_race_session([], datetime.date(2026, 9, 13)) is None

print("_pick_race_session: all checks passed")


# --- _as_date: the three shapes this module actually receives ---------------------------------
assert _as_date(None) is None
assert _as_date(datetime.date(2026, 9, 13)) == datetime.date(2026, 9, 13)
assert _as_date(datetime.datetime(2026, 9, 13, 13, 0)) == datetime.date(2026, 9, 13)
assert _as_date(pd.Timestamp("2026-09-13")) == datetime.date(2026, 9, 13)
assert _as_date("2026-09-13") == datetime.date(2026, 9, 13)

print("_as_date: all checks passed")


# --- has_official_classification: the actual frame FastF1 returns before Jolpica publishes ------
# Reproduces the real 2026 round 14 frame: Position is filled from live timing, Status/Points are
# not yet available from Ergast/Jolpica (empty string / NaN, not missing columns).
provisional = pd.DataFrame({"Position": [1, 2, 3], "Status": ["", "", ""], "Points": [float("nan")] * 3})
assert has_official_classification(provisional) is False

published = pd.DataFrame({"Position": [1, 2, 3], "Status": ["Finished", "Finished", "+1 Lap"], "Points": [25.0, 18.0, 15.0]})
assert has_official_classification(published) is True

# A real DNF is a genuine, published status - not a stand-in for "not yet known" the way "" is.
with_a_real_dnf = pd.DataFrame({"Position": [1, 2, 3], "Status": ["Finished", "Accident", "Finished"], "Points": [25.0, 0.0, 15.0]})
assert has_official_classification(with_a_real_dnf) is True

assert has_official_classification(None) is False
assert has_official_classification(pd.DataFrame()) is False
assert has_official_classification(pd.DataFrame({"Position": [1]})) is False  # no Status/Points columns at all

print("has_official_classification: all checks passed")


# --- next_relevant_round: the actual bug that froze the rest of the 2026 season -----------------
# A round stuck at results_source='openf1_preliminary' past its own fetch window used to make
# EVERY later round stop being checked forever, not just that one - see next_relevant_round's own
# comment for the full story (round 14 never got its official upgrade, and round 15 - already
# raced, sitting at zero results - was never selected by any tick again).


class FakeCursor:
    """Just enough of psycopg's cursor protocol for next_relevant_round(), which runs exactly one
    query (pipeline/sql/next_round_candidates.sql - this file tests the Python walk only; the SQL is
    exercised against a real schema separately) and then walks the rows in Python. Each
    row is (round, sessions, race_date, source), source 'calendar' or 'races'."""

    def __init__(self, rows):
        self._rows = list(rows)
        self.executed = []

    def execute(self, query, params=None):
        self.executed.append((query, params))

    def fetchall(self):
        return self._rows


def _iso(dt):
    # Naive (no tzinfo suffix) - matches sync_calendar.py's own real output, which
    # next_relevant_round treats as UTC (see its own comment on why).
    return dt.replace(tzinfo=None).isoformat()


def _cal(round_num, dates, source="calendar", race_date=None):
    """A candidate row: the same list-of-{date,label}-dicts shape the real `calendar.sessions`
    jsonb column holds."""
    sessions = [{"date": _iso(d), "label": "Race" if i == len(dates) - 1 else "Practice"} for i, d in enumerate(dates)]
    return (round_num, sessions, race_date, source)


now = datetime.datetime.now(datetime.timezone.utc)
day = datetime.timedelta(days=1)

# Round 14's own fetch window closed 16 days ago (its Race session, plus the 7-day retry window,
# both well in the past) and it never reached 'official' - round 15 already raced 2 days ago and
# has real work waiting. The earliest-only version of this function stopped at round 14 and
# returned None; walking past a closed window is exactly the fix.
stuck = FakeCursor([_cal(14, [now - 23 * day]), _cal(15, [now - 2 * day])])
assert next_relevant_round(stuck, 2026) == 15
# One query for the whole season, with the season as its only parameter.
assert stuck.executed == [(fetch_races.NEXT_ROUND_CANDIDATES_SQL, {"year": 2026})], stuck.executed

# A round whose window hasn't opened yet (still months out) correctly stops the walk rather than
# returning it early - there's genuinely nothing to fetch yet, and no round after it could be due
# either (chronological order).
assert next_relevant_round(FakeCursor([_cal(16, [now + 60 * day])]), 2026) is None

# The ordinary case: a single round, right in the middle of its own window.
assert next_relevant_round(FakeCursor([_cal(15, [now - datetime.timedelta(hours=6)])]), 2026) == 15

# DATA-01: an upcoming round that exists only in `calendar` (no races row yet) and whose weekend
# starts within FETCH_WINDOW_BEFORE is due. Before the fix it could never be a candidate at all.
assert next_relevant_round(FakeCursor([_cal(16, [now + datetime.timedelta(hours=12), now + 2 * day])]), 2026) == 16

# A sprint weekend is gated on its FIRST session (Friday practice), whatever the labels are.
sprint = FakeCursor([(19, [{"label": "Practice 1", "date": _iso(now + datetime.timedelta(hours=20))}, {"label": "Sprint Qualifying", "date": _iso(now + 1 * day)}, {"label": "Sprint", "date": _iso(now + 2 * day)}, {"label": "Qualifying", "date": _iso(now + 2 * day)}, {"label": "Race", "date": _iso(now + 3 * day)}], None, "calendar")])
assert next_relevant_round(sprint, 2026) == 19

# A races row with no calendar row at all (sync_calendar.py hasn't reached it) - fetch anyway,
# same as before, rather than silently never checking it.
assert next_relevant_round(FakeCursor([(16, None, None, "races")]), 2026) == 16

# A calendar event with no dated sessions yet is skipped (nothing can have run) - it must neither
# be fetched every tick nor stop the walk before a later round that is due.
assert next_relevant_round(FakeCursor([(16, [], None, "calendar"), _cal(17, [now - 1 * day])]), 2026) == 17

# No sessions but a race_date (a `date` column, read back as text): gated on race day, midnight UTC.
race_day = (now + 3 * day).date().isoformat()
assert next_relevant_round(FakeCursor([(18, [], race_day, "calendar")]), 2026) is None
assert next_relevant_round(FakeCursor([(18, [], now.date().isoformat(), "calendar")]), 2026) == 18

# Nothing left to do at all.
assert next_relevant_round(FakeCursor([]), 2026) is None

print("next_relevant_round: all checks passed")


# --- seasons_to_check: the season boundary -----------------------------------------------------
utc = datetime.timezone.utc
assert seasons_to_check(datetime.datetime(2026, 9, 29, 12, tzinfo=utc)) == [2026]
# Early January still checks the previous season first (a retry window can run past New Year) ...
assert seasons_to_check(datetime.datetime(2027, 1, 3, 0, 30, tzinfo=utc)) == [2026, 2027]
# ... but only for FETCH_WINDOW_AFTER.
assert seasons_to_check(datetime.datetime(2027, 1, 9, tzinfo=utc)) == [2027]
# 23:30 on 31 December in UTC-10 is already the new year in UTC - the UTC year is the season.
hawaii = datetime.timezone(datetime.timedelta(hours=-10))
assert seasons_to_check(datetime.datetime(2026, 12, 31, 23, 30, tzinfo=hawaii).astimezone(utc)) == [2026, 2027]

print("seasons_to_check: all checks passed")

print("has_official_classification: all checks passed")


# --- points_for: never let a NaN reach the numeric column race_results.points is --------------
# `numeric not null` in Postgres accepts NaN, and PostgREST then serialises it as the JSON
# *string* "NaN" - which silently turns `driver.points += result.points` (src/lib/standings.ts)
# into string concatenation. A per-driver NaN should be impossible once
# has_official_classification() has passed, but this is the belt-and-braces coercion, not the fix.
assert points_for(Row(float("nan"))) == 0.0
assert points_for(Row(25.0)) == 25.0
assert points_for(Row(0.0)) == 0.0

print("points_for: all checks passed")

# --- fetch_practice (FastF1): best laps are stored fastest first ------------------------------
# The season page shows bestLaps[0] as a session's fastest; groupby alone orders by driver code.
class FakePracticeSession:
    laps = pd.DataFrame(
        {"Driver": ["ALB", "ALB", "VER", "LEC", "SAR"], "LapTime": pd.to_timedelta([83.13, 82.5, 80.9, 80.267, None], unit="s")}
    )
    weather_data = pd.DataFrame({"AirTemp": [20.0, 22.0], "TrackTemp": [30.0, 32.0], "Humidity": [50.0, 52.0], "Rainfall": [0, 0]})

    def load(self, **kwargs):
        pass


real_get_session = fetch_races.fastf1.get_session
fetch_races.fastf1.get_session = lambda year, round_num, label: FakePracticeSession()
try:
    fp1 = fetch_races.fetch_practice(2026, 1, "FP1")
finally:
    fetch_races.fastf1.get_session = real_get_session
assert [b["driver"] for b in fp1["bestLaps"]] == ["LEC", "VER", "ALB"], fp1  # SAR set no time
assert fp1["bestLaps"][0]["deltaToBestSec"] == 0 and fp1["bestLaps"][-1] == {"driver": "ALB", "lapTimeSec": 82.5, "deltaToBestSec": 2.233}
assert fp1["weather"] == {"airTempC": 21.0, "trackTempC": 31.0, "humidityPct": 51.0, "rainfall": False}

print("fetch_practice order: all checks passed")
