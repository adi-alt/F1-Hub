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

# --- deterministic output, content-hashed publishing, old files kept -----------------------------------------------
import json, tempfile
from pathlib import Path
blob = rr.pack(header, steps)
assert blob == rr.pack(header, steps), "identical data gives identical bytes (no timestamp in the gzip header)"
with tempfile.TemporaryDirectory() as tmp:
    pub, man = Path(tmp) / "public" / "replays", Path(tmp) / "src" / "data" / "replays.json"
    e1 = rr.publish(blob, "2026-9", pub, man)
    assert e1["file"].startswith("/replays/2026-9.") and e1["file"].endswith(".bin") and e1["sha256"][:8] in e1["file"]
    assert (pub / e1["file"].split("/")[-1]).read_bytes() == blob and e1["bytes"] == len(blob)
    assert rr.publish(blob, "2026-9", pub, man) == e1 and len(list(pub.iterdir())) == 1, "the same content again: a no-op"
    steps2 = {**steps, "HAM": rr.encode_steps(np.array([-20.0, 9.0, 38.0, 60.0, 90.0, 120.0]))}
    e2 = rr.publish(rr.pack(header, steps2), "2026-9", pub, man)
    assert e2["file"] != e1["file"], "new content, new name"
    assert (pub / e1["file"].split("/")[-1]).exists(), "the old file is kept for visitors on an older deployment"
    manifest = json.loads(man.read_text())
    assert manifest["2026-9"] == e2 and manifest["2026-9"]["version"] == rr.REPLAY_VERSION
    rr.publish(blob, "2018-12", pub, man)
    assert list(json.loads(man.read_text())) == ["2018-12", "2026-9"], "ordered by season and round, numerically"

# --- backfill: only races missing a current replay; one failure doesn't stop the rest ----------------------------
with tempfile.TemporaryDirectory() as tmp:
    man = Path(tmp) / "replays.json"
    man.write_text(json.dumps({
        "2026-1": {"file": "/replays/2026-1.aaaaaaaa.bin", "bytes": 1, "sha256": "a" * 64, "version": rr.REPLAY_VERSION, "hz": rr.REPLAY_HZ},
        "2026-2": {"file": "/replays/2026-2.bbbbbbbb.bin", "bytes": 1, "sha256": "b" * 64, "version": rr.REPLAY_VERSION, "hz": 2},
    }))
    built = []
    saved_build, saved_publish = rr.build_one, rr.publish
    rr.build_one = lambda y, r, d: (built.append(r) or (None, "no archive session")) if r == 3 else (built.append(r) or (b"x", "ok"))
    rr.publish = lambda blob, key, manifest_path=None: {"file": f"/replays/{key}.cccccccc.bin", "bytes": len(blob)}
    done, report = rr.backfill([(2026, 1, None), (2026, 2, None), (2026, 3, None), (2026, 4, None)], manifest_path=man)
    rr.build_one, rr.publish = saved_build, saved_publish
    assert built == [2, 3, 4], f"round 1 is current and skipped; round 2 (2 Hz) is rebuilt: {built}"
    assert done == 2 and any("2026-3: skipped" in l for l in report), report

assert rr.MIN_COVERAGE >= 0.9, "a replay whose position feed stops early must be refused, not published frozen"
print("race_replay: all checks passed")
