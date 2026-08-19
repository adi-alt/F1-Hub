"""One-time export: every Firestore collection/subcollection this app uses -> local JSON files
under migration_data/, so migrate_load.py can iterate against a local copy while getting the
Postgres transform right, instead of re-reading Firestore (and its daily quota) on every retry.

Read-only, single pass over each collection — total doc count across everything this app has is
in the low thousands, comfortably inside a single day's quota. Part of the Firebase -> Supabase
migration (see supabase/schema.sql).

Run:
  export FIREBASE_SERVICE_ACCOUNT_JSON='<same service account JSON the app itself uses>'
  python3 migrate_export.py
"""

import json
import os
import time
from pathlib import Path

from ergast_utils import init_firestore

OUT_DIR = Path(__file__).parent / "migration_data"
MAX_RETRIES = 4
# Deliberately catches anything, not just GoogleAPICallError/RequestException like
# ergast_utils.with_retry does — confirmed live: a 504 DeadlineExceeded on one race's laps
# subcollection stream tripped a bug in this old library version's own internal retry path,
# which raised AttributeError ("'_UnaryStreamMultiCallable' object has no attribute '_retry'")
# instead of actually retrying. That's not a GoogleAPICallError, so the narrower catch would have
# let it straight through.

TOP_LEVEL_COLLECTIONS = [
    "races",
    "archive_races",
    "archive_circuits",
    "archive_drivers",
    "archive_teams",
    "calendar",
    "modelBenchmarks",
    "users",
]


def _load_env_local() -> None:
    """Parsed by hand, not shell-sourced — FIREBASE_SERVICE_ACCOUNT_JSON's raw JSON value has
    spaces/braces that break naive `source .env.local`. Only fills in what isn't already set, so
    an explicit `export` before running this still wins."""
    env_path = Path(__file__).parent.parent / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def dump_collection(db, name: str) -> list[dict]:
    docs = [{"id": d.id, **d.to_dict()} for d in db.collection(name).stream()]
    print(f"{name}: {len(docs)} docs")
    return docs


def fetch_subcollection_docs(ref, name: str) -> list[dict] | None:
    """Returns None (skip, don't crash the whole export) if this one subcollection still won't
    read after retrying — same "missing data isn't an error" stance enrich_archive_laps.py
    already takes for laps specifically; a handful of unreadable races out of ~1,150 is a fine
    trade against losing every race after whichever one happens to time out first."""
    for attempt in range(MAX_RETRIES):
        try:
            return [d.to_dict() for d in ref.collection(name).stream()]
        except Exception as exc:  # noqa: BLE001 - see MAX_RETRIES comment above
            if attempt == MAX_RETRIES - 1:
                print(f"    {ref.id}/{name}: giving up after {MAX_RETRIES} attempts ({exc}) — skipping")
                return None
            time.sleep(5)
    return None


def main():
    _load_env_local()
    OUT_DIR.mkdir(exist_ok=True)
    db = init_firestore()

    for name in TOP_LEVEL_COLLECTIONS:
        docs = dump_collection(db, name)
        (OUT_DIR / f"{name}.json").write_text(json.dumps(docs, default=str))

    # archive_races/{id}/laps — keyed by parent race id, only written when non-empty. Checkpointed
    # to disk every 200 races (not just at the very end) so a run that dies partway through on one
    # more bad race still leaves everything found up to that point on disk, resumable by rerunning
    # (this loop always starts from scratch, but the file it overwrites only ever grows).
    laps_by_race = {}
    race_snaps = list(db.collection("archive_races").stream())
    for i, race_snap in enumerate(race_snaps, 1):
        laps = fetch_subcollection_docs(race_snap.reference, "laps")
        if laps:
            laps_by_race[race_snap.id] = laps
        if i % 200 == 0 or i == len(race_snaps):
            (OUT_DIR / "archive_laps.json").write_text(json.dumps(laps_by_race, default=str))
            print(f"  ...{i}/{len(race_snaps)} races checked, {len(laps_by_race)} with lap data so far")
    total_laps = sum(len(v) for v in laps_by_race.values())
    print(f"archive_races/*/laps: {total_laps} lap docs across {len(laps_by_race)} races")

    # users/{uid}/picks — keyed by parent user uid
    picks_by_user = {}
    for user_snap in db.collection("users").stream():
        picks = fetch_subcollection_docs(user_snap.reference, "picks")
        if picks:
            picks_by_user[user_snap.id] = picks
    total_picks = sum(len(v) for v in picks_by_user.values())
    print(f"users/*/picks: {total_picks} picks across {len(picks_by_user)} users")
    (OUT_DIR / "picks.json").write_text(json.dumps(picks_by_user, default=str))

    print(f"Done. Files written to {OUT_DIR}")


if __name__ == "__main__":
    main()
