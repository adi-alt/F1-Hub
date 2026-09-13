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

from fetch_races import has_official_classification, points_for
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


# --- points_for: never let a NaN reach the numeric column race_results.points is --------------
# `numeric not null` in Postgres accepts NaN, and PostgREST then serialises it as the JSON
# *string* "NaN" - which silently turns `driver.points += result.points` (src/lib/standings.ts)
# into string concatenation. A per-driver NaN should be impossible once
# has_official_classification() has passed, but this is the belt-and-braces coercion, not the fix.
assert points_for(Row(float("nan"))) == 0.0
assert points_for(Row(25.0)) == 25.0
assert points_for(Row(0.0)) == 0.0

print("points_for: all checks passed")
