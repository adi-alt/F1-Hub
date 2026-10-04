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
