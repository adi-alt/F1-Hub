"""The track library (circuit_layouts): every layout of every circuit, with the seasons it was used, so each race
draws its circuit by (circuit, season) - see supabase/migrations/20261014_circuit_layouts.sql.

Two steps, each a dry run unless --apply:

  --seed-drawn        every historical layout as a drawing, from f1-circuits-svg (Jules Roy, MIT; the original
                      repository is gone, this reads the MIT fork MisterSix2295/f1-circuits-svg): 157 layouts of
                      77 circuits, 1950-2025, each an SVG path on a 500x500 canvas. The dataset's circuits are
                      matched to archive_circuits by location (within 3 km), plus three checked by name and
                      season where the archive's coordinates are off or a city has two circuits.

  --rebuild-measured  layouts traced from real car positions, from race_track_stories (pipeline/race_track_story.py),
                      in F1's own track coordinates. Per circuit, in season order: a season whose outline agrees
                      with the current version's (within SAME_LAYOUT_P95_M) joins it; one that doesn't starts a new
                      version - the track changed, or F1 re-surveyed it (Interlagos and Losail moved by ~300 m in
                      their coordinates without a layout change): either way each version matches its own seasons'
                      data. A season with no story of its own (all of 2022, races missing from the archive) joins a
                      version only when the traced seasons on both sides are in it; otherwise its drawn layout
                      covers it. MultiViewer can't place it: its "per-year"
                      trace is sometimes a later year's (Singapore's for 2022 is the post-2023 layout). Rebuilt
                      whole each time from the stories, so it's idempotent and follows every change to them.

Run after the race-story backfill (both from a residential connection: F1's archive refuses GitHub's runners):
  python circuit_layouts.py --seed-drawn [--apply]
  python circuit_layouts.py --rebuild-measured [--apply]
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time

import numpy as np
import requests

import race_track_story as ts

FORK = "https://raw.githubusercontent.com/MisterSix2295/f1-circuits-svg/main"
ATTRIBUTION_DRAWN = "f1-circuits-svg by Jules Roy (MIT)"
ATTRIBUTION_MEASURED = "Traced from F1 live timing car positions"
MATCH_KM = 3.0
# Checked by hand: the archive's own coordinates are 12 km off for Jeddah, and Las Vegas has two circuits - the
# dataset's "las-vegas" is the 2023- Strip circuit (archive "vegas"), its "caesars-palace" the 1981-82 car park
# (archive "las_vegas", which the location match already finds).
OVERRIDES = {"jeddah": "jeddah", "las-vegas": "vegas"}
# Errors in the dataset, each checked: (layout id) -> what to change.
CORRECTIONS = {
    # "1995" is a typo for 1955: Aintree hosted the British GP in 1955, 1957, 1959, 1961 and 1962 (1995's was at
    # Silverstone).
    "aintree-1": {"seasons": "1955,1957,1959,1961-1962"},
    # The 2024 Chinese GP is missing from the season list. The track is unchanged: our own traces of 2018, 2019,
    # 2025 and 2026 are one layout version.
    "shanghai-1": {"seasons": "2004-2019,2024-2025"},
    # The 2021- layout is listed as "zandvoort", but its file is zandvoort-5.svg.
    "zandvoort": {"layoutId": "zandvoort-5"},
}
SAME_LAYOUT_P95_M = ts.SAME_LAYOUT_P95_M


# ── Drawn layouts ───────────────────────────────────────────────────────────────────────────────────────────


def parse_seasons(spec: str) -> list[int]:
    """'1955-1956,1960-1961' -> [1955, 1956, 1960, 1961]."""
    years: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        a, _, b = part.partition("-")
        years.update(range(int(a), int(b or a) + 1))
    return sorted(years)


def parse_svg(svg: str) -> tuple[str, str] | None:
    """The layout's single track path and its viewBox (the files give width/height, not a viewBox)."""
    paths = re.findall(r'<path[^>]*\sd="([^"]+)"', svg)
    if len(paths) != 1:
        return None
    vb = re.search(r'viewBox="([^"]+)"', svg)
    if vb:
        return paths[0], vb.group(1)
    w, h = re.search(r'width="([\d.]+)"', svg), re.search(r'height="([\d.]+)"', svg)
    if not (w and h):
        return None
    return paths[0], f"0 0 {w.group(1)} {h.group(1)}"


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p = math.pi / 180
    h = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def match_circuits(dataset: list[dict], archive: list[tuple[str, float, float]]) -> tuple[dict[str, str], list[str]]:
    """Dataset circuit id -> archive circuit_id, by OVERRIDES or the nearest archive circuit within MATCH_KM;
    plus the dataset ids left unmatched. An archive circuit is never matched twice."""
    out: dict[str, str] = {}
    unmatched = []
    for c in dataset:
        if c["id"] in OVERRIDES:
            out[c["id"]] = OVERRIDES[c["id"]]
            continue
        near = [(_km(c["latitude"], c["longitude"], lat, lon), cid) for cid, lat, lon in archive if lat is not None and lon is not None]
        d, cid = min(near) if near else (float("inf"), None)
        if cid is not None and d <= MATCH_KM:
            out[c["id"]] = cid
        else:
            unmatched.append(c["id"])
    taken: dict[str, list[str]] = {}
    for k, v in out.items():
        taken.setdefault(v, []).append(k)
    for cid, ks in taken.items():
        if len(ks) > 1:  # two dataset circuits on one archive circuit: neither is trustworthy
            for k in ks:
                del out[k]
                unmatched.append(k)
    return out, sorted(unmatched)


