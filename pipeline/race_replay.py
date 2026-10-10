"""Race replay: every car's progress through a race, small enough to ship to a browser, drawn on the race's own
traced circuit (race_track_story.py) - the cars moving round the real track, the running order, pit stops,
retirements, flags.

From F1's live-timing archive (residential connection only - see run_local.sh), trimmed to the race itself
(SessionStatus: Started -> Finished): each car is one number per sample, its distance travelled since lights out,
in whole metres - the circuit's shape is already in the race's story, so the browser places the car on the track
from how far round the lap it is, and the running order is just who has gone furthest. Sampled at REPLAY_HZ,
stored as the change since the previous sample - one byte each (an escape for the rare bigger pit-lane jump) -
in one gzipped binary file with a small JSON header (pack/unpack). Measured on the 2026 British GP: an 88-minute
race, 22 cars, from a 12.7 MB position feed to 152 KB at two samples a second, ~75 KB at one (REPLAY_HZ).

What it can't show: the pit lane's own line (a car in the pits is drawn on the track beside it, and marked in the
pits), or two cars side by side (they're one distance apart, not two lines).

Usage:
  python race_replay.py --year 2026 --round 9 --out replay.json   # build one race, write the file
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import struct
from pathlib import Path
import os
import sys

import numpy as np

import race_track_story as ts

REPLAY_VERSION = 1
# One sample a second: the browser interpolates between samples, so motion stays smooth, and a race is ~75 KB
# (2 a second was ~150 KB). An overtake is timed to within half a second.
REPLAY_HZ = 1
MIN_COVERAGE = 0.9  # the median car's samples must span this share of the race
TAIL_S = 30  # keep a little after the flag: the last cars crossing the line
# TrackStatus codes F1 uses in the feed.
TRACK_STATUS = {"1": "clear", "2": "yellow", "4": "sc", "5": "red", "6": "vsc", "7": "vsc_ending"}


def _events(text: str) -> list[tuple[float, dict]]:
    out = []
    for off, payload in ts.parse_stream(text):
        try:
            out.append((off, json.loads(payload)))
        except json.JSONDecodeError:
            continue
    return out


def race_window(session_status: str, clock: float) -> tuple[float, float] | None:
    """Lights out and the chequered flag, in UTC seconds, from SessionStatus (Started -> Finished)."""
    started = finished = None
    for off, e in _events(session_status):
        if e.get("Status") == "Started" and started is None:
            started = off + clock
        if e.get("Status") == "Finished" and finished is None:
            finished = off + clock
    return (started, finished) if started is not None and finished is not None and finished > started else None


def distance_since_start(track: ts.Track, outline: np.ndarray, start: float, end: float) -> tuple[np.ndarray, np.ndarray]:
    """(times, metres travelled since lights out) for one car. On the grid a car is just behind the line, a lap's
    length 'into' the lap: counted from there as slightly negative, so the order at the start is the grid order."""
    t, s, _ = ts._unwrapped_distance(track, outline, start - 5, end)
    if len(t) == 0:
        return t, s
    lap = ts.lap_length(outline)
    s0 = float(np.interp(start, t, s))  # where the car was at lights out, decimetres into the lap
    at_start = s0 - lap if s0 > lap / 2 else s0  # behind the line: negative
    return t, (s - s0 + at_start) / 10


def despike(values: np.ndarray) -> np.ndarray:
    """A 3-sample median: removes a single bad sample (the feed has them - one position ~60 m behind, between two
    good ones; 56 in the 2026 British GP, nearly all at one spot) without moving any real one."""
    if len(values) < 3:
        return values
    out = values.copy()
    out[1:-1] = np.median(np.stack([values[:-2], values[1:-1], values[2:]]), axis=0)
    return out


ESCAPE = -128  # an int8 step of -128 means: the real step follows as an int16 (a pit-lane jump)


def encode_steps(values: np.ndarray) -> bytes:
    """Whole metres: an int16 starting value, then one int8 per sample - the step since the previous one. At
    REPLAY_HZ a car moves at most ~45 m per sample on track; a bigger step (the pit lane runs beside the track, so
    a car there can jump along it) is written as ESCAPE + int16, never clipped. Little-endian."""
    m = np.round(values).astype(np.int64)
    out = bytearray(struct.pack("<h", int(np.clip(m[0], -32768, 32767))))
    for step in np.diff(m):
        if -127 <= step <= 127:
            out += struct.pack("<b", int(step))
        else:
            out += struct.pack("<bh", ESCAPE, int(np.clip(step, -32768, 32767)))
    return bytes(out)


def pack(replay: dict, steps: dict[str, bytes]) -> bytes:
    """One gzipped file: a 4-byte header length, the JSON header, then each car's steps in header["cars"] order
    (their byte lengths are in the header). The browser reads it with DecompressionStream - no library."""
    header = {**replay, "stepBytes": [len(steps[c["code"]]) for c in replay["cars"]]}
    h = json.dumps(header, separators=(",", ":")).encode()
    # mtime=0: gzip otherwise stamps the current time into the file, so rebuilding identical data would give new bytes
    # - and a new content-hashed filename - every time.
    return gzip.compress(struct.pack("<I", len(h)) + h + b"".join(steps[c["code"]] for c in replay["cars"]), 9, mtime=0)


def unpack(blob: bytes) -> tuple[dict, dict[str, np.ndarray]]:
    """The inverse of pack: the header and each car's distances, in whole metres."""
    raw = gzip.decompress(blob)
    (n,) = struct.unpack_from("<I", raw, 0)
    header = json.loads(raw[4 : 4 + n])
    pos, out = 4 + n, {}
    for car, size in zip(header["cars"], header["stepBytes"]):
        chunk, values, i = raw[pos : pos + size], [], 2
        cur = struct.unpack_from("<h", chunk, 0)[0]
        values.append(cur)
        while i < len(chunk):
            (step,) = struct.unpack_from("<b", chunk, i)
            i += 1
            if step == ESCAPE:
                (step,) = struct.unpack_from("<h", chunk, i)
                i += 2
            cur += step
            values.append(cur)
        out[car["code"]] = np.array(values)
        pos += size
    return header, out


