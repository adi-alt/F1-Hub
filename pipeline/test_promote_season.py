"""Plain assert-based self-check (no pytest) for when a season is promoted into the archive (audit R-22).
`python test_promote_season.py`"""

from promote_season import plan_for_year

none = {"rows": 0, "enriched": 0, "circuits": 0, "laps": 0}
full = {"rows": 24, "enriched": 24, "circuits": 24, "laps": 24}

# an unfinished season is never promoted, however complete the archive looks
action, why = plan_for_year(2026, 23, 16, none)
assert action == "skip" and "16 of 23" in why, (action, why)

# a season with no calendar at all (nothing to compare against) is left alone
assert plan_for_year(2027, 0, 0, none)[0] == "skip"

# finished and not archived: promote
assert plan_for_year(2026, 24, 24, none)[0] == "promote"

# finished, archived in full: nothing to do (and so safe to schedule every week of December and January)
action, why = plan_for_year(2025, 24, 24, full)
assert action == "skip" and "already archived" in why, (action, why)

# finished, partly archived: any missing piece resumes the job
for missing in ({"rows": 20}, {"enriched": 10}, {"circuits": 0}, {"laps": 23}):
    assert plan_for_year(2026, 24, 24, {**full, **missing})[0] == "promote", missing

# laps only matter from 1996: an older season with no lap data is complete without it
assert plan_for_year(1990, 16, 16, {"rows": 16, "enriched": 16, "circuits": 16, "laps": 0})[0] == "skip"

print("promote season: all checks passed")