def corrected(layout: dict) -> dict:
    return {**layout, **CORRECTIONS.get(layout["layoutId"], {})}


def drawn_layouts(dataset: list[dict], mapping: dict[str, str], svgs: dict[str, str]) -> tuple[list[dict], list[str]]:
    """circuit_layouts rows for every drawn layout we can place, and what was skipped and why."""
    rows, skipped = [], []
    for c in dataset:
        circuit_id = mapping.get(c["id"])
        for lay in map(corrected, c.get("layouts", [])):
            lid = lay["layoutId"]
            if circuit_id is None:
                skipped.append(f"{lid}: circuit not matched to the archive")
                continue
            parsed = parse_svg(svgs.get(lid, ""))
            if parsed is None:
                skipped.append(f"{lid}: no single track path in the SVG")
                continue
            path, view_box = parsed
            rows.append({
                "layout_id": lid,
                "circuit_id": circuit_id,
                "aliases": [],
                "seasons": parse_seasons(lay["seasons"]),
                # The dataset marks a one-off variant with the race it was for ("otherId": "sakhir").
                "race_name_match": lay.get("otherId"),
                "source": "drawn",
                "geometry": {"path": path, "viewBox": view_box},
                "attribution": ATTRIBUTION_DRAWN,
            })
    return rows, skipped


def fetch_dataset() -> tuple[list[dict], dict[str, str]]:
    resp = requests.get(f"{FORK}/circuits.json", timeout=60)
    resp.raise_for_status()
    dataset = resp.json()
    svgs = {}
    for c in dataset:
        for lay in map(corrected, c.get("layouts", [])):
            r = requests.get(f"{FORK}/circuits/white/{lay['layoutId']}.svg", timeout=60)
            time.sleep(0.2)
            if r.ok:
                svgs[lay["layoutId"]] = r.text
    return dataset, svgs


# ── Measured layouts ────────────────────────────────────────────────────────────────────────────────────────


def layout_distance_m(a: np.ndarray, b: np.ndarray) -> float:
    """How different two traced layouts are: the larger of the two directions' 95th-percentile distance, in
    metres (one direction alone misses a section that only one of them has)."""
    return max(float(np.percentile(ts.project(a, b)[1], 95)), float(np.percentile(ts.project(b, a)[1], 95))) / 10


