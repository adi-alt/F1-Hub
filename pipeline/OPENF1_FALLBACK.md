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
in this project's GitHub Actions environment specifically. **Root cause confirmed, not just
suspected**: a direct request from inside a GitHub Actions runner to the exact URL FastF1 itself
uses (`https://livetiming.formula1.com/static/.../SessionInfo.jsonStream`) gets a real `403` back
from CloudFront (`X-Cache: Error from cloudfront`, body: `"Request blocked... too much traffic or a
configuration error"`) - the same URL, same moment, from a normal machine returns a real `200` with
real data. This is CloudFront/AWS WAF blocking GitHub Actions' shared runner IP range at the CDN
layer, not a timeout, not a 429, not a data-availability gap - confirmed via a one-off temporary
diagnostic step run directly in the actual workflow (see git history around this commit for the
throwaway script, since removed). FastF1 itself already has a fallback mirror for exactly this class
of problem (`livetiming-mirror.fastf1.dev`, visible in its own debug log) - it also came back empty
for this session, so the mirror isn't a reliable fix either.

This means the block is structural, not something our own request volume causes or self-heals from:
it would 403 on the very first FastF1 call from any GitHub Actions job, not just after repeated
hits. The OpenF1 fallback below isn't a stopgap for occasional bad luck - it's the necessary path for
anything running in this specific hosting environment, since raw FastF1 fundamentally cannot reach
its own data source's CDN from here.

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
classification* - who finished where, real status, real points, real grid position (all read
directly from OpenF1's `session_result`/`starting_grid`, see below). It never attempts weather,
tire-compound pace/degradation, traffic stats, safety-car periods, or lap-by-lap timing - those
columns stay empty on a preliminary result until the official upgrade lands. (An earlier version of
this doc said OpenF1 had no points field at all - true at the time, no longer true: `session_result`
now returns real `points` directly, used as-is rather than a `0` placeholder.)

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

## How the classification is derived (v2)

**v1 of this module (see git history) hand-rolled a classification from raw `/position` + `/laps`
records, including a lap-count-percentage heuristic to guess `dnf` vs `lapped`.** That's no longer
necessary: OpenF1 has since grown a `session_result` endpoint that gives real position/points/
dnf/dns/dsq/gap directly - verified live against the 2026 Italian GP (exact match, including all 3
real retirees and the exact points for every classified driver). v2 uses this instead:

1. `GET /v1/sessions?year&country_name` (whole weekend, not filtered by session_name) → the Race
   session's `session_key` and `date_end`, and the Qualifying session's `session_key` (needed for
   `starting_grid`, which is NOT keyed by the Race session - verified live, a Race-keyed request
   returns nothing). `races.country` already stores the exact string OpenF1's `country_name`
   expects (verified live: `"Italy"`).
2. `GET /v1/session_result?session_key=<race>` → `position`, `points`, `dnf`/`dns`/`dsq`,
   `gap_to_leader`, per driver_number. This is the real classification - no longer derived.
3. `GET /v1/drivers?session_key=<race>` → number → name/team/headshot/color.
4. `GET /v1/starting_grid?session_key=<qualifying>` → real grid position, keyed by the qualifying
   session. `qualifying_grid` (FastF1's own already-fetched grid, passed in by build_and_push) is
   now a last-resort fallback only, used solely for a driver OpenF1's own grid data is missing -
   not a hard dependency, since the entire point of this module is to cover for FastF1 having
   failed.

### Status mapping (direct, not derived)

- `dsq` folds into `dnf` (didn't finish classified - the same bucket a real FastF1 disqualification
  already lands in via `normalize_status()`). `race_results.status` has no separate DSQ value
  (supabase/schema.sql) - a schema change for this is out of scope for this pass.
- `dns` is skipped entirely, never written - a driver who never started has no finishing position
  to rank, same pattern `fetch_race()` already uses for a driver with no classified `Position`.
- `lapped` (finished, but laps down) is read off `gap_to_leader`'s own type: OpenF1 returns a float
  (seconds) for a same-lap finisher, or a string like `"+1 LAP"`/`"+2 LAPS"` for a lapped one -
  verified live (cars 15-19 in the Italian GP all had `dnf: false` with a `"+N LAP(S)"` string). No
  lap-count comparison needed - OpenF1 already classifies this for us.

**This removes v1's one documented limitation** (a driver retiring within the final ~10% of race
distance could show as `lapped` instead of `dnf`) - `dnf`/`dsq` now come directly from OpenF1's own
timing-derived classification, not a lap-count guess. `status_source` is still written as
`'lap_distance_derived'` for these rows (the check constraint only allows that literal string or
`'official'` - a rename would need a migration for no behavior change) but the name is now a
holdover, not an accurate description - see the code comment at its call site.

### Validation before writing

`_validate()` rejects the whole result (returns `None`, same as "nothing available") rather than
writing anything partial or malformed: no duplicate driver codes, no duplicate finishing positions,
every status in the allowed 3-way enum, no negative points. A rejected result prints exactly why
(e.g. `"duplicate driver code(s): [...]"` ) to the run log.

### Missing data is never guessed

A driver present in `/session_result` but absent from `/drivers` gets skipped entirely, logged
clearly (`"skipping car N, no driver info"`) - never assigned a name/team from nothing. If
`/session_result` has no rows at all, the whole fallback returns `None`.

### Availability telemetry

Every fallback attempt logs how long after the race's actual `date_end` (from OpenF1's own session
record) a usable `session_result` was found - printed plainly to the run log, not persisted to a
new table/column. Enough real races through this and `gh run view --log` gives a real answer to
"how fresh is this really," without building a dashboard for a question three data points can
answer.

