"""Plain assert-based self-check (no pytest, no network) for race_track_story.py: feed decoding, timestamps,
lap and lead-change parsing with pit detection, the outline checks, pass location on a synthetic circuit, and
corner naming. `python test_race_track_story.py`.

Every input here is synthetic - a circle for a circuit, hand-written feed lines. These tests pin the logic;
they say nothing about real data. The real-data validation (2026 British and Bahrain GPs) is a separate,
manual run of the script against the live-timing archive.
"""

import base64
import json
import math
import zlib

import numpy as np

import race_track_story as ts


def z(obj) -> str:
    """Encode like the archive's '.z' feeds: raw deflate, base64, quoted."""
    c = zlib.compressobj(wbits=-zlib.MAX_WBITS)
    raw = c.compress(json.dumps(obj).encode()) + c.flush()
    return '"' + base64.b64encode(raw).decode() + '"'


# --- decoding and timestamps ------------------------------------------------------------------------------
assert ts.decode_z(z({"a": 1})) == {"a": 1}
assert ts.parse_stream("00:00:01.500{\"x\":1}\nnot a line\n01:02:03.250[]") == [(1.5, '{"x":1}'), (3723.25, "[]")]
base = ts._utc_seconds("2026-07-05T13:08:31Z")
for stamp, frac in (("2026-07-05T13:08:31.8410509Z", 0.841050), ("2026-07-05T13:08:31.84105Z", 0.84105), ("2026-07-05T13:08:31.8Z", 0.8)):
    assert abs(ts._utc_seconds(stamp) - base - frac) < 1e-6, stamp

# --- a synthetic circuit: a circle of radius 10 000 dm (1 km, a 6.3 km lap), cars going anticlockwise ----------
R = 10_000.0
LAP = 2 * math.pi * R


def circle(fracs):
    a = np.asarray(fracs) * 2 * math.pi
    return np.c_[R * np.cos(a), R * np.sin(a)]


outline = circle(np.arange(200) / 200)
assert abs(ts.lap_length(outline) - LAP) / LAP < 0.001
along, off = ts.project(circle([0.25, 0.5]) * 1.01, outline)
assert abs(along[0] - LAP / 4) < 50 and abs(along[1] - LAP / 2) < 50 and all(abs(o - 100) < 5 for o in off)

# --- outline checks -----------------------------------------------------------------------------------------
good = ts.check_outline(outline, [circle(np.arange(150) / 150 + 0.003)])
assert good.ok and good.field_p95_m < 1, good
gappy = np.delete(outline, range(40, 44), axis=0)  # 4 missing samples = a 157 m jump
assert not ts.check_outline(gappy, [outline]).ok, "a gap in the samples is rejected"
open_lap = outline[:190]  # stops 300 m short of the line
assert not ts.check_outline(open_lap, [outline]).ok, "a lap that doesn't close is rejected"
assert not ts.check_outline(outline, [circle(np.arange(150) / 150) * 1.2]).ok, "disagreement with the field is rejected"
assert not ts.check_outline(outline, []).ok, "no other driver to check against: not trusted"

# --- timing: laps, pit flags, lead changes -------------------------------------------------------------------
timing = "\n".join([
    '00:00:10.000{"Lines":{"1":{"Position":"1"},"2":{"Position":"2"}}}',
    '00:01:00.000{"Lines":{"1":{"NumberOfLaps":1},"2":{"NumberOfLaps":1}}}',
    '00:01:30.000{"Lines":{"2":{"Position":"1"},"1":{"Position":"2"}}}',  # 2 passes 1 on track
    '00:02:00.000{"Lines":{"2":{"NumberOfLaps":2,"InPit":true}}}',
    '00:02:01.000{"Lines":{"1":{"NumberOfLaps":2}}}',
    '00:02:10.000{"Lines":{"1":{"Position":"1"},"2":{"Position":"2"}}}',  # 2 is in the pits
    '00:02:20.000{"Lines":{"2":{"InPit":false,"PitOut":true}}}',
    '00:03:05.000{"Lines":{"2":{"NumberOfLaps":3}}}',
])
laps, changes = ts.parse_timing(timing, clock_offset=1000.0)
assert [(c.new, c.old, c.old_in_pit) for c in changes] == [("2", "1", False), ("1", "2", True)]
assert changes[0].t == 1090.0, "stream offset + clock offset"
lap2 = next(l for l in laps if l.car == "2" and l.number == 2)
lap3 = next(l for l in laps if l.car == "2" and l.number == 3)
assert lap2.pit and not lap2.pit_out and lap3.pit_out and not lap3.pit, "flags belong to the lap they happened on"
assert [l.number for l, _ in ts.clean_laps(laps)] == [], "laps 1-2 are never clean and lap 3 has a pit exit"

