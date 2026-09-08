"""Throwaway diagnostic - not part of the pipeline, delete after use. Answers one question: does
GitHub Actions' own network path to F1's live-timing CDN behave differently than a normal machine's,
for the exact endpoint FastF1 itself uses for round 13."""
import logging
import os

import requests

url = "https://livetiming.formula1.com/static/2026/2026-09-06_Italian_Grand_Prix/2026-09-06_Race/SessionInfo.jsonStream"
print("=== direct request to the real endpoint FastF1 uses ===")
print("url:", url)
try:
    r = requests.get(url, timeout=15, headers={"User-Agent": "FastF1/3.8.3"})
    print("status:", r.status_code)
    print("headers:", dict(r.headers))
    print("body[:500]:", r.text[:500])
except Exception as exc:
    print("EXCEPTION:", repr(exc))

print()
print("=== fastf1 with DEBUG logging to surface the real swallowed error ===")
import fastf1
fastf1.logger.LoggingManager.set_level(logging.DEBUG)
cache_dir = os.path.join(os.path.dirname(__file__), "_diag_cache")
os.makedirs(cache_dir, exist_ok=True)
fastf1.Cache.enable_cache(cache_dir)
session = fastf1.get_session(2026, 13, "R")
try:
    session.load(laps=False, weather=False, telemetry=False, messages=False)
except Exception as exc:
    print("load() raised:", repr(exc))
print("session.results empty?", session.results is None or session.results.empty)
