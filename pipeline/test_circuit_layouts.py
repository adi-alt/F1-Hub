"""Plain assert-based self-check (no pytest, no network) for circuit_layouts.py: season ranges, SVG parsing,
matching the dataset's circuits to the archive, and grouping traced seasons into layout versions - including a
track that changes. `python test_circuit_layouts.py`.

Synthetic inputs (circles for circuits); the real-data run is the script's own dry run."""

import math

import numpy as np

import circuit_layouts as cl

# --- seasons -----------------------------------------------------------------------------------------------
assert cl.parse_seasons("1955-1956,1960-1961") == [1955, 1956, 1960, 1961]
assert cl.parse_seasons("2000-2025") == list(range(2000, 2026))
assert cl.parse_seasons("1981") == [1981] and cl.parse_seasons("") == []

# --- SVG ---------------------------------------------------------------------------------------------------
SVG = '<svg width="500" height="500" xmlns="http://www.w3.org/2000/svg">\n  <path style="fill: none" d="M1 2L3 4z"/>\n</svg>'
assert cl.parse_svg(SVG) == ("M1 2L3 4z", "0 0 500 500")
assert cl.parse_svg('<svg viewBox="0 0 10 20"><path d="M0 0"/></svg>') == ("M0 0", "0 0 10 20")
assert cl.parse_svg('<svg width="5" height="5"><path d="M0 0"/><path d="M1 1"/></svg>') is None, "two paths: which is the track?"
assert cl.parse_svg("<svg></svg>") is None

# --- matching the dataset's circuits to the archive --------------------------------------------------------
dataset = [
    {"id": "monza", "latitude": 45.6206, "longitude": 9.2894, "layouts": [{"layoutId": "monza-6", "seasons": "2000-2025"}]},
    {"id": "jeddah", "latitude": 21.5433, "longitude": 39.1728, "layouts": [{"layoutId": "jeddah-1", "seasons": "2021-2025"}]},
    {"id": "nowhere", "latitude": 0.0, "longitude": 0.0, "layouts": [{"layoutId": "nowhere-1", "seasons": "1999"}]},
    {"id": "twin-a", "latitude": 10.0, "longitude": 10.0, "layouts": []},
    {"id": "twin-b", "latitude": 10.001, "longitude": 10.001, "layouts": []},
]
archive = [("monza", 45.6156, 9.28111), ("jeddah", 21.6319, 39.1044), ("twin", 10.0005, 10.0005)]
mapping, unmatched = cl.match_circuits(dataset, archive)
assert mapping == {"monza": "monza", "jeddah": "jeddah"}, mapping
assert unmatched == ["nowhere", "twin-a", "twin-b"], "too far, or two dataset circuits on one archive circuit"

rows, skipped = cl.drawn_layouts(dataset, mapping, {"monza-6": SVG, "jeddah-1": "<svg/>"})
assert [r["layout_id"] for r in rows] == ["monza-6"] and rows[0]["seasons"][0] == 2000 and rows[0]["source"] == "drawn"
assert rows[0]["attribution"] == cl.ATTRIBUTION_DRAWN
assert any("jeddah-1" in s for s in skipped) and any("nowhere-1" in s for s in skipped)

# Dataset corrections and variants.
fixes = [{"id": "aintree", "latitude": 53.48, "longitude": -2.94, "layouts": [{"layoutId": "aintree-1", "seasons": "1995,1957"}]},
         {"id": "bahrain", "latitude": 26.03, "longitude": 50.51, "layouts": [{"layoutId": "bahrain-1", "seasons": "2004-2025"}, {"layoutId": "bahrain-3", "seasons": "2020", "otherId": "sakhir"}]},
         {"id": "zandvoort", "latitude": 52.39, "longitude": 4.54, "layouts": [{"layoutId": "zandvoort", "seasons": "2021-2025"}]}]
fmap = {"aintree": "aintree", "bahrain": "bahrain", "zandvoort": "zandvoort"}
frows, fskipped = cl.drawn_layouts(fixes, fmap, {"aintree-1": SVG, "bahrain-1": SVG, "bahrain-3": SVG, "zandvoort-5": SVG})
byid = {r["layout_id"]: r for r in frows}
assert 1955 in byid["aintree-1"]["seasons"] and 1995 not in byid["aintree-1"]["seasons"], "the typo is corrected"
assert "zandvoort-5" in byid and not fskipped, "the misnamed file is found"
assert byid["bahrain-3"]["race_name_match"] == "sakhir" and byid["bahrain-1"]["race_name_match"] is None