def build_replay(feeds: dict[str, str], story: dict) -> tuple[dict | None, dict]:
    """The replay for one race and its story (for the outline), or None with why."""
    tracks, clock = ts.parse_positions(feeds["Position.z.jsonStream"])
    window = race_window(feeds["SessionStatus.jsonStream"], clock)
    if window is None:
        return None, {"rejected": "no start/finish in SessionStatus"}
    start, finish = window
    end = finish + TAIL_S
    outline = np.array(story["outline"], dtype=float)

    drivers = {}
    for _, e in _events(feeds["DriverList.jsonStream"]):
        for car, v in e.items():
            if isinstance(v, dict) and v.get("Tla"):
                d = drivers.setdefault(car, {})
                d.update({k: v[k] for k in ("Tla", "TeamName", "TeamColour", "FullName") if v.get(k)})
    grid = np.arange(start, end, 1 / REPLAY_HZ)
    cars, dist, coverage = [], {}, []
    for car, info in sorted(drivers.items(), key=lambda kv: int(kv[0])):
        tr = tracks.get(car)
        if tr is None or "Tla" not in info:
            continue
        t, s = distance_since_start(tr, outline, start, end)
        if len(t) < 10:
            continue
        # A car's samples must cover the race: a feed that stops early (2026 Monaco's ends 5 minutes in) would leave
        # the car frozen for the rest of the replay.
        coverage.append(min(1.0, (t[-1] - start) / (end - start)))
        cars.append({"code": info["Tla"], "number": car, "team": info.get("TeamName"), "color": f"#{info['TeamColour']}" if info.get("TeamColour") else None, "name": info.get("FullName")})
        # Before a car's first sample or after its last (retired, garage): hold the nearest - np.interp does.
        dist[info["Tla"]] = despike(np.interp(grid, t, s))

    if not coverage or float(np.median(coverage)) < MIN_COVERAGE:
        return None, {"rejected": f"position data covers only {np.median(coverage or [0]):.0%} of the race"}

    # Pit stops and retirements, from the timing feed, as sample indexes.
    pits, retired, in_pit = [], {}, {}
    idx = lambda t: int(max(0, min(len(grid) - 1, round((t - start) * REPLAY_HZ))))  # noqa: E731
    code_of = {c["number"]: c["code"] for c in cars}
    for off, e in _events(feeds["TimingData.jsonStream"]):
        t = off + clock
        for car, v in (e.get("Lines") or {}).items():
            if not isinstance(v, dict) or car not in code_of:
                continue
            if "InPit" in v:
                if v["InPit"] and car not in in_pit:
                    in_pit[car] = t
                elif not v["InPit"] and car in in_pit:
                    a = in_pit.pop(car)
                    if a < end and t > start:
                        pits.append([code_of[car], idx(a), idx(t)])
            if v.get("Retired") and code_of[car] not in retired and start <= t <= end:
                retired[code_of[car]] = idx(t)
    for car, a in in_pit.items():  # still in the pits at the flag (retired there)
        if a < end:
            pits.append([code_of[car], idx(a), len(grid) - 1])

    track_status = [[idx(off + clock), TRACK_STATUS.get(str(e.get("Status")), "clear")] for off, e in _events(feeds["TrackStatus.jsonStream"]) if start - 60 <= off + clock <= end]
    total_laps = None
    for _, e in _events(feeds["LapCount.jsonStream"]):
        total_laps = e.get("TotalLaps", total_laps)

    replay = {
        "version": REPLAY_VERSION,
        "hz": REPLAY_HZ,
        "startUtc": start,
        "samples": len(grid),
        "lapLengthM": story["lapLengthM"],
        "totalLaps": total_laps,
        "cars": [c for c in cars if c["code"] in dist],
        "pits": sorted(pits, key=lambda p: p[1]),
        "retired": retired,
        "trackStatus": track_status,
    }
    replay["outline"] = story["outline"]
    replay["corners"] = story.get("corners", [])
    replay["rotation"] = story.get("rotation")
    replay["startFinish"] = story["startFinish"]
    steps = {c["code"]: encode_steps(dist[c["code"]]) for c in replay["cars"]}
    return {"header": replay, "steps": steps, "distances": dist}, {"cars": len(cars), "minutes": round(len(grid) / REPLAY_HZ / 60, 1), "pits": len(pits), "retired": len(retired)}


