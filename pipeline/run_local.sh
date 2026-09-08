#!/bin/bash
# Runs the exact same pipeline GitHub Actions runs, but from this machine - the only reason to do
# that is FastF1 itself: it can't reach livetiming.formula1.com from GitHub Actions (CloudFront
# blocks Azure/GCP/AWS-class IPs categorically - see pipeline/OPENF1_FALLBACK.md), but works fine
# from a residential connection. build_and_push() already tries FastF1 first every time, so running
# this here doesn't need any new code or a separate path - a successful FastF1 fetch here just
# overwrites whatever OpenF1-preliminary row is sitting in the DB with the full official one
# (results_source flips back to 'official', and this is the only source that gives real per-lap
# car position - OpenF1 has no equivalent, see openf1_fallback.py's own _fetch_laps() docstring).
#
# Safe to run any time, any frequency you happen to be at your machine - fetch_races.py's own
# next_relevant_round() gate means it costs one cheap query and exits immediately if nothing is
# actually due, and the 7-day retry window (FETCH_WINDOW_AFTER) means missing a day here or there
# doesn't lose anything, it just catches up whenever you next run it.
#
# Usage:
#   ./pipeline/run_local.sh              # whatever round is currently due, same as the CI schedule
#   ./pipeline/run_local.sh 2026 13       # a specific year/round, bypassing the "is it due" gate
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-)"
export NEXT_PUBLIC_SUPABASE_URL="$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)"
export SUPABASE_SECRET_KEY="$(grep '^SUPABASE_SECRET_KEY=' .env.local | cut -d= -f2-)"
export CRON_SECRET="$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)"

if [ ! -d pipeline/.venv ]; then
  echo "pipeline/.venv not found - run: python3 -m venv pipeline/.venv && pipeline/.venv/bin/pip install -r pipeline/requirements.txt"
  exit 1
fi

pipeline/.venv/bin/python pipeline/fetch_races.py "$@"
