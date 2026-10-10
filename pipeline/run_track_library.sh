#!/bin/bash
# Keeps the track library current, from this machine: F1's live-timing archive refuses GitHub's runners (its
# CloudFront blocks datacenter IPs - see run_local.sh), so this can't be a scheduled workflow.
#
#   1. race_track_story.py --backfill   each completed race without a story: its own traced outline and where the
#                                        lead changed (race_track_stories)
#   2. circuit_layouts.py --rebuild-measured
#                                        regroups every traced season into layout versions (circuit_layouts): a
#                                        season whose track no longer matches starts a new version - a changed or
#                                        new circuit enters the library here
#
# A dry run (reads production, writes nothing) unless --apply. Run after a race weekend, or any time: both
# steps are idempotent and only do what's missing or changed.
#
# Usage:
#   ./pipeline/run_track_library.sh                  # dry run: what would be stored, and any layout changes
#   ./pipeline/run_track_library.sh --apply          # store it
#   ./pipeline/run_track_library.sh --apply --since 2018 --limit 200   # a first, full backfill
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-)"
export CRON_SECRET="$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)"

if [ ! -d pipeline/.venv ]; then
  echo "pipeline/.venv not found - run: python3 -m venv pipeline/.venv && pipeline/.venv/bin/pip install -r pipeline/requirements.txt"
  exit 1
fi

apply=""
story_args=(--backfill)
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) apply=1 ;;
    --since|--limit) story_args+=("$1" "$2"); shift ;;
    *) echo "unknown option: $1"; exit 1 ;;
  esac
  shift
done

cd pipeline
if [ -n "$apply" ]; then
  ../pipeline/.venv/bin/python race_track_story.py "${story_args[@]}"
  ../pipeline/.venv/bin/python circuit_layouts.py --rebuild-measured --apply
else
  ../pipeline/.venv/bin/python race_track_story.py "${story_args[@]}" --dry-run
  ../pipeline/.venv/bin/python circuit_layouts.py --rebuild-measured
fi
