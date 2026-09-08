# OpenF1 preliminary-results fallback

## Why this exists

FastF1's built-in results path ultimately depends on Jolpica-F1 (the community successor to the
now-shut-down classic Ergast API) for the official race classification. Jolpica documents its own
update cadence as "a single update per race weekend on the Monday after the event," with an
explicit caveat that there can be further delay "outside of their control while refining import
scripts." In practice this meant a completed race could sit un-updated on the homepage for multiple
days.

FastF1 (v3.6.0+) also has its own automatic "preliminary results from timing data" fallback for
exactly this situation - verified working locally against a real race - but it consistently failed
in this project's GitHub Actions environment specifically (reproduced twice on fresh runs; most
consistent with GitHub's shared runner IPs being rate-limited/blocked by F1's timing servers, a
known category of problem for datacenter IPs hitting broadcast/anti-scraping-protected APIs - not
proven with 100% certainty, and deliberately not chased further past a time-boxed investigation).

This module is what fills that gap: when `fetch_race()` (FastF1) returns `None`, `fetch_races.py`
tries [OpenF1](https://openf1.org) - a free, no-API-key service that sources from F1's live timing
feed directly rather than Ergast/Jolpica, so it doesn't share that source's multi-day lag (confirmed
live: had full position data for a race within 2 days when Jolpica still had nothing).

## Architecture: FastF1 stays primary, OpenF1 is a preliminary-only fallback

```text
FastF1 / Jolpica (official)
        |
     succeeds?
    /         \
  yes           no
   |             |
official    OpenF1 fallback -> preliminary classification
   |             |
   +------ races table (Postgres) ------+
                  |
            Next.js app reads
```

OpenF1 is **never** used to replace FastF1's own analysis. It only ever produces a *preliminary
classification* - who finished where, roughly what status, real grid position (reused from the
pipeline's own already-fetched qualifying data). It never attempts weather, tire-compound pace/
degradation, traffic stats, safety-car periods, or lap-by-lap timing - those columns stay empty on
a preliminary result until the official upgrade lands. Championship points are also never computed
here (OpenF1 carries no points field, confirmed live) - `points` is written as `0` (a real,
documented placeholder, not a fabricated score) until FastF1/Jolpica's real number replaces it.

This lives entirely inside the Python pipeline, never the Next.js runtime - the live app never
calls OpenF1 directly, so its uptime and rate limits are never a page-load dependency.

## Provenance: two columns, not a new lifecycle status

- `races.results_source` (`'official'` | `'openf1_preliminary'`) - where the race's classification
  came from.
- `race_results.status_source` (`'official'` | `'lap_distance_derived'`) - per-driver, since a
  wrong DNF derivation is training-data noise for `predict_dnf.py`, not just a display detail (see
  below).
- `races.data_completeness` (jsonb) - which specific analyses are actually populated
  (`classification`/`grid`/`laps`/`weather`/`tireData`/`trafficAnalysis`/`safetyCarAnalysis`/
  `fastestLap`), computed from what's really present, not assumed from the source alone.

`races.status` deliberately stays a plain `'completed'` either way - a preliminary result is a real,
displayable race result, and the whole point is that users see it immediately. A fourth lifecycle
value (`'preliminary'`) was considered and rejected: it would require auditing every place the app
already checks `status === 'completed'`, and if any were missed, a preliminary race would simply not
show as completed anywhere - defeating the purpose. `results_source`/`data_completeness` capture
everything a `data_status` enum would have, without duplicating it.

## How the classification is derived

1. `GET /v1/sessions?year&country_name&session_name=Race` → session_key. `races.country` already
   stores the exact string OpenF1's `country_name` expects (verified live: `"Italy"`) - no fuzzy
   circuit-name matching needed.
2. `GET /v1/drivers` → number → name/team.
3. `GET /v1/position` → the last position record per driver (by max timestamp) is the final
   classified position.
4. `GET /v1/laps` → total laps completed per driver, used only to derive `status`.

### Status derivation and its verified, honest limits

A driver is `finished` if their lap count matches the winner's, `lapped` if ≥90% of the winner's lap
count (F1's own real classification convention - a car must cover most of the race distance to be
classified at all), otherwise `dnf`.

**Verified against three real, structurally different historical races before shipping:**

| Race | Shape | Result |
|---|---|---|
| 2026 Italian GP (round 13) | Clean finish, 3 clear big-deficit retirements | Exact match to the real result, all 3 retirees correctly `dnf` |
| 2023 Spanish GP | Normal race, zero retirements | Exact match, top 10 identical to the real result, zero false DNFs |
| 2023 Australian GP | Extreme case: 3 red flags, 8 retirements, 4 of them crashing out within the final lap | 4 big-deficit retirees correctly `dnf`; the 4 last-lap crashes (Gasly, Ocon, de Vries, Sargeant) show as `lapped` (they really were only 1-2 laps down when they crashed) |

**A race-control-message-based refinement was tried and explicitly rejected.** F1's race control
feed has no clean "RETIRED"/"DNF" keyword to match on, but it does log
`"INCIDENT INVOLVING CAR N ..."` messages. Matching a driver's last recorded lap against a nearby
incident message *did* correctly reclassify Gasly/Ocon as `dnf` on the Australian GP test - but it
also produced a real false positive: Sainz was named in an incident (spinning Alonso) but actually
finished the race, and would have been wrongly marked `dnf`. De Vries and Sargeant's retirements
also had no matching stewarded-incident message at all (single-car offs without a review don't
always generate one), so the refinement didn't even fully solve the problem it targeted.

Given a choice between a heuristic that's simple and has a bounded, honest gap (misses last-lap
crashes on rare chaotic races) versus one that's more complex and *sometimes confidently wrong*, the
simpler lap-distance-only rule is what shipped. **Known limitation, stated plainly: a driver who
retires within the final ~10% of race distance may show as `lapped` instead of `dnf` until the
official upgrade lands.** This affects a small number of drivers in unusual, multi-incident races
only - both other test races had zero such cases.

### Missing data is never guessed

A driver present in `/drivers` but absent from `/laps` gets skipped entirely, not assigned a status
- logged clearly (`"skipping X, no lap data"`), never silently defaulted to `dnf` or `finished`. If
`/laps` has no data for *any* driver, the whole fallback returns `None` rather than a
classification derived from nothing. Same for a driver present in `/position` but not `/drivers` (no
name/team to attach).

## Reconciliation

`is_already_completed()` and `next_relevant_round()` both treat a round as "not really done yet" if
`results_source = 'openf1_preliminary'`, even though `status` already reads `'completed'` - so the
pipeline keeps attempting FastF1 on every tick within the existing 7-day fetch window. When FastF1
eventually succeeds, `build_and_push()`'s normal upsert path overwrites the row with the full
official result (real points, weather, tire pace, traffic stats, safety car periods) and flips
`results_source` back to `'official'` - no separate merge/reconciliation code, it's the exact same
write path every completed race already goes through.

## Training implications (`predict_dnf.py`)

`to_dnf_rows()` in `train_predict.py` trains directly off `race_results.status == 'dnf'` per driver
- so the lap-distance heuristic's known limitation above is training-data noise, not just a display
inaccuracy, on the rare chaotic race it affects. `status_source` is written per-row specifically so
this can be filtered or weighted by confidence later if it ever matters, without needing to
re-derive it after the fact. `to_training_rows()`/`to_tyre_rows()` already tolerate missing/empty
race-level jsonb gracefully (`tire_compound_pace or []`, confirmed in the existing code before this
change) - a preliminary race with empty tire/traffic data simply contributes zero rows to those
specific models, not a crash or corrupted training set.

## Explicitly not done in this pass

- No UI "provisional result" badge yet on the homepage/race page - separate, smaller follow-up once
  this is proven live.
- No AI-context/prompt/schema changes - `results_source`/`data_completeness` are real, queryable
  columns a future Muse Glimmer context-building enhancement could read, but this pass doesn't touch
  `context.ts`, `homepagePrompt.ts`, or the schema. That's deliberately deferred until reconciliation
  from `openf1_preliminary` → `official` has actually been observed on a real race.
