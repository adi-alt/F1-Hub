"""Plain assert-based self-check, same style as test_fetch_races.py - `python test_race_identity.py`.
Covers race identity across repeated and renumbered syncs, calendar retirement (cancellations,
partial calendars), the venue-correction mechanism, and the 2026 Bahrain Grand Prix - relocated to
Sepang, Malaysia - staying "Kuala Lumpur" on every sync (an earlier, wrong "Sakhir" correction was
removed before release; the regression checks below keep it from coming back). The SQL side of
the same rules (candidate selection in pipeline/sql/next_round_candidates.sql) is not covered here -
these tests use fake cursors.
"""

import datetime

from race_identity import (
    REVIEWED_VENUE_CHANGES,
    RaceIdentityConflict,
    VENUE_OVERRIDES,
    calendar_row_id,
    calendar_rows_to_retire,
    corrected_location,
    id_slug,
    race_id_for,
    resolve_race_id,
    slugify,
)
from sync_calendar import plan_calendar_sync
from fetch_races import resolve_round_race_id

utc = datetime.timezone.utc
NOW = datetime.datetime(2026, 9, 29, 12, tzinfo=utc)


def raises(exc_type, fn, *args):
    try:
        fn(*args)
    except exc_type as exc:
        return exc
    raise AssertionError(f"expected {exc_type.__name__}")


# --- ids and slugs -----------------------------------------------------------------------------
assert slugify("São Paulo Grand Prix") == "sao-paulo-grand-prix"
assert race_id_for(2026, 16, "Bahrain Grand Prix") == "2026_r16_bahrain-grand-prix"
assert id_slug("2026_r16_bahrain-grand-prix") == "bahrain-grand-prix"
assert id_slug("2026_r05_x-y") == "x-y"
assert id_slug("not-an-id") is None
print("ids: all checks passed")


# --- resolve_race_id -------------------------------------------------------------------------
existing = [("2026_r14_spanish-grand-prix", 14), ("2026_r15_azerbaijan-grand-prix", 15)]
# A new round: fresh id.
assert resolve_race_id(existing, 2026, 16, "Bahrain Grand Prix") == "2026_r16_bahrain-grand-prix"
# The same round again (a repeated sync): the same id, never a second row.
existing_16 = existing + [("2026_r16_bahrain-grand-prix", 16)]
assert resolve_race_id(existing_16, 2026, 16, "Bahrain Grand Prix") == "2026_r16_bahrain-grand-prix"
# Renumbered upstream (an earlier round was cancelled): same event keeps its id - its picks and
# prediction rounds stay attached; the caller writes round 15 onto that row.
renumbered = [("2026_r14_spanish-grand-prix", 14), ("2026_r16_bahrain-grand-prix", 16)]
assert resolve_race_id(renumbered, 2026, 15, "Bahrain Grand Prix") == "2026_r16_bahrain-grand-prix"
# Another event already holds the round (upstream rename, or a stale row): refuse, don't duplicate.
exc = raises(RaceIdentityConflict, resolve_race_id, existing, 2026, 15, "Baku City Grand Prix")
assert "2026_r15_azerbaijan-grand-prix" in str(exc)
# The event's own row exists, but a different event occupies the round it is moving to.
exc = raises(RaceIdentityConflict, resolve_race_id, existing_16, 2026, 15, "Bahrain Grand Prix")
assert "2026_r15_azerbaijan-grand-prix" in str(exc)
# Two rows already exist for one event (only a manual edit could do this): refuse.
raises(RaceIdentityConflict, resolve_race_id, [("2026_r16_bahrain-grand-prix", 16), ("2026_r17_bahrain-grand-prix", 17)], 2026, 16, "Bahrain Grand Prix")
# A new races row takes the live calendar row's id for the event, so the two tables share one id
# even if the calendar row was renumbered before any race data existed.
assert resolve_race_id(existing, 2026, 16, "Bahrain Grand Prix", "2026_r17_bahrain-grand-prix") == "2026_r17_bahrain-grand-prix"
# ... but never another event's calendar id.
assert resolve_race_id(existing, 2026, 16, "Bahrain Grand Prix", "2026_r16_qatar-grand-prix") == "2026_r16_bahrain-grand-prix"
# Seasons never mix: the same event in another season is a different race.
assert resolve_race_id([("2025_r04_bahrain-grand-prix", 4)], 2026, 16, "Bahrain Grand Prix") == "2026_r16_bahrain-grand-prix"
print("resolve_race_id: all checks passed")


# --- resolve_round_race_id: what build_and_push actually runs before any write ------------------
class Cursor:
    """Two queries, in order: every races (id, round) of the season, then the event's live calendar
    row id. Records them so a test can see nothing else (no write) was executed."""

    def __init__(self, races, calendar_id):
        self._results = [races, (calendar_id,) if calendar_id else None]
        self.executed = []

    def execute(self, query, params=None):
        self.executed.append(query)
        self._current = self._results.pop(0)

    def fetchall(self):
        return self._current

    def fetchone(self):
        return self._current


