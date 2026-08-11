"""Weather forecast for an upcoming race — deliberately not an ML weather model. If a real
forecast is available at prediction time, use it; historical weather patterns are for analysis,
not for reinventing forecasting FastF1/a weather API already does better.

No live forecast API is wired up yet — WEATHER_API_KEY isn't set anywhere, so right now this
always falls back to the circuit's historical rain-probability/temperature (recency+era weighted,
see ml/circuit_stats.py), clearly labeled `source: "historical_fallback"` rather than pretending
it's a real forecast. The live path is written against OpenWeatherMap's free 5-day/3-hour forecast
endpoint (a real, common, free-tier API) so it's a working drop-in the moment a key exists — it
queries by circuit location *name* rather than hardcoded lat/long, to avoid silently using wrong
coordinates for a circuit no one's verified.

`forecastFetchedAt` is stored alongside every forecast and never overwritten with the eventual
actual observed weather — a forecast is a snapshot of what was knowable at that timestamp, and
silently replacing it later would be a subtle form of look-ahead leakage the moment anyone
back-evaluates forecast accuracy.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

import requests

from ml.circuit_stats import build_circuit_features

# OpenWeatherMap's free tier only forecasts 5 days out — beyond that (or with no key configured,
# or on any API failure) there's nothing to fetch, so the historical fallback is used instead.
FORECAST_HORIZON_DAYS = 5


def _historical_fallback(circuit_records, event_name: str, year: int, round_num: int) -> dict:
    features = build_circuit_features(circuit_records, event_name, year, round_num)
    return {
        "source": "historical_fallback",
        "rainProbability": round(features["circuitRainProbability"], 3),
        "airTempC": round(features["circuitAvgAirTempC"], 1),
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
    }


def _live_forecast(location: str, race_date: datetime) -> dict | None:
    api_key = os.environ.get("WEATHER_API_KEY")
    if not api_key:
        return None
    try:
        response = requests.get(
            "https://api.openweathermap.org/data/2.5/forecast",
            params={"q": location, "appid": api_key, "units": "metric"},
            timeout=10,
        )
        response.raise_for_status()
        entries = response.json().get("list", [])
        if not entries:
            return None
        # Closest 3-hour forecast slot to the actual race start time.
        closest = min(
            entries,
            key=lambda e: abs(datetime.fromisoformat(e["dt_txt"].replace(" ", "T")) - race_date.replace(tzinfo=None)),
        )
        return {
            "source": "openweathermap",
            "rainProbability": round(float(closest.get("pop", 0.0)), 3),
            "airTempC": round(float(closest["main"]["temp"]), 1),
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        print(f"    live forecast failed for {location}: {exc}")
        return None


def fetch_weather_forecast(
    circuit_records, event_name: str, location: str, year: int, round_num: int, race_date: datetime | None
) -> dict:
    """`event_name` (e.g. "Abu Dhabi Grand Prix") is the stable circuit-matching key for the
    historical fallback; `location` (e.g. "Yas Marina") is a best-effort city name for the live
    API's geocoding query — the two aren't interchangeable, see module/circuit_stats.py docstrings
    for why `location` alone isn't stable enough for the former."""
    if race_date is not None:
        days_out = (race_date.replace(tzinfo=None) - datetime.now(timezone.utc).replace(tzinfo=None)).days
        if 0 <= days_out <= FORECAST_HORIZON_DAYS:
            live = _live_forecast(location, race_date)
            if live:
                return live
    return _historical_fallback(circuit_records, event_name, year, round_num)