## Reconciliation

`is_already_completed()` and `next_relevant_round()` both treat a round as "not really done yet" if
`results_source = 'openf1_preliminary'`, even though `status` already reads `'completed'` - so the
pipeline keeps attempting FastF1 on every tick within the existing 7-day fetch window. When FastF1
eventually succeeds, `build_and_push()`'s normal upsert path overwrites the row with the full
official result (real points, weather, tire pace, traffic stats, safety car periods) and flips
`results_source` back to `'official'` - no separate merge/reconciliation code, it's the exact same
write path every completed race already goes through.

## Training implications (`predict_dnf.py`)

`to_dnf_rows()` in `train_predict.py` trains directly off `race_results.status == 'dnf'` per driver.
As of v2, that status is read directly from OpenF1's own `dnf`/`dsq` flags rather than derived from
a lap-count heuristic, so this is no longer a real accuracy concern for training data the way v1's
documented limitation was - `status_source` still marks these rows `'lap_distance_derived'` (the
existing enum value, not renamed - see above) purely as "not yet reconciled with official," should
that distinction ever matter for something else. `to_training_rows()`/`to_tyre_rows()` already
tolerate missing/empty race-level jsonb gracefully (`tire_compound_pace or []`, confirmed in the
existing code) - a preliminary race with empty tire/traffic data simply contributes zero rows to
those specific models, not a crash or corrupted training set.

## Explicitly not done in this pass

- No UI "provisional result" badge yet on the homepage/race page - separate, smaller follow-up once
  this is proven live.
- No AI-context/prompt/schema changes - `results_source`/`data_completeness` are real, queryable
  columns a future Muse Glimmer context-building enhancement could read, but this pass doesn't touch
  `context.ts`, `homepagePrompt.ts`, or the schema. That's deliberately deferred until reconciliation
  from `openf1_preliminary` → `official` has actually been observed on a real race.
- No schema change to add a real DNS/DSQ status value, or to rename `status_source`'s
  `'lap_distance_derived'` value now that it's no longer a heuristic - both are cosmetic/precision
  improvements with no behavior change, deferred rather than bundled into this pass.

## Orange Cat Blacktop (blacktop.live) - evaluated, not integrated

A commercial API was benchmarked against OpenF1 for this same race (2026 Italian GP) before v2 was
built, in case it made OpenF1 unnecessary. Real findings, verified live with a provided API key:

- Free tier: 7,500 requests/month, 60 requests/minute, no card required.
- Real, working results endpoint:
  `GET /v1/formula1/events/{eventId}/sessions/{sessionId}/results` (nested under the specific
  session's own id - the earlier investigation missed this exact path and wrongly concluded no
  results endpoint was reachable on the free tier; corrected once the real guide page was found).
- Response is genuinely richer than OpenF1's for this same race: real `points`, real `status`
  (`"OK"`/`"DNF"`), real `gridPosition`, plus **per-stint tire strategy, pit-stop counts, and per-driver
  best lap/sector times** - none of which OpenF1's `session_result` carries.
- Both OpenF1 and Orange Cat Blacktop had full results within the same ~2-day window Jolpica itself
  eventually caught up in for this race - no decisive freshness edge between them once both expose
  a direct results endpoint (this wasn't true before `session_result` existed, when OpenF1 required
  hand-deriving from raw position/lap events).

**Not integrated**, because it would add a second, undisclosed-data-source, single-vendor external
dependency for what OpenF1 (already integrated, already free, already proven) now covers adequately
for classification. **Documented here as a real, verified option specifically for race-strategy
data** (tire strategy, pit stops, sector times) that neither FastF1 nor OpenF1 currently provide in
this pipeline - worth a real look if/when a feature needs that (e.g. a post-race "why your
prediction missed" strategy breakdown), not as part of the results fallback chain.