cur = Cursor([], "2026_r16_bahrain-grand-prix")
assert resolve_round_race_id(cur, 2026, 16, "Bahrain Grand Prix") == "2026_r16_bahrain-grand-prix"
cur = Cursor(existing, None)
raises(RaceIdentityConflict, resolve_round_race_id, cur, 2026, 15, "Baku City Grand Prix")
assert all(q.lstrip().lower().startswith("select") for q in cur.executed), cur.executed
print("resolve_round_race_id: all checks passed")


# --- venue corrections -------------------------------------------------------------------------
# REGRESSION: the 2026 Bahrain GP is at Sepang (Kuala Lumpur). The upstream value must pass through
# untouched - the removed "Sakhir" override must never come back.
assert (2026, "bahrain-grand-prix") not in VENUE_OVERRIDES
assert corrected_location(2026, "Bahrain Grand Prix", "Kuala Lumpur") == "Kuala Lumpur"
# Genuine venue changes pass through too.
assert corrected_location(2026, "Spanish Grand Prix", "Madrid") == "Madrid"
assert corrected_location(2025, "Bahrain Grand Prix", "Sakhir") == "Sakhir"

# The mechanism itself, on a synthetic entry (restored afterwards): applied only to its own (season,
# event), idempotent on an already-correct value, and not leaking into other seasons.
VENUE_OVERRIDES[(2031, "test-grand-prix")] = {"location": "Right Town", "reason": "synthetic test entry"}
try:
    assert corrected_location(2031, "Test Grand Prix", "Wrong Town") == "Right Town"
    assert corrected_location(2031, "Test Grand Prix", "Right Town") == "Right Town"
    assert corrected_location(2030, "Test Grand Prix", "Wrong Town") == "Wrong Town"
    assert corrected_location(2031, "Other Grand Prix", "Wrong Town") == "Wrong Town"
finally:
    del VENUE_OVERRIDES[(2031, "test-grand-prix")]
assert all(set(v) >= {"location", "reason"} for v in VENUE_OVERRIDES.values())
assert all(set(v) >= {"location", "previous", "kind", "reason"} for v in REVIEWED_VENUE_CHANGES.values())
# A reviewed change and a correction for the same event would contradict each other.
assert not set(REVIEWED_VENUE_CHANGES) & set(VENUE_OVERRIDES)
print("corrected_location: all checks passed")


# --- plan_calendar_sync ------------------------------------------------------------------------
def event(round_num, name, location, race_day, fmt="conventional", country="X"):
    """A FastF1 schedule row (dict-like): conventional weekends get FP1-FP3/Q/R, sprint weekends
    FP1/SQ/S/Q/R, on consecutive days ending on race_day."""
    labels = ["Practice 1", "Sprint Qualifying", "Sprint", "Qualifying", "Race"] if fmt.startswith("sprint") else ["Practice 1", "Practice 2", "Practice 3", "Qualifying", "Race"]
    base = datetime.datetime.combine(race_day, datetime.time(12))
    offsets = [-2, -2, -1, -1, 0]
    row = {"RoundNumber": round_num, "EventName": name, "Location": location, "Country": country, "EventFormat": fmt}
    for i, (label, off) in enumerate(zip(labels, offsets), start=1):
        row[f"Session{i}"] = label
        row[f"Session{i}DateUtc"] = base + datetime.timedelta(days=off)  # naive, like FastF1
    return row


d = datetime.date
upstream = [
    event(15, "Azerbaijan Grand Prix", "Baku", d(2026, 9, 27)),
    event(16, "Bahrain Grand Prix", "Kuala Lumpur", d(2026, 10, 11)),  # correct: relocated to Sepang
    event(17, "Singapore Grand Prix", "Marina Bay", d(2026, 10, 25), fmt="sprint_qualifying"),
]
forecasts = []


def forecast(event_name, location, round_num, race_date):
    forecasts.append((event_name, location))
    return None