REPO = Path(__file__).resolve().parent.parent
PUBLIC_DIR = REPO / "public" / "replays"
MANIFEST = REPO / "src" / "data" / "replays.json"


def replay_key(year: int, round_num: int) -> str:
    """How a replay is found: by season and round, which both current-season and archive race pages know (their race
    ids come from different tables)."""
    return f"{year}-{round_num}"


def publish(blob: bytes, key: str, public_dir: Path = PUBLIC_DIR, manifest_path: Path = MANIFEST) -> dict:
    """Writes the replay as public/replays/<key>.<sha256[:8]>.bin and points the manifest at it.

    The name changes whenever the content does, so the file can be cached forever (immutable). An older file for the
    same race is never deleted here: a visitor still on an earlier deployment may request it, and it must keep
    working. Old files are removed by a later, deliberate cleanup. Writing the same content twice is a no-op."""
    sha = hashlib.sha256(blob).hexdigest()
    name = f"{key}.{sha[:8]}.bin"
    public_dir.mkdir(parents=True, exist_ok=True)
    target = public_dir / name
    if not target.exists():
        target.write_bytes(blob)
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    entry = {"file": f"/replays/{name}", "bytes": len(blob), "sha256": sha, "version": REPLAY_VERSION, "hz": REPLAY_HZ}
    manifest[key] = entry
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(dict(sorted(manifest.items(), key=lambda kv: [int(x) for x in kv[0].split("-")])), indent=2) + "\n")
    return entry


