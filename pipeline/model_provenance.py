"""Provenance stamped on every model output train_predict.py writes (audit R-41): which model made it, the
newest race whose data it was trained on (the data cut-off) and when it was generated. The site shows it under
the prediction (ProvenanceLine), so a reader can tell a stale or early-season number from a fresh one.

No third-party imports, so `python test_model_provenance.py` runs without the pipeline's ML dependencies."""

from datetime import datetime, timezone


def data_cutoff_label(completed_docs: list[dict]) -> str | None:
    """The newest completed race in the training history, as "2026 R13 Dutch Grand Prix" - None before any."""
    if not completed_docs:
        return None
    last = max(completed_docs, key=lambda d: (d["year"], d["round"]))
    name = last.get("eventName") or ""
    return f"{last['year']} R{last['round']} {name}".strip()


def build_provenance(model_version: str, data_cutoff: str | None, generated_at: datetime | None = None) -> dict:
    stamp = generated_at or datetime.now(timezone.utc)
    return {"modelVersion": model_version, "dataCutoff": data_cutoff, "generatedAt": stamp.isoformat()}