# --- measured: grouping seasons into layout versions -------------------------------------------------------
R = 10_000.0  # decimetres: a 1 km radius


def ring(n=200, stretch=1.0, bulge=0.0):
    a = np.arange(n) / n * 2 * math.pi
    r = R + bulge * np.exp(-((a - math.pi) ** 2) / 0.05)  # a local change: a new chicane-ish bulge on one side
    return np.c_[r * np.cos(a) * stretch, r * np.sin(a)]


def story(xy, key=7):
    return {"outline": [[int(x), int(y)] for x, y in xy], "lapLengthM": 628, "startFinish": {"x": R, "y": 0, "verified": True}, "corners": [], "rotation": None, "circuitKey": key}


same, changed = ring(), ring(bulge=1500)  # 150 m of new track on one side
assert cl.layout_distance_m(same, ring(n=150)) < 1
assert cl.layout_distance_m(same, changed) > cl.SAME_LAYOUT_P95_M
assert cl.layout_distance_m(changed, same) == cl.layout_distance_m(same, changed), "symmetric"

entries = [(2019, "r19", story(same)), (2021, "r21", story(ring(n=180))), (2023, "r23", story(changed)), (2024, "r24", story(changed)), (2020, "r20a", story(same)), (2020, "r20b", story(same))]
versions = cl.cluster_versions(entries)
assert [sorted(v["years"]) for v in versions] == [[2019, 2020, 2021], [2023, 2024]], [v["years"] for v in versions]
assert versions[0]["changedByM"] is None and versions[1]["changedByM"] > cl.SAME_LAYOUT_P95_M, "the change is recorded"
assert versions[0]["races"] == ["r19", "r20a", "r20b", "r21"], "two races in one season are both members"

v2 = cl.cluster_versions(entries)
# A one-off layout in a season (2020: Bahrain GP on the usual track, Sakhir GP on the outer loop) doesn't break the
# usual layout's lineage, and is tagged for its race.
outer = ring(stretch=0.6)
bah = cl.cluster_versions([(2019, "b19", story(same), "Bahrain Grand Prix"), (2020, "b20", story(same), "Bahrain Grand Prix"),
                           (2020, "s20", story(outer), "Sakhir Grand Prix"), (2021, "b21", story(same), "Bahrain Grand Prix")])
assert [sorted(v["years"]) for v in bah] == [[2019, 2020, 2021], [2020]], [v["years"] for v in bah]
assert bah[0]["raceNameMatch"] is None and bah[1]["raceNameMatch"] == "sakhir"
assert cl.measured_rows("bahrain", ["Sakhir"], bah)[1]["race_name_match"] == "sakhir"
# A real change isn't a variant: its seasons aren't covered by the old version.
assert all(v["raceNameMatch"] is None for v in cl.cluster_versions(entries))

# A season with no trace joins a version only between two traced seasons of that version.
v4 = cl.cluster_versions(entries)
left = cl.fill_between(v4, {2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025})
assert 2020 in v4[0]["years"], "2020 between traced 2019 and 2021, same version"
assert left == [2018, 2022, 2025], f"before the first trace, across a change (2021 v1 / 2023 v2), after the last: {left}"
rows = cl.measured_rows("silverstone", ["Silverstone", "Silverstone"], v2)
assert [r["layout_id"] for r in rows] == ["silverstone@2019", "silverstone@2023"], "named by first traced season"
assert rows[0]["aliases"] == ["Silverstone"] and rows[0]["source"] == "measured" and rows[0]["geometry"]["outline"]

# build_measured end to end: a circuit with no traced race yet is reported, not invented.
inputs = {"silverstone": {"stories": entries, "years": {2018, 2019, 2020, 2021, 2022, 2023, 2024}, "aliases": {"Silverstone"}}, "madring": {"stories": [], "years": {2026}, "aliases": {"Madring"}}}
rows, report = cl.build_measured(inputs)
assert len(rows) == 2 and any("madring: no traced race yet" == r for r in report), report
assert any("changed:" in r for r in report), "the report says where the track changed"
sil = next(r for r in report if r.startswith("silverstone"))
assert "2018" in sil and "2022" in sil, f"seasons with no trace and no same-version neighbours are left to the drawn layout: {sil}"

print("circuit_layouts: all checks passed")