# A leader who entered the pits shortly before losing P1 counts as a pit change even if InPit is already false.
late = "\n".join([
    '00:00:01.000{"Lines":{"1":{"Position":"1"}}}',
    '00:00:05.000{"Lines":{"1":{"InPit":true}}}',
    '00:00:25.000{"Lines":{"1":{"InPit":false}}}',
    '00:00:30.000{"Lines":{"2":{"Position":"1"}}}',
])
assert ts.parse_timing(late, 0.0)[1][0].old_in_pit

# --- locating a pass ----------------------------------------------------------------------------------------
# Car A runs a steady 50 m/s; car B starts 30 m behind at 52 m/s, so it draws level after 15 s. Sampled at 4 Hz
# with B's samples offset by 0.13 s, as two cars' samples never line up in the feed.
t = np.arange(0, 60, 0.25)
a_s = 500 * t  # decimetres
b_t = t + 0.13
b_s = -300 + 520 * b_t
def track(times, s):
    xy = circle(s / LAP)
    return ts.Track(times + 10_000, xy[:, 0], xy[:, 1])
A, B = track(t, a_s), track(b_t, b_s)
p = ts.locate_pass(B, A, outline, reordered_at=10_000 + 40)
assert p is not None and p.crossovers == 1
assert abs((p.t - 10_000) - 15.0) < 0.1, p.t
assert abs(p.along - (500 * 15) % LAP) < 30, "within 3 m of where they drew level"
assert ts.locate_pass(A, B, outline, reordered_at=10_000 + 40) is None, "the car that fell behind didn't pass anyone"

assert p.uncertainty_m < ts.VERIFIED_UNCERTAINTY_M, f"4 Hz at ~50 m/s is a few metres: {p.uncertainty_m}"
assert p.off_line_m < 1, "both cars on the outline"
# The same move sampled every 2 s: the location is interpolated across ~100 m, so it's only approximate.
ts2 = np.arange(0, 60, 2.0)
sparse = ts.locate_pass(track(ts2 + 0.13, -300 + 520 * (ts2 + 0.13)), track(ts2, 500 * ts2), outline, reordered_at=10_000 + 40)
assert sparse is not None and sparse.uncertainty_m > ts.VERIFIED_UNCERTAINTY_M, sparse

# A battle that goes on after the timing feed re-ordered them: B gets ahead at 15 s (the re-order comes at 18 s),
# drops back at 20 s and gets ahead again at 21 s. The move that changed the lead is the one at 15 s.
tb = np.arange(0, 60, 0.25) + 0.13
def b_dist(tt):
    base = -300 + 520 * tt  # ahead from 15 s
    return np.where((tt > 20) & (tt < 21), 500 * tt - 50, base)  # 5 m behind for a second, then ahead again
battle = ts.locate_pass(track(tb, b_dist(tb)), A, outline, reordered_at=10_000 + 18)
assert battle is not None and abs((battle.t - 10_000) - 15.0) < 0.2, f"the pass before the re-order, not the swap after it: {battle.t - 10_000}"

# The timing feed's clock is good to about a second: a pass the cars complete 1 s after the stamped re-order is
# still the one that changed the lead.
late = ts.locate_pass(B, A, outline, reordered_at=10_000 + 14.0)
assert late is not None and abs((late.t - 10_000) - 15.0) < 0.1, "found within the clock tolerance"
assert ts.locate_pass(B, A, outline, reordered_at=10_000 + 13.0) is None, "2 s before the cars actually crossed: not this pass"

