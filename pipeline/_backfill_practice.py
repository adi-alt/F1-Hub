"""One-off: fetch FP1/FP2/FP3 for races that were fetched before `fetch_practice` existed. Not
part of the regular pipeline — every race fetched from here on gets it via fetch_races.py
directly. Partial update only (`practice` field), never touches anything else on the doc.
"""

import json
import os
from pathlib import Path

import fastf1
import firebase_admin
from firebase_admin import credentials, firestore

from fetch_races import fetch_practice

CACHE_DIR = Path(__file__).resolve().parent / "f1_cache"
CACHE_DIR.mkdir(exist_ok=True)
fastf1.Cache.enable_cache(str(CACHE_DIR))

raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
firebase_admin.initialize_app(credentials.Certificate(json.loads(raw)))
db = firestore.client()

docs = list(db.collection("races").where("status", "==", "completed").stream())
print(f"{len(docs)} completed races")

for doc in docs:
    data = doc.to_dict()
    if data.get("practice"):
        continue
    year, round_num = data["year"], data["round"]
    practice = {}
    for label in ("FP1", "FP2", "FP3"):
        result = fetch_practice(year, round_num, label)
        if result:
            practice[label] = {"bestLaps": result["bestLaps"], "weather": result["weather"]}
    if practice:
        doc.reference.update({"practice": practice})
        print(f"  {doc.id}: {sorted(practice.keys())}")
    else:
        print(f"  {doc.id}: no practice data available")

print("Done.")