def build_one(year: int, round_num: int, race_date: str | None) -> tuple[bytes | None, str]:
    """One race's replay file, or None with why. Uses the race's own traced track, or the same weekend's qualifying
    when the race's positions can't trace it (as race_track_story's backfill does). Round-trip checked."""
    path = ts.session_path(year, round_num, race_date)
    if path is None:
        return None, "no archive session"
    feeds = ts.fetch_feeds(path)
    if feeds is None:
        return None, "a feed is missing"
    for name in ("SessionStatus.jsonStream", "TrackStatus.jsonStream", "LapCount.jsonStream"):
        resp = ts._get(f"{ts.LIVETIMING}{path}{name}")
        if resp is None:
            return None, f"{name} missing"
        feeds[name] = resp.content.decode("utf-8-sig")
    info = json.loads(feeds["SessionInfo.json"])
    corners, rotation = ts.fetch_circuit(int(info["Meeting"]["Circuit"]["Key"]), year)
    quali = ts.qualifying_path(year, path)
    story, diag = ts.build_story(feeds, corners, rotation, None, (lambda: ts.trace_session(quali)) if quali else None)
    if story is None:
        return None, f"no traced track: {diag.get('rejected')}"
    replay, rdiag = build_replay(feeds, story)
    if replay is None:
        return None, str(rdiag.get("rejected"))
    blob = pack(replay["header"], replay["steps"])
    _, back = unpack(blob)
    if not all(np.array_equal(back[c], np.round(v).astype(np.int64)) for c, v in replay["distances"].items()):
        return None, "round trip failed"
    return blob, f"{rdiag['cars']} cars, {rdiag['minutes']} min"


def backfill(races: list[tuple[int, int, str | None]], manifest_path: Path = MANIFEST, dry_run: bool = False) -> tuple[int, list[str]]:
    """Builds and publishes every race in `races` whose manifest entry is missing or older (another format or sample
    rate). One race failing never stops the rest. Returns (published, report lines)."""
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    done, report = 0, []
    for year, round_num, race_date in races:
        key = replay_key(year, round_num)
        current = manifest.get(key)
        if current and current.get("version") == REPLAY_VERSION and current.get("hz") == REPLAY_HZ:
            continue
        try:
            blob, why = build_one(year, round_num, race_date)
        except Exception as e:  # noqa: BLE001 - one race's bad data must not end the run
            blob, why = None, f"{type(e).__name__}: {e}"
        if blob is None:
            report.append(f"{key}: skipped ({why})")
            continue
        if dry_run:
            report.append(f"{key}: would publish {len(blob) / 1e3:.0f} KB ({why})")
        else:
            entry = publish(blob, key, manifest_path=manifest_path)
            report.append(f"{key}: published {entry['file']} ({entry['bytes'] / 1e3:.0f} KB, {why})")
        done += 1
    return done, report


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--year", type=int)
    ap.add_argument("--round", type=int)
    ap.add_argument("--date", help="the race date, to match the archive session (recommended)")
    ap.add_argument("--out", help="write one race's file here only (for a look)")
    ap.add_argument("--publish", action="store_true", help="write one race into public/replays/ and src/data/replays.json")
    ap.add_argument("--backfill", action="store_true", help="every completed race of --season missing a current replay (reads races, read-only)")
    ap.add_argument("--season", type=int, help="--backfill: the season (default: the current one)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.backfill:
        import datetime as _dt

        if not os.environ.get("DATABASE_URL"):
            print("--backfill needs DATABASE_URL", file=sys.stderr)
            return 1
        import psycopg2

        season = args.season or _dt.datetime.now(_dt.timezone.utc).year
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        conn.set_session(readonly=True)  # this only reads the race list
        with conn.cursor() as cur:
            cur.execute("select year, round, race_date from races where status = 'completed' and year = %s order by round", (season,))
            races = [(y, r, str(d) if d else None) for y, r, d in cur.fetchall()]
        conn.close()
        done, report = backfill(races, dry_run=args.dry_run)
        for line in report:
            print("  " + line)
        print(f"{season}: {len(races)} completed race(s), {'would publish' if args.dry_run else 'published'} {done}")
        return 0

    if args.year is None or args.round is None or not (args.out or args.publish):
        ap.error("--year, --round and --out or --publish; or --backfill")
    blob, why = build_one(args.year, args.round, args.date)
    print(why)
    if blob is None:
        return 0
    if args.out:
        Path(args.out).write_bytes(blob)
        print(f"saved {args.out}: {len(blob) / 1e3:.0f} KB")
    else:
        entry = publish(blob, replay_key(args.year, args.round))
        print(f"published {entry['file']} ({entry['bytes'] / 1e3:.0f} KB) -> {MANIFEST.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