def cluster_versions(entries: list[tuple]) -> list[dict]:
    """[(year, race id, story[, race name])] at one circuit -> layout versions in season order. A season joins the
    version its outline matches (within SAME_LAYOUT_P95_M of that version's latest member) - any version, not
    just the latest: 2021 Bahrain is back on the usual layout after 2020's one-off outer loop. One that matches
    none starts a new version: the track changed, or was re-surveyed. Each version keeps its member years and
    races, and its latest member's story as its geometry.

    A version used only in seasons another version also covers, by differently named races, is a one-off
    variant: it's tagged with its race's name (2020's Sakhir GP), so it's never drawn for the usual race."""
    versions: list[dict] = []
    for entry in sorted(entries, key=lambda e: (e[0], e[1])):
        year, race_id, story = entry[:3]
        name = entry[3] if len(entry) > 3 else None
        outline = np.array(story["outline"], dtype=float)
        scored = sorted((layout_distance_m(outline, np.array(v["story"]["outline"], dtype=float)), -i) for i, v in enumerate(versions))
        if scored and scored[0][0] <= SAME_LAYOUT_P95_M:
            v = versions[-scored[0][1]]
            v["years"].add(year)
            v["races"].append(race_id)
            v["names"].add(name)
            v["story"] = story
            continue
        versions.append({"years": {year}, "races": [race_id], "names": {name}, "story": story, "changedByM": scored[0][0] if scored else None, "raceNameMatch": None})
    for v in versions:
        others = [o for o in versions if o is not v]
        shared_only = others and all(any(y in o["years"] for o in others) for y in v["years"])
        names = {n for n in v["names"] if n}
        other_names = {n for o in others for n in o["names"] if n}
        if shared_only and len(names) == 1 and not names & other_names:
            v["raceNameMatch"] = next(iter(names)).split()[0].lower()  # "Sakhir Grand Prix" -> "sakhir"
    return versions


def fill_between(versions: list[dict], seasons: set[int]) -> list[int]:
    """Seasons raced with no trace of their own join a version when the traced seasons either side of them are
    both in it: the track was that layout before and after, so it was that layout then (2022, between traced
    2021 and 2023). A season before the first trace or after the last stays out - the track may have changed
    there - and is returned, for the drawn layout to cover."""
    member = {y: i for i, v in enumerate(versions) for y in v["years"]}
    left = []
    for y in sorted(seasons - set(member)):
        before = [t for t in member if t < y]
        after = [t for t in member if t > y]
        if before and after and member[max(before)] == member[min(after)]:
            versions[member[max(before)]]["years"].add(y)
        else:
            left.append(y)
    return left


def measured_rows(circuit_id: str, aliases: list[str], versions: list[dict]) -> list[dict]:
    rows = []
    for v in versions:
        st = v["story"]
        rows.append({
            "layout_id": f"{circuit_id}@{min(v['years'])}",
            "circuit_id": circuit_id,
            "aliases": sorted(set(aliases)),
            "seasons": sorted(v["years"]),
            "race_name_match": v.get("raceNameMatch"),
            "source": "measured",
            "geometry": {
                "outline": st["outline"],
                "lapLengthM": st["lapLengthM"],
                "startFinish": st["startFinish"],
                "rotation": st.get("rotation"),
                "corners": st.get("corners", []),
                "circuitKey": st.get("circuitKey"),
            },
            "attribution": ATTRIBUTION_MEASURED,
        })
    return rows


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def load_measured_inputs(cur) -> dict[str, dict]:
    """Per circuit: its stories, the seasons it was raced, and the races.circuit spellings that mean it.
    circuit_id from the archive race of the same season and round; for a race newer than the archive, the
    archive circuit an earlier race with the same races.circuit was at; else a slug of races.circuit."""
    cur.execute(
        """
        select r.id, r.year, r.round, r.circuit, ar.circuit_id, s.story, r.name
        from races r
        left join archive_races ar on ar.year = r.year and ar.round = r.round
        left join race_track_stories s on s.race_id = r.id and not (s.story ? 'outlineFrom')
        where r.status = 'completed'
        """
    )
    rows = cur.fetchall()
    by_name: dict[str, str] = {}
    for _, _, _, circuit, archive_id, _, _ in sorted(rows, key=lambda r: r[1]):
        if archive_id:
            by_name[circuit] = archive_id
    out: dict[str, dict] = {}
    for race_id, year, _, circuit, archive_id, story, name in rows:
        cid = archive_id or by_name.get(circuit) or _slug(circuit)
        c = out.setdefault(cid, {"stories": [], "years": set(), "aliases": set()})
        c["years"].add(year)
        c["aliases"].add(circuit)
        if story is not None:
            c["stories"].append((year, race_id, story if isinstance(story, dict) else json.loads(story), name))
    return out


