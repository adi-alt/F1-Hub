"""Plain assert-based self-check (no pytest, no network) for race_replay.py: the race window, spike removal, and
the packed format round-tripping exactly - including a pit-lane jump too big for one byte. `python test_race_replay.py`.

Synthetic inputs; the real race (2026 British GP) was built and checked in the browser."""

import numpy as np

import race_replay as rr

# --- the race window: SessionStatus Started -> Finished, in UTC seconds -------------------------------------------
status = "\n".join([
    '00:00:06.582{"Status":"Inactive","Started":"Inactive"}',
    '00:55:39.562{"Status":"Started","Started":"Started"}',
    '02:22:51.125{"Status":"Finished","Started":"Finished"}',
])
start, finish = rr.race_window(status, clock=1000.0)
assert abs(start - (1000 + 55 * 60 + 39.562)) < 1e-6 and abs(finish - (1000 + 2 * 3600 + 22 * 60 + 51.125)) < 1e-6
assert rr.race_window('00:00:06.000{"Status":"Started"}', 0) is None, "no finish: no window"

# --- spikes: one bad sample between two good ones is removed; real movement isn't ---------------------------------
v = np.array([0, 30, 60, 28, 120, 150, 180], dtype=float)  # sample 3 is ~60 m behind where it should be
d = rr.despike(v)
assert d[3] == 60 and np.all(np.diff(d) >= 0), d
steady = np.arange(0, 300, 30, dtype=float)
assert np.array_equal(rr.despike(steady), steady), "a car moving normally is untouched"

# --- packing: exact round trip, the escape for big steps, one byte per ordinary step -----------------------------
cars = {"LEC": np.array([-12.0, 18.0, 49.0, 80.0, 380.0, 410.0]), "HAM": np.array([-20.0, 9.0, 38.0, 38.0, 38.0, 70.0])}
steps = {c: rr.encode_steps(v) for c, v in cars.items()}
assert len(steps["HAM"]) == 2 + 5, "an int16 start, then one byte per step"
assert len(steps["LEC"]) == 2 + 5 + 2, "the 300 m pit-lane jump costs two extra bytes, and is not clipped"
header = {"version": rr.REPLAY_VERSION, "hz": 2, "samples": 6, "cars": [{"code": "LEC"}, {"code": "HAM"}]}
back_header, back = rr.unpack(rr.pack(header, steps))
assert back_header["stepBytes"] == [len(steps["LEC"]), len(steps["HAM"])]
for c, v in cars.items():
    assert np.array_equal(back[c], np.round(v).astype(np.int64)), (c, back[c])

print("race_replay: all checks passed")