# --- matching the archive session by date -------------------------------------------------------------------
INDEX = (("2018-04-08", "2018/bahrain/"), ("2018-04-15", "2018/china/"), ("2018-04-29", "2018/baku/"))
ts.season_races.cache_clear()
real_season_races = ts.season_races
ts.season_races = lambda year: INDEX  # an index missing round 1 (Australia), as 2018's really is
assert ts.session_path(2018, 2, "2018-04-08") == "/static/2018/bahrain/", "round 2 found by its date, not shifted"
assert ts.session_path(2018, 3, "2018-04-16") == "/static/2018/china/", "a day's difference (time zones) is fine"
assert ts.session_path(2018, 1, "2018-03-25") is None, "not in the index: nothing, never a neighbour"
assert ts.session_path(2018, 2) == "/static/2018/china/", "without a date, by position"
ts.season_races = lambda year: None
assert ts.session_path(2022, 1, "2022-03-20") is None, "no index for the season"
ts.season_races = real_season_races


# --- the backfill: one bad race doesn't end the run, and failures can't use up the budget -------------------
class FakeCursor:
    def __init__(self, rows):
        self.rows, self.stored, self.rollbacks, self.commits = rows, [], 0, 0
        self.connection = self
    def execute(self, sql, params=None):
        if sql.strip().startswith("insert"):
            if params[0] == "bad_write":
                raise RuntimeError("constraint violated")
            self.stored.append(params[0])
    def fetchall(self):
        return self.rows
    def commit(self):
        self.commits += 1
    def rollback(self):
        self.rollbacks += 1

STORY = {"version": ts.STORY_VERSION, "outline": [[0, 0]] * 60, "corners": [], "leadChanges": []}
def fake_build(feeds, corners, rotation, winner):
    if feeds["id"] == "crash":
        raise IndexError("malformed feed")
    return (None, {"rejected": "outline failed its checks"}) if feeds["id"] == "reject" else (STORY, {})
saved = (ts.session_path, ts.fetch_feeds, ts.fetch_circuit, ts.build_story)
ts.session_path = lambda y, r, d=None: None if r == 0 else f"/static/{r}/"
ts.fetch_feeds = lambda path: {"SessionInfo.json": '{"Meeting":{"Circuit":{"Key":1}}}', "id": IDS[path]}
ts.fetch_circuit = lambda key, year: ([], None)
ts.build_story = fake_build
rows = [("missing", 2026, 0, None, None), ("crash", 2026, 1, None, None), ("reject", 2026, 2, None, None),
        ("bad_write", 2026, 3, None, None), ("ok1", 2026, 4, None, None), ("ok2", 2026, 5, None, None), ("ok3", 2026, 6, None, None)]
IDS = {f"/static/{r[2]}/": r[0] for r in rows}
cur = FakeCursor(rows)
assert ts.backfill(cur, since=2026, limit=2, dry_run=False) == 2
assert cur.stored == ["ok1", "ok2"], cur.stored
assert cur.rollbacks == 1, "the failed write was rolled back, and the run went on"
cur = FakeCursor(rows)
assert ts.backfill(cur, since=2026, limit=1, dry_run=False) == 0, "4 attempts (missing, crash, reject, bad write): budget spent"
dry = FakeCursor(rows)
ts.backfill(dry, since=2026, limit=10, dry_run=True)
assert dry.stored == [] and dry.commits == 0, "a dry run writes nothing"
ts.session_path, ts.fetch_feeds, ts.fetch_circuit, ts.build_story = saved

# --- corners ------------------------------------------------------------------------------------------------
corners = [{"number": n, "letter": "", "x": float(x), "y": float(y)} for n, (x, y) in enumerate(circle([0.1, 0.4, 0.7]), start=1)]
vc = ts.verified_corners(corners, outline)
assert [c["number"] for c in vc] == [1, 2, 3]
assert ts.verified_corners([{**c, "x": c["x"] + 2000} for c in corners], outline) == [], "another layout's corners are dropped"
assert ts.describe_location(0.1 * LAP - 100, vc, LAP) == "into Turn 1"
assert ts.describe_location(0.1 * LAP + 300, vc, LAP) == "into Turn 1"
assert ts.describe_location(0.25 * LAP, vc, LAP) == "between Turn 1 and Turn 2"
assert ts.describe_location(0.95 * LAP, vc, LAP) == "between Turn 3 and Turn 1", "wraps through the line"
assert ts.describe_location(0.25 * LAP, [], LAP) is None, "no verified corners, no turn names"

print("race_track_story: all checks passed")