def build_measured(inputs: dict[str, dict]) -> tuple[list[dict], list[str]]:
    """All measured rows and a report line per circuit (versions, changes, seasons left without one)."""
    rows, report = [], []
    for cid, c in sorted(inputs.items()):
        if not c["stories"]:
            report.append(f"{cid}: no traced race yet")
            continue
        versions = cluster_versions(c["stories"])
        left = fill_between(versions, c["years"])  # the rest: drawn layouts cover them
        rows += measured_rows(cid, list(c["aliases"]), versions)
        desc = ", ".join(f"{min(v['years'])}-{max(v['years'])}" + (f" [{v['raceNameMatch']} only]" if v["raceNameMatch"] else "") + (f" (changed: {v['changedByM']:.0f} m)" if v["changedByM"] else "") for v in versions)
        report.append(f"{cid}: {len(versions)} version(s) {desc}" + (f"; seasons without a trace (drawn layout): {left}" if left else ""))
    return rows, report


# ── Writing ─────────────────────────────────────────────────────────────────────────────────────────────────


def upsert(cur, rows: list[dict]) -> None:
    for r in rows:
        cur.execute(
            """
            insert into circuit_layouts (layout_id, circuit_id, aliases, seasons, race_name_match, source, geometry, attribution, updated_at)
            values (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, now())
            on conflict (layout_id) do update set
              circuit_id = excluded.circuit_id, aliases = excluded.aliases, seasons = excluded.seasons,
              race_name_match = excluded.race_name_match, source = excluded.source, geometry = excluded.geometry,
              attribution = excluded.attribution, updated_at = now()
            """,
            (r["layout_id"], r["circuit_id"], r["aliases"], r["seasons"], r["race_name_match"], r["source"], json.dumps(r["geometry"], separators=(",", ":")), r["attribution"]),
        )


def replace_source(cur, source: str, rows: list[dict]) -> int:
    """Upserts `rows` and deletes this source's rows that weren't produced this time (a version that merged or
    went away). One transaction: the library is never half-rebuilt."""
    upsert(cur, rows)
    cur.execute("delete from circuit_layouts where source = %s and not (layout_id = any(%s))", (source, [r["layout_id"] for r in rows]))
    return cur.rowcount


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--seed-drawn", action="store_true")
    ap.add_argument("--rebuild-measured", action="store_true")
    ap.add_argument("--apply", action="store_true", help="write to circuit_layouts (default: report only)")
    args = ap.parse_args()
    if not (args.seed_drawn or args.rebuild_measured):
        ap.error("--seed-drawn and/or --rebuild-measured")
    if not os.environ.get("DATABASE_URL"):
        print("needs DATABASE_URL", file=sys.stderr)
        return 1
    import psycopg2

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    if not args.apply:
        conn.set_session(readonly=True)
    changed = False
    with conn, conn.cursor() as cur:
        if args.seed_drawn:
            dataset, svgs = fetch_dataset()
            cur.execute("select circuit_id, lat::float, long::float from archive_circuits")
            mapping, unmatched = match_circuits(dataset, cur.fetchall())
            rows, skipped = drawn_layouts(dataset, mapping, svgs)
            print(f"drawn: {len(rows)} layouts for {len({r['circuit_id'] for r in rows})} circuits; unmatched circuits {unmatched}; skipped {skipped}")
            if args.apply:
                print(f"  stored; {replace_source(cur, 'drawn', rows)} stale drawn row(s) removed")
                changed = True
        if args.rebuild_measured:
            rows, report = build_measured(load_measured_inputs(cur))
            print(f"measured: {len(rows)} layout version(s)")
            for line in report:
                print("  " + line)
            if args.apply:
                print(f"  stored; {replace_source(cur, 'measured', rows)} stale measured row(s) removed")
                changed = True
    conn.close()
    if changed:
        from ergast_utils import trigger_revalidation

        trigger_revalidation("races")
    return 0


if __name__ == "__main__":
    from run_ledger import ledgered

    sys.exit(ledgered("circuit-layouts")(main)())