rows, retire, warnings = plan_calendar_sync(2026, upstream, [], [], NOW, forecast)
by_id = {r["id"]: r for r in rows}
assert sorted(by_id) == ["2026_r15_azerbaijan-grand-prix", "2026_r16_bahrain-grand-prix", "2026_r17_singapore-grand-prix"]
# Bahrain at Sepang: stored as upstream says, and the live-forecast lookup geocodes Kuala Lumpur, not
# Bahrain. No correction warning is emitted.
assert by_id["2026_r16_bahrain-grand-prix"]["circuit"] == "Kuala Lumpur"
assert by_id["2026_r16_bahrain-grand-prix"]["country"] == "X"  # passed through from upstream as-is
assert ("Bahrain Grand Prix", "Kuala Lumpur") in forecasts and all(loc != "Sakhir" for _, loc in forecasts)
assert not any("overridden" in w for w in warnings), warnings
# Past races get no forecast lookup; status follows the race date.
assert ("Azerbaijan Grand Prix", "Baku") not in forecasts
assert by_id["2026_r15_azerbaijan-grand-prix"]["status"] == "completed"
assert by_id["2026_r16_bahrain-grand-prix"]["status"] == "upcoming"
# Sprint format and its sessions come through as-is.
assert by_id["2026_r17_singapore-grand-prix"]["event_format"] == "sprint_qualifying"
assert "Sprint Qualifying" in by_id["2026_r17_singapore-grand-prix"]["sessions"]
assert retire == []

# The scheduled sync running again (weekly) against the rows the first one stored produces the
# identical plan: same ids, still Kuala Lumpur, nothing retired.
stored = [(r["id"], r["round"], r["status"]) for r in rows]
rows2, retire2, _ = plan_calendar_sync(2026, upstream, stored, [], NOW, forecast)
assert rows2 == rows and retire2 == []

# Round 16 exactly as FastF1 publishes it (offline cache, 2026-09-29): event identity, venue and the
# real session times (UTC; local UTC+8) survive into the stored row unchanged.
def real_bahrain():
    row = {"RoundNumber": 16, "EventName": "Bahrain Grand Prix", "Location": "Kuala Lumpur", "Country": "Bahrain", "EventFormat": "conventional"}
    for i, (label, ts) in enumerate([("Practice 1", "2026-10-02T04:30:00"), ("Practice 2", "2026-10-02T08:00:00"), ("Practice 3", "2026-10-03T04:30:00"), ("Qualifying", "2026-10-03T08:00:00"), ("Race", "2026-10-04T07:00:00")], start=1):
        row[f"Session{i}"] = label
        row[f"Session{i}DateUtc"] = datetime.datetime.fromisoformat(ts)  # naive, like FastF1
    return row

import json as _json
live_like = [("2026_r16_bahrain-grand-prix", 16, "upcoming")]  # the live calendar row
bahrain_rows, bahrain_retire, bahrain_warn = plan_calendar_sync(2026, [real_bahrain()], live_like, [], NOW, forecast)
assert [(r["id"], r["round"], r["circuit"], r["country"], r["status"], r["race_date"]) for r in bahrain_rows] == [
    ("2026_r16_bahrain-grand-prix", 16, "Kuala Lumpur", "Bahrain", "upcoming", "2026-10-04T07:00:00")
]
assert [s["date"] for s in _json.loads(bahrain_rows[0]["sessions"])] == ["2026-10-02T04:30:00", "2026-10-02T08:00:00", "2026-10-03T04:30:00", "2026-10-03T08:00:00", "2026-10-04T07:00:00"]
assert bahrain_retire == [] and bahrain_warn == []
print("plan_calendar_sync (Bahrain at Sepang, repeat sync): all checks passed")

# The correction mechanism end to end, on a synthetic event: the corrected value is stored AND used for
# the forecast lookup, the change is reported, and a repeat sync keeps it.
VENUE_OVERRIDES[(2026, "test-grand-prix")] = {"location": "Right Town", "reason": "synthetic test entry"}
try:
    forecasts.clear()
    t_rows, _, t_warn = plan_calendar_sync(2026, [event(24, "Test Grand Prix", "Wrong Town", d(2026, 12, 13))], [], [], NOW, forecast)
    assert t_rows[0]["circuit"] == "Right Town" and ("Test Grand Prix", "Right Town") in forecasts
    assert any("Wrong Town" in w and "Right Town" in w for w in t_warn)
    t_rows2, _, _ = plan_calendar_sync(2026, [event(24, "Test Grand Prix", "Wrong Town", d(2026, 12, 13))], [(r["id"], r["round"], r["status"]) for r in t_rows], [], NOW, forecast)
    assert t_rows2 == t_rows
finally:
    del VENUE_OVERRIDES[(2026, "test-grand-prix")]
print("plan_calendar_sync (correction mechanism): all checks passed")

# Cancellation with renumbering: Bahrain is dropped, Singapore moves up to round 16. Singapore keeps
# its id; Bahrain's row is retired (cancelled, not deleted) because its round is inside the fresh range.
after_cancel = [upstream[0], event(16, "Singapore Grand Prix", "Marina Bay", d(2026, 10, 25), fmt="sprint_qualifying")]
rows3, retire3, _ = plan_calendar_sync(2026, after_cancel, stored, [], NOW, forecast)
assert [(r["id"], r["round"]) for r in rows3] == [("2026_r15_azerbaijan-grand-prix", 15), ("2026_r17_singapore-grand-prix", 16)]
assert retire3 == ["2026_r16_bahrain-grand-prix"]

