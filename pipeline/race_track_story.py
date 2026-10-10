"""Race track story: the real circuit outline for one race, and where on it the lead changed hands.

Source: F1's live-timing archive (livetiming.formula1.com/static), the same archive FastF1 reads - not
OpenF1, which refuses all free access while any session is live. Three feeds per race:

  Position.z     every car's x/y on track, ~4 Hz, in decimetres, in one coordinate frame per session
  TimingData     lap completions, pit flags and the running order, timestamped by stream offset
  SessionInfo    the circuit key, for the circuit's verified corner positions

Corner numbers come from MultiViewer's circuit API (what FastF1's get_circuit_info() uses). They're kept
only when they sit on this race's own traced outline: MultiViewer has no data for some venues, and a
corner list from another layout must never label this one.

What this produces, and what it refuses to claim:

  outline       a clean lap (no pit stop, not lap 1 or 2, not implausibly fast - a mistimed lap completion),
                the winner's first, that passes every check against other drivers' laps: it closes, has no
                gaps, and agrees with the field. If no lap does, no story is written at all.
  start/finish  where cars cross the timing line, as the median of every lap crossing. Marked verified
                only when the crossings agree to within START_FINISH_SPREAD_M.
  lead changes  each change of P1 in the timing feed. When the old leader was in the pits it's a pit
                change, and no location is given: nobody was passed on track. Otherwise the two cars'
                distances along the lap are interpolated onto one time grid and the point where the new
                leader drew ahead is the pass: "verified" when the samples either side pin it to within
                25 m with both cars on the racing line, else "approximate" (no turn name). Several
                crossovers (a battle) keep the last one before the re-order and say so. A change with no
                crossover (a leader who slowed or stopped, a flip-flop in the timing order) is "unlocated".
                The timing feed alone would be wrong here: it re-orders cars only at timing loops, up to
                ~20 s after the move.

Nothing is written to the database unless --write is passed with DATABASE_URL set. Without it the story
is printed (or saved with --out) for review.

Usage:
  python race_track_story.py --year 2026 --round 9 [--out story.json] [--write --race-id ID]
  python race_track_story.py --backfill [--since 2018] [--limit 25] [--dry-run]
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import zlib
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache

import numpy as np
import requests

LIVETIMING = "https://livetiming.formula1.com"
MULTIVIEWER = "https://api.multiviewer.app/api/v1/circuits/{key}/{year}"
STORY_VERSION = 1

# Outline acceptance. Units are metres; the feed is in decimetres.
MAX_CLOSURE_M = 60  # last sample of the lap back to the first: about one sample at speed
MAX_STEP_M = 120  # a longer jump between consecutive samples is a gap in the data
MAX_FIELD_DISAGREEMENT_P95_M = 5  # other drivers' clean laps, 95th percentile distance from the outline
START_FINISH_SPREAD_M = 30  # median distance of crossings from their median, to call the line verified
CORNER_ON_OUTLINE_M = 40  # a verified corner sits on the outline
CORNER_COVERAGE = 0.8  # share of corners that must be on the outline to use any of them
PASS_WINDOW_S = 90  # how far before the timing feed's re-order to look for the actual move
# The timing feed's times come from its stream offsets plus one clock offset measured from the position feed,
# good to about a second (p1..p99 of the per-sample offset: -0.8..+0.4 s in 2026 races). So "at or before the
# re-order" allows this much after it: a pass the two cars complete within it is the one that changed the lead.
REORDER_CLOCK_TOLERANCE_S = 1.5
# A pass is "verified" when its location is known to within this many metres along the track: half the
# distance the car covered across the widest sample gap around the move (the positions between two samples
# are interpolated), and both cars on the racing line. Anything looser is "approximate": shown as a distance
# with its uncertainty, never with a turn name.
VERIFIED_UNCERTAINTY_M = 25
ON_LINE_M = 25  # further than this from the outline at the move: pit lane, run-off, or a bad sample
INTO_CORNER_BEFORE_M = 150  # a pass this far before a corner, or...
INTO_CORNER_AFTER_M = 50  # ...this far after it, is "into Turn N"

REQUEST_PAUSE_S = 1.0  # between requests to the archive: one race is about six requests
RETRYABLE_STATUS = {429, 500, 502, 503, 504}
RETRY_DELAYS_SECONDS = (2, 5, 10)


# ── Fetching ────────────────────────────────────────────────────────────────────────────────────────


def _get(url: str, *, headers: dict | None = None) -> requests.Response | None:
    """GET with the pipeline's usual retry policy (openf1_fallback.py). None for missing data: the archive is
    an S3 bucket and answers 403 AccessDenied, not 404, for a file that doesn't exist (a season before 2018,
    a session with no feed)."""
    for delay in (*RETRY_DELAYS_SECONDS, None):
        resp = requests.get(url, headers=headers, timeout=120)
        time.sleep(REQUEST_PAUSE_S)
        if resp.status_code in (403, 404):
            return None
        if resp.status_code not in RETRYABLE_STATUS or delay is None:
            resp.raise_for_status()
            return resp
        time.sleep(delay)
    return None


@lru_cache(maxsize=None)
def season_races(year: int) -> tuple[tuple[str, str], ...] | None:
    """(start date, archive path) of every Grand Prix in the season's archive index, in date order - sprints
    excluded (their session is named 'Sprint'). Fetched once per season per run. None when the season has no
    index (2022's returns AccessDenied)."""
    resp = _get(f"{LIVETIMING}/static/{year}/Index.json")
    if resp is None:
        return None
    index = json.loads(resp.content.decode("utf-8-sig"))
    races = []
    for meeting in index.get("Meetings", []):
        if "test" in (meeting.get("Name") or "").lower():
            continue
        for session in meeting.get("Sessions", []):
            if session.get("Type") == "Race" and (session.get("Name") or "") == "Race" and session.get("Path"):
                races.append(((session.get("StartDate") or "")[:10], session["Path"]))
    return tuple(sorted(races))


def session_path(year: int, round_num: int, race_date: str | None = None) -> str | None:
    """The race's archive path ('/static/2026/2026-07-05_British_Grand_Prix/2026-07-05_Race/'), or None when
    the archive doesn't have it. Given the race's date (as the backfill always does), the session is matched by
    date, within two days: an index missing a race (2018's has no Australian GP) would otherwise shift every
    later round onto the wrong race. Without a date, by position in the index."""
    races = season_races(year)
    if not races:
        return None
    if race_date:
        target = datetime.fromisoformat(str(race_date)[:10])
        near = [(abs((datetime.fromisoformat(start) - target).days), path) for start, path in races if start]
        near = [n for n in near if n[0] <= 2]
        return f"/static/{min(near)[1]}" if near else None
    if not 1 <= round_num <= len(races):
        return None
    return f"/static/{races[round_num - 1][1]}"


def fetch_feeds(path: str) -> dict[str, str] | None:
    feeds = {}
    for name in ("SessionInfo.json", "DriverList.jsonStream", "TimingData.jsonStream", "Position.z.jsonStream"):
        resp = _get(f"{LIVETIMING}{path}{name}")
        if resp is None:
            return None
        feeds[name] = resp.content.decode("utf-8-sig")
    return feeds


def fetch_circuit(circuit_key: int, year: int) -> tuple[list[dict], float | None]:
    """The circuit's corners and its display rotation (degrees, as F1's graphics orient it), or ([], None)
    when MultiViewer has no data for this venue."""
    resp = _get(MULTIVIEWER.format(key=circuit_key, year=year), headers={"User-Agent": "f1-hub-pipeline"})
    if resp is None:
        return [], None
    data = resp.json()
    corners = [
        {"number": int(c["number"]), "letter": c.get("letter") or "", "x": float(c["trackPosition"]["x"]), "y": float(c["trackPosition"]["y"])}
        for c in data.get("corners", [])
    ]
    rotation = data.get("rotation")
    return corners, float(rotation) if rotation is not None else None


# ── Parsing ─────────────────────────────────────────────────────────────────────────────────────────


def _offset_seconds(stamp: str) -> float:
    h, m, s = stamp.split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def parse_stream(text: str) -> list[tuple[float, str]]:
    """'HH:MM:SS.mmm<payload>' lines -> (session offset in seconds, payload). Malformed lines are skipped."""
    out = []
    for line in text.splitlines():
        if len(line) > 12 and line[2] == ":" and line[5] == ":":
            try:
                out.append((_offset_seconds(line[:12]), line[12:]))
            except ValueError:
                continue
    return out


def decode_z(payload: str) -> dict:
    """A '.z' feed payload: a quoted base64 string of raw-deflated JSON."""
    return json.loads(zlib.decompress(base64.b64decode(payload.strip().strip('"')), -zlib.MAX_WBITS))


def _utc_seconds(stamp: str) -> float:
    # Feed timestamps carry anywhere from 1 to 7 fractional digits ('...54.8145776Z', '...31.84105Z'); Python 3.9
    # parses exactly 3 or 6.
    stamp = stamp.rstrip("Z")
    if "." in stamp:
        head, frac = stamp.split(".")
        stamp = f"{head}.{frac[:6].ljust(6, '0')}"
    return datetime.fromisoformat(stamp).replace(tzinfo=timezone.utc).timestamp()


@dataclass
class Track:
    t: np.ndarray  # UTC seconds
    x: np.ndarray  # decimetres
    y: np.ndarray


def parse_positions(position_text: str) -> tuple[dict[str, Track], float]:
    """Every car's track, with the (0, 0) 'not running' samples dropped, plus the stream's clock offset
    (UTC seconds = session offset + returned value), measured from the samples' own timestamps."""
    rows: dict[str, list[tuple[float, float, float]]] = {}
    offsets = []
    for off, payload in parse_stream(position_text):
        for frame in decode_z(payload).get("Position", []):
            t = _utc_seconds(frame["Timestamp"])
            offsets.append(t - off)
            for car, e in frame.get("Entries", {}).items():
                x, y = e.get("X", 0), e.get("Y", 0)
                if x or y:
                    rows.setdefault(car, []).append((t, float(x), float(y)))
    tracks = {}
    for car, r in rows.items():
        a = np.array(sorted(r))
        tracks[car] = Track(a[:, 0], a[:, 1], a[:, 2])
    return tracks, float(np.median(offsets)) if offsets else 0.0


def parse_driver_codes(driver_list_text: str) -> dict[str, str]:
    codes = {}
    for _, payload in parse_stream(driver_list_text):
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            continue
        for car, v in data.items():
            if isinstance(v, dict) and v.get("Tla"):
                codes[car] = v["Tla"]
    return codes


@dataclass
class Lap:
    car: str
    number: int
    end: float  # UTC seconds the car crossed the line to complete it
    pit: bool  # the car entered the pits on this lap
    pit_out: bool  # the car left the pits on this lap


@dataclass
class LeadChange:
    t: float
    new: str
    old: str
    old_in_pit: bool


def parse_timing(timing_text: str, clock_offset: float) -> tuple[list[Lap], list[LeadChange]]:
    """Lap completions with pit flags, and every change of P1, from the running order deltas."""
    laps: list[Lap] = []
    changes: list[LeadChange] = []
    flags: dict[str, dict[str, bool]] = {}
    in_pit: dict[str, bool] = {}
    pit_since: dict[str, float] = {}
    leader: str | None = None
    for off, payload in parse_stream(timing_text):
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            continue
        t = off + clock_offset
        for car, v in (data.get("Lines") or {}).items():
            if not isinstance(v, dict):
                continue
            f = flags.setdefault(car, {"pit": False, "pit_out": False})
            if "InPit" in v:
                in_pit[car] = bool(v["InPit"])
                f["pit"] = f["pit"] or bool(v["InPit"])
                if v["InPit"]:
                    pit_since[car] = t
            if "PitOut" in v:
                f["pit_out"] = f["pit_out"] or bool(v["PitOut"])
            if "NumberOfLaps" in v:
                laps.append(Lap(car, int(v["NumberOfLaps"]), t, f["pit"], f["pit_out"]))
                flags[car] = {"pit": False, "pit_out": False}
            if str(v.get("Position")) == "1":
                if leader is not None and car != leader:
                    # Pit lane transit is ~20-25 s and the order can update after the car rejoins, so a leader
                    # who entered the pits within the last 40 s counts as having lost the lead there.
                    old_pitted = in_pit.get(leader, False) or (t - pit_since.get(leader, -1e12) < 40)
                    changes.append(LeadChange(t, car, leader, old_pitted))
                leader = car
    return laps, changes


# ── Geometry ────────────────────────────────────────────────────────────────────────────────────────


def lap_samples(track: Track, start: float, end: float) -> np.ndarray:
    m = (track.t > start) & (track.t <= end)
    return np.c_[track.x[m], track.y[m]]


def _segments(poly: np.ndarray, closed: bool) -> tuple[np.ndarray, np.ndarray]:
    a = poly
    b = np.vstack([poly[1:], poly[:1]]) if closed else poly[1:]
    if not closed:
        a = poly[:-1]
    return a, b - a


def project(points: np.ndarray, outline: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Each point's distance along the closed outline (decimetres) and its distance off it."""
    a, ab = _segments(outline, closed=True)
    ab2 = np.maximum((ab**2).sum(1), 1e-9)
    seg_len = np.sqrt(ab2)
    seg_start = np.concatenate([[0.0], np.cumsum(seg_len)[:-1]])
    along = np.empty(len(points))
    off = np.empty(len(points))
    for k, p in enumerate(points):
        tt = np.clip(((p - a) * ab).sum(1) / ab2, 0, 1)
        d = np.linalg.norm(a + ab * tt[:, None] - p, axis=1)
        i = int(d.argmin())
        along[k] = seg_start[i] + tt[i] * seg_len[i]
        off[k] = d[i]
    return along, off


def lap_length(outline: np.ndarray) -> float:
    _, ab = _segments(outline, closed=True)
    return float(np.linalg.norm(ab, axis=1).sum())


@dataclass
class OutlineCheck:
    closure_m: float
    max_step_m: float
    field_p95_m: float | None
    length_m: float

    @property
    def ok(self) -> bool:
        return (
            self.closure_m <= MAX_CLOSURE_M
            and self.max_step_m <= MAX_STEP_M
            and self.field_p95_m is not None
            and self.field_p95_m <= MAX_FIELD_DISAGREEMENT_P95_M
        )


def check_outline(outline: np.ndarray, others: list[np.ndarray]) -> OutlineCheck:
    steps = np.linalg.norm(np.diff(outline, axis=0), axis=1)
    field = [project(o, outline)[1] for o in others if len(o)]
    return OutlineCheck(
        closure_m=float(np.linalg.norm(outline[-1] - outline[0])) / 10,
        max_step_m=float(steps.max()) / 10 if len(steps) else float("inf"),
        field_p95_m=float(np.percentile(np.concatenate(field), 95)) / 10 if field else None,
        length_m=lap_length(outline) / 10,
    )


def clean_laps(laps: list[Lap]) -> list[tuple[Lap, float]]:
    """(lap, its duration) for every lap with no pit stop, past the first two (start, early safety car)."""
    by_car: dict[str, list[Lap]] = {}
    for lap in laps:
        by_car.setdefault(lap.car, []).append(lap)
    out = []
    for car_laps in by_car.values():
        car_laps.sort(key=lambda l: l.number)
        for prev, lap in zip(car_laps, car_laps[1:]):
            if lap.number == prev.number + 1 and lap.number > 2 and not (lap.pit or lap.pit_out):
                out.append((lap, lap.end - prev.end))
    return out


def lap_start(laps: list[Lap], lap: Lap) -> float:
    return next(l.end for l in laps if l.car == lap.car and l.number == lap.number - 1)


# A clean lap more than this much faster than the field's median clean lap is a timing artefact (a lap
# completion stamped late or early), not a real lap: 2026 Zandvoort's "fastest lap" was 55 s against ~74 s laps.
PLAUSIBLE_LAP_SHARE = 0.92
MAX_OUTLINE_CANDIDATES = 15


def representative_outline(tracks: dict[str, Track], laps: list[Lap], winner: str | None) -> tuple[np.ndarray, OutlineCheck] | None:
    """A clean lap that passes every outline check against other drivers' clean laps: the winner's fastest
    first, then the field's fastest, up to MAX_OUTLINE_CANDIDATES tried. Laps with implausible durations or
    too few position samples are never candidates. None when no lap has samples at all; otherwise the last
    attempt and its (failed) check when none passes, for the diagnostics."""
    candidates = clean_laps(laps)
    if not candidates:
        return None
    median = float(np.median([d for _, d in candidates]))
    plausible = [(lap, d) for lap, d in candidates if d >= PLAUSIBLE_LAP_SHARE * median and lap.car in tracks]

    def samples(lap: Lap) -> np.ndarray:
        return lap_samples(tracks[lap.car], lap_start(laps, lap), lap.end)

    with_samples = [(lap, d) for lap, d in plausible if len(samples(lap)) >= 50]
    if not with_samples:
        return None
    ordered = sorted(with_samples, key=lambda x: (x[0].car != winner, x[1]))
    # Other drivers' laps to check against: each driver's fastest plausible lap with samples.
    best_per_car: dict[str, Lap] = {}
    for lap, d in sorted(with_samples, key=lambda x: x[1]):
        best_per_car.setdefault(lap.car, lap)

    attempt = None
    for lap, _ in ordered[:MAX_OUTLINE_CANDIDATES]:
        outline = samples(lap)
        others = [samples(o) for car, o in best_per_car.items() if car != lap.car][:5]
        check = check_outline(outline, others)
        attempt = (outline, check)
        if check.ok:
            return attempt
    return attempt


def interp_xy(track: Track, t: float) -> np.ndarray:
    return np.array([np.interp(t, track.t, track.x), np.interp(t, track.t, track.y)])


def start_finish(tracks: dict[str, Track], laps: list[Lap]) -> tuple[np.ndarray, float] | None:
    """Median of where cars were at their lap completions, and how tightly the crossings agree (metres)."""
    pts = [interp_xy(tracks[l.car], l.end) for l in laps if l.car in tracks and l.number > 1 and not l.pit]
    if len(pts) < 20:
        return None
    pts = np.array(pts)
    centre = np.median(pts, axis=0)
    spread = float(np.median(np.linalg.norm(pts - centre, axis=1))) / 10
    return centre, spread


def verified_corners(corners: list[dict], outline: np.ndarray) -> list[dict]:
    """The corners, each with its distance along the lap, when (nearly) all of them sit on this outline."""
    if not corners:
        return []
    pts = np.array([[c["x"], c["y"]] for c in corners])
    along, off = project(pts, outline)
    on = off / 10 <= CORNER_ON_OUTLINE_M
    if on.mean() < CORNER_COVERAGE:
        return []
    return [{**c, "along": float(a)} for c, a, keep in zip(corners, along, on) if keep]


def _unwrapped_distance(track: Track, outline: np.ndarray, t0: float, t1: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    m = (track.t >= t0) & (track.t <= t1)
    t = track.t[m]
    s, off = project(np.c_[track.x[m], track.y[m]], outline)
    length = lap_length(outline)
    # A drop of more than half a lap is crossing the line, not going backwards.
    s = s + length * np.concatenate([[0], np.cumsum(np.diff(s) < -length / 2)])
    return t, s, off


def _gap_uncertainty(t: np.ndarray, s: np.ndarray, at: float) -> float:
    """Half the distance covered between the two samples either side of `at`, in metres: how far off the
    interpolated position can be if the speed wasn't constant between them."""
    i = int(np.searchsorted(t, at))
    if i <= 0 or i >= len(t):
        return float("inf")
    return abs(s[i] - s[i - 1]) / 10 / 2


@dataclass
class Pass:
    t: float
    xy: np.ndarray
    along: float  # decimetres from the outline's first point
    crossovers: int
    uncertainty_m: float  # along the track, from the sample gaps around the move
    off_line_m: float  # the further of the two cars from the outline at the move


def locate_pass(new: Track, old: Track, outline: np.ndarray, reordered_at: float) -> Pass | None:
    """Where the new leader actually drew ahead of the old one, from both cars' distances along the lap
    interpolated onto a common 20 Hz grid. None when the window has no clean crossover."""
    t0, t1 = reordered_at - PASS_WINDOW_S, reordered_at + 5
    tn, sn, offn = _unwrapped_distance(new, outline, t0, t1)
    to, so, offo = _unwrapped_distance(old, outline, t0, t1)
    if len(tn) < 20 or len(to) < 20:
        return None
    length = lap_length(outline)
    # Put both on the same lap count: they're within a fraction of a lap of each other when fighting for P1.
    so = so + length * np.round((sn[0] - np.interp(tn[0], to, so)) / length)
    grid = np.arange(max(tn[0], to[0]), min(tn[-1], to[-1]), 0.05)
    if len(grid) < 2:
        return None
    gap = np.interp(grid, tn, sn) - np.interp(grid, to, so)
    # Only moves at or before the re-order (within the clock tolerance): the timing feed records a pass after it
    # happens, never before. A swap back and forth after that (a battle continuing) must not be reported as the
    # move that changed the lead (2026 Monza, lap 15: 3.4 s after).
    by = reordered_at + REORDER_CLOCK_TOLERANCE_S
    ahead = np.where((gap[:-1] <= 0) & (gap[1:] > 0) & (grid[1:] <= by))[0]
    if not len(ahead) or np.interp(by, grid, gap) <= 0:
        return None
    t = float(grid[ahead[-1] + 1])
    return Pass(
        t,
        interp_xy(new, t),
        float(np.interp(t, tn, sn) % length),
        len(ahead),
        uncertainty_m=max(_gap_uncertainty(tn, sn, t), _gap_uncertainty(to, so, t)),
        off_line_m=float(max(np.interp(t, tn, offn), np.interp(t, to, offo))) / 10,
    )


def describe_location(along: float, corners: list[dict], length: float) -> str | None:
    """'into Turn 4' or 'between Turn 4 and Turn 5', measured along the lap. None without verified corners."""
    if not corners:
        return None
    ordered = sorted(corners, key=lambda c: c["along"])
    name = lambda c: f"Turn {c['number']}{c['letter']}"  # noqa: E731
    for c in ordered:
        before = (c["along"] - along) % length
        after = (along - c["along"]) % length
        if before <= INTO_CORNER_BEFORE_M * 10 or after <= INTO_CORNER_AFTER_M * 10:
            return f"into {name(c)}"
    prev = max((c for c in ordered if c["along"] <= along), key=lambda c: c["along"], default=ordered[-1])
    nxt = min((c for c in ordered if c["along"] > along), key=lambda c: c["along"], default=ordered[0])
    return f"between {name(prev)} and {name(nxt)}"


# ── The story ───────────────────────────────────────────────────────────────────────────────────────


def build_story(feeds: dict[str, str], corners: list[dict], rotation: float | None, winner_code: str | None) -> tuple[dict | None, dict]:
    """(story or None, diagnostics). The story is None when the outline fails its checks: no circuit is
    better than a wrong one."""
    tracks, clock = parse_positions(feeds["Position.z.jsonStream"])
    codes = parse_driver_codes(feeds["DriverList.jsonStream"])
    laps, changes = parse_timing(feeds["TimingData.jsonStream"], clock)
    by_code = {v: k for k, v in codes.items()}
    # Only race cars: the archive also carries other vehicles (car numbers not in the driver list).
    tracks = {car: tr for car, tr in tracks.items() if car in codes}
    diag: dict = {"cars": len(tracks), "laps": len(laps), "leadChanges": len(changes)}

    rep = representative_outline(tracks, laps, by_code.get(winner_code or ""))
    if rep is None:
        diag["rejected"] = "no clean lap to trace"
        return None, diag
    outline, check = rep
    diag["outline"] = {"points": len(outline), "closureM": round(check.closure_m, 1), "maxStepM": round(check.max_step_m, 1), "fieldP95M": None if check.field_p95_m is None else round(check.field_p95_m, 1), "lengthM": round(check.length_m)}
    if not check.ok:
        diag["rejected"] = "outline failed its checks"
        return None, diag

    # Start the outline at the timing line, so "metres into the lap" means what it says.
    sf = start_finish(tracks, laps)
    sf_verified = sf is not None and sf[1] <= START_FINISH_SPREAD_M
    if sf is not None:
        i = int(np.argmin(np.linalg.norm(outline - sf[0], axis=1)))
        outline = np.roll(outline, -i, axis=0)
    diag["startFinish"] = None if sf is None else {"spreadM": round(sf[1], 1), "verified": sf_verified}

    length = lap_length(outline)
    good_corners = verified_corners(corners, outline)
    diag["corners"] = {"offered": len(corners), "verified": len(good_corners)}

    lap_of = {}
    for lap in laps:
        lap_of.setdefault(lap.car, []).append((lap.end, lap.number))
    def lap_number(car: str, t: float) -> int:
        return sum(1 for end, _ in lap_of.get(car, []) if end < t) + 1

    events = []
    for ch in changes:
        if ch.new not in tracks or ch.old not in tracks:
            continue
        event = {"lap": lap_number(ch.new, ch.t), "to": codes.get(ch.new, ch.new), "from": codes.get(ch.old, ch.old)}
        if ch.old_in_pit:
            events.append({**event, "kind": "pit"})
            continue
        found = locate_pass(tracks[ch.new], tracks[ch.old], outline, ch.t)
        if found is None:
            events.append({**event, "kind": "unlocated"})
            continue
        verified = found.uncertainty_m <= VERIFIED_UNCERTAINTY_M and found.off_line_m <= ON_LINE_M
        events.append({
            **event,
            "kind": "pass",
            "x": int(round(found.xy[0])),
            "y": int(round(found.xy[1])),
            "alongM": int(round(found.along / 10)),
            "precision": "verified" if verified else "approximate",
            "uncertaintyM": int(np.ceil(min(found.uncertainty_m, 9999))),
            # A turn name is a precise claim: only for a verified location.
            "near": describe_location(found.along, good_corners, length) if verified else None,
            "battle": found.crossovers > 1,
            "recordedLaterS": round(ch.t - found.t, 1),
        })

    story = {
        "version": STORY_VERSION,
        "source": "F1 live timing",
        "lapLengthM": int(round(length / 10)),
        "outline": [[int(round(x)), int(round(y))] for x, y in outline],
        "startFinish": {"x": int(round(outline[0][0])), "y": int(round(outline[0][1])), "verified": sf_verified},
        # Only with verified corners: the rotation comes from the same MultiViewer record, so it's trusted
        # exactly when they are.
        "rotation": rotation if good_corners else None,
        "corners": [{"number": c["number"], "letter": c["letter"], "x": int(round(c["x"])), "y": int(round(c["y"]))} for c in good_corners],
        "leadChanges": events,
    }
    return story, diag


def store(cur, race_id: str, story: dict, session: str) -> None:
    """One row per race, replaced on each run. Touches nothing else."""
    cur.execute(
        """
        insert into race_track_stories (race_id, version, session_path, story, computed_at)
        values (%s, %s, %s, %s::jsonb, now())
        on conflict (race_id) do update
          set version = excluded.version, session_path = excluded.session_path, story = excluded.story, computed_at = now()
        """,
        (race_id, story["version"], session, json.dumps(story, separators=(",", ":"))),
    )


def backfill(cur, *, since: int, limit: int, dry_run: bool) -> int:
    """Every completed race from `since` on with no story, or one from an older STORY_VERSION: one race at a
    time, committed as it goes, pausing between requests. A race the archive doesn't have, or whose outline
    fails its checks, is reported and skipped - it's tried again on the next run, never half-written."""
    cur.execute(
        """
        select r.id, r.year, r.round, r.race_date,
               (select rr.driver from race_results rr where rr.race_id = r.id and rr.finish_position = 1 limit 1)
        from races r
        left join race_track_stories s on s.race_id = r.id
        where r.status = 'completed' and r.year >= %s and (s.race_id is null or s.version < %s)
        order by r.year desc, r.round desc
        """,
        (since, STORY_VERSION),
    )
    todo = cur.fetchall()
    # Stops after `limit` stored, or `limit` x 4 attempted: a race that can never be built (no archive session)
    # stays at the front of the queue, and must not use up every run's budget so that nothing behind it is done.
    max_attempts = limit * 4
    print(f"{len(todo)} race(s) without a current story; storing up to {limit}, trying up to {max_attempts}{' (dry run: nothing written)' if dry_run else ''}")
    stored = attempted = 0
    for race_id, year, round_num, race_date, winner in todo:
        if stored >= limit or attempted >= max_attempts:
            break
        attempted += 1
        try:
            path = session_path(year, round_num, race_date)
            if path is None:
                print(f"  {race_id}: no matching live-timing session; skipped")
                continue
            feeds = fetch_feeds(path)
            if feeds is None:
                print(f"  {race_id}: a feed is missing; skipped")
                continue
            info = json.loads(feeds["SessionInfo.json"])
            corners, rotation = fetch_circuit(int(info["Meeting"]["Circuit"]["Key"]), year)
            story, diag = build_story(feeds, corners, rotation, winner)
        except Exception as e:  # noqa: BLE001 - one race's bad data must not end the run for the rest
            print(f"  {race_id}: {type(e).__name__}: {e}; skipped")
            continue
        if story is None:
            print(f"  {race_id}: {diag.get('rejected')} {diag.get('outline', '')}; skipped")
            continue
        located = sum(1 for e in story["leadChanges"] if e["kind"] == "pass")
        print(f"  {race_id}: {len(story['outline'])} points, {len(story['corners'])} corners, {len(story['leadChanges'])} lead changes ({located} located)")
        if not dry_run:
            try:
                store(cur, race_id, story, path)
                cur.connection.commit()
                stored += 1
            except Exception as e:  # noqa: BLE001 - roll this race back, keep the connection usable for the next
                cur.connection.rollback()
                print(f"  {race_id}: not stored ({type(e).__name__}: {e})")
        else:
            stored += 1
    print(f"attempted {attempted}, {'would store' if dry_run else 'stored'} {stored}")
    return 0 if dry_run else stored


def _revalidate() -> None:
    """The race page caches its story under the "races" tag; bust it so a new story shows without waiting."""
    from ergast_utils import trigger_revalidation

    trigger_revalidation("races")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--year", type=int)
    ap.add_argument("--round", type=int)
    ap.add_argument("--backfill", action="store_true", help="every completed race missing a story (needs DATABASE_URL)")
    ap.add_argument(
        "--since",
        type=int,
        default=datetime.now(timezone.utc).year,
        help="--backfill: first season (default: this one - only the current season's race pages show the story)",
    )
    ap.add_argument("--limit", type=int, default=25, help="--backfill: at most this many races per run")
    ap.add_argument("--dry-run", action="store_true", help="--backfill: build and report, write nothing")
    ap.add_argument("--winner", help="the winner's three-letter code; else the fastest driver's lap is traced")
    ap.add_argument("--out", help="save the story JSON here")
    ap.add_argument("--write", action="store_true", help="upsert into race_track_stories (needs DATABASE_URL and --race-id)")
    ap.add_argument("--race-id")
    args = ap.parse_args()

    if args.backfill:
        if not os.environ.get("DATABASE_URL"):
            print("--backfill needs DATABASE_URL", file=sys.stderr)
            return 1
        import psycopg2

        with psycopg2.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor() as cur:
            stored = backfill(cur, since=args.since, limit=args.limit, dry_run=args.dry_run)
        print(f"stored {stored} stor{'y' if stored == 1 else 'ies'}")
        if stored:
            _revalidate()
        return 0
    if args.year is None or args.round is None:
        ap.error("--year and --round, or --backfill")

    path = session_path(args.year, args.round)
    if path is None:
        print(f"{args.year} round {args.round}: not in the live-timing archive")
        return 0
    feeds = fetch_feeds(path)
    if feeds is None:
        print(f"{path}: a feed is missing; nothing written")
        return 0
    info = json.loads(feeds["SessionInfo.json"])
    corners, rotation = fetch_circuit(int(info["Meeting"]["Circuit"]["Key"]), args.year)
    story, diag = build_story(feeds, corners, rotation, args.winner)
    print(json.dumps({"session": path, "circuit": info["Meeting"]["Circuit"]["ShortName"], **diag}, indent=2))
    if story is None:
        return 0
    for e in story["leadChanges"]:
        where = ""
        if e["kind"] == "pass":
            where = f"{e['precision']} ±{e['uncertaintyM']} m: {e.get('near') or str(e['alongM']) + ' m into the lap'}"
        print(f"  lap {e['lap']:>2} {e['from']} -> {e['to']}: {e['kind']} {where}".rstrip())
    if args.out:
        with open(args.out, "w") as f:
            json.dump(story, f, separators=(",", ":"))
        print(f"saved {args.out} ({os.path.getsize(args.out)} bytes)")
    if args.write:
        if not (os.environ.get("DATABASE_URL") and args.race_id):
            print("--write needs DATABASE_URL and --race-id", file=sys.stderr)
            return 1
        import psycopg2

        with psycopg2.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor() as cur:
            store(cur, args.race_id, story, path)
        print(f"stored race_track_stories[{args.race_id}]")
        _revalidate()
    return 0


if __name__ == "__main__":
    from run_ledger import ledgered

    sys.exit(ledgered("race-track-stories")(main)())
