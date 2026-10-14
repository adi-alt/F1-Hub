"""Plain assert-based self-check (no pytest): a completed round with no qualifying grid must not become
training data (audit R-16, DATA-08). `python test_training_filters.py`."""

from train_predict import has_qualifying, to_dnf_rows, to_pace_rows, to_training_rows

results = [
    {"driver": "HAM", "team": "Ferrari", "gridPosition": 2, "finishPosition": 1, "status": "finished", "fastestLapSec": 95.1},
    {"driver": "NOR", "team": "McLaren", "gridPosition": 1, "finishPosition": 2, "status": "finished", "fastestLapSec": 95.3},
]
grid = [
    {"driver": "NOR", "team": "McLaren", "gridPosition": 1, "qualifyingGapSec": 0.0},
    {"driver": "HAM", "team": "Ferrari", "gridPosition": 2, "qualifyingGapSec": 0.298},
]


def doc(qualifying):
    return {"id": "2026_r16_bahrain-grand-prix", "year": 2026, "round": 16, "qualifying": qualifying, "race": {"results": results, "tireCompoundPace": []}}


with_quali = doc({"grid": grid})
for none in (None, {"grid": []}, {}):
    assert not has_qualifying(doc(none)), none
    assert to_training_rows(doc(none)) == []
    assert to_dnf_rows(doc(none)) == []
    assert to_pace_rows(doc(none), {}) == []

assert has_qualifying(with_quali)
rows = to_training_rows(with_quali)
assert [r.driver for r in rows] == ["HAM", "NOR"], rows
assert rows[0].qualifying_gap_sec == 0.298 and rows[0].quali_position == 2
assert len(to_dnf_rows(with_quali)) == 2

# a PARTIAL grid is still real data: the missing driver gets the documented fallback, as before
partial = doc({"grid": grid[:1]})
assert has_qualifying(partial)
assert {r.driver for r in to_training_rows(partial)} == {"HAM", "NOR"}

print("training filters: all checks passed")


# ---- no future tyre data in a prediction (traits_before) ----------------------------------------------------
from ml.tyre_features import TyreRaceRow, current_tyre_traits
from train_predict import traits_before

_rows = [
    TyreRaceRow(2025, 24, "VER", "Red Bull Racing", 0.10, 0.02),
    TyreRaceRow(2026, 1, "VER", "Red Bull Racing", 0.20, 0.03),
    TyreRaceRow(2026, 5, "VER", "Red Bull Racing", 0.90, 0.30),  # a later round: must not reach round 3
]
d3, _t3, _g3 = traits_before(_rows, 2026, 3)
d3_expected, _te, _ge = current_tyre_traits(_rows[:2])
assert d3 == d3_expected, "round 3 sees 2025 and 2026 round 1 only"
assert d3 != current_tyre_traits(_rows)[0], "and so differs from using every completed race"
# The next race of the live season (every completed race is earlier): exactly what the old code computed.
assert traits_before(_rows, 2026, 6) == current_tyre_traits(_rows), "live predictions are unchanged"
print("traits_before: all checks passed")