# A partial upstream response (only the first round came back): later rounds are kept with a
# warning, never retired; an empty response retires nothing at all.
rows4, retire4, warnings4 = plan_calendar_sync(2026, upstream[:1], stored, [], NOW, forecast)
assert retire4 == [] and sum("possibly a partial calendar" in w for w in warnings4) == 2
assert plan_calendar_sync(2026, [], stored, [], NOW, forecast)[:2] == ([], [])

# A row already cancelled (by an earlier sync or by a person) stays cancelled if upstream lists the
# event again - flagged for a person instead of silently showing a cancelled race as upcoming.
# Postponed is kept the same way (the pipeline never writes it itself).
cancelled_stored = [(i, r, "cancelled" if i.endswith("bahrain-grand-prix") else s) for i, r, s in stored]
rows5, retire5, warnings5 = plan_calendar_sync(2026, upstream, cancelled_stored, [], NOW, forecast)
assert {r["id"]: r["status"] for r in rows5}["2026_r16_bahrain-grand-prix"] == "cancelled"
assert retire5 == [] and any("kept; clear the status by hand" in w for w in warnings5)

# A calendar row created after the races row already exists takes the races id, not a fresh one.
assert calendar_row_id([], ["2026_r16_bahrain-grand-prix"], 2026, 15, "Bahrain Grand Prix") == "2026_r16_bahrain-grand-prix"
# Live calendar row beats a cancelled duplicate for the same event.
assert calendar_row_id([("2026_r09_x", 9, "cancelled"), ("2026_r10_x", 10, "upcoming")], [], 2026, 10, "X") == "2026_r10_x"
print("plan_calendar_sync (cancellation, partial calendar, sticky status): all checks passed")


# --- calendar_rows_to_retire (direct) ------------------------------------------------------------
assert calendar_rows_to_retire([("2026_r05_a", 5, "upcoming")], set(), {}) == ([], [])
assert calendar_rows_to_retire([("2026_r05_a", 5, "cancelled")], {"2026_r05_b"}, {"b": 5}) == ([], [])
# Same event under a different id (re-slugged/duplicate) is retired even beyond the fresh range.
assert calendar_rows_to_retire([("2026_r09_b", 9, "upcoming")], {"2026_r05_b"}, {"b": 5}) == (["2026_r09_b"], [])
print("calendar_rows_to_retire: all checks passed")


# --- audit_data_consistency: the checks added with this change -------------------------------------
from audit_data_consistency import audit_unfetched_rounds, audit_venue_drift


class RowsCursor:
    def __init__(self, rows):
        self._rows = rows

    def execute(self, query, params=None):
        pass

    def fetchall(self):
        return self._rows


real_now = datetime.datetime.now(utc)
ended = [{"label": "Race", "date": (real_now - datetime.timedelta(days=3)).replace(tzinfo=None).isoformat()}]
recent = [{"label": "Race", "date": (real_now - datetime.timedelta(hours=2)).replace(tzinfo=None).isoformat()}]
problems = audit_unfetched_rounds(RowsCursor([("2026_r16_bahrain-grand-prix", ended), ("2026_r17_singapore-grand-prix", recent), ("2026_r18_x", None)]))
assert len(problems) == 1 and problems[0].startswith("2026_r16_bahrain-grand-prix") and "never fetched" in problems[0], problems

drift = audit_venue_drift(RowsCursor([
    (2026, "spanish-grand-prix", "Madrid", "Barcelona"),  # real move, not yet marked reviewed: warned
    (2026, "bahrain-grand-prix", "Kuala Lumpur", "Sakhir"),  # reviewed relocation: silent
    (2026, "monaco-grand-prix", "Monte Carlo", "Monaco"),  # reviewed naming: silent
    (2026, "abu-dhabi-grand-prix", "Yas Marina", "Yas Island"),  # reviewed naming: silent
]))
assert len(drift) == 1 and "Madrid" in drift[0], drift
# A reviewed event whose upstream value changes AGAIN is warned about again.
again = audit_venue_drift(RowsCursor([(2026, "bahrain-grand-prix", "Somewhere Else", "Sakhir")]))
assert len(again) == 1 and "Somewhere Else" in again[0], again
# A reviewed correction that isn't stored yet is reported (synthetic entry).
VENUE_OVERRIDES[(2026, "test-grand-prix")] = {"location": "Right Town", "reason": "synthetic test entry"}
try:
    pending = audit_venue_drift(RowsCursor([(2026, "test-grand-prix", "Wrong Town", "Right Town")]))
    assert len(pending) == 1 and "not applied yet" in pending[0] and "'Right Town'" in pending[0], pending
finally:
    del VENUE_OVERRIDES[(2026, "test-grand-prix")]
print("audit_data_consistency additions: all checks passed")
