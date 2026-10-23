"""Plain assert-based self-check (no pytest) for model provenance (audit R-41). `python test_model_provenance.py`."""

from datetime import datetime, timezone

from model_provenance import build_provenance, data_cutoff_label


def test_cutoff_is_newest_completed_race():
    docs = [
        {"year": 2026, "round": 12, "eventName": "Hungarian Grand Prix"},
        {"year": 2026, "round": 13, "eventName": "Dutch Grand Prix"},
        {"year": 2025, "round": 24, "eventName": "Abu Dhabi Grand Prix"},
    ]
    assert data_cutoff_label(docs) == "2026 R13 Dutch Grand Prix"
    assert data_cutoff_label([]) is None
    assert data_cutoff_label([{"year": 2026, "round": 1}]) == "2026 R1"


def test_provenance_shape():
    at = datetime(2026, 10, 23, 9, 30, tzinfo=timezone.utc)
    assert build_provenance("simulator-v2", "2026 R13 Dutch Grand Prix", at) == {
        "modelVersion": "simulator-v2",
        "dataCutoff": "2026 R13 Dutch Grand Prix",
        "generatedAt": "2026-10-23T09:30:00+00:00",
    }
    assert build_provenance("pole-v1", None)["dataCutoff"] is None


if __name__ == "__main__":
    test_cutoff_is_newest_completed_race()
    test_provenance_shape()
    print("model provenance: ok")
