# F1-Hub prediction pipeline — progress log

What's been built, what was tried and rejected, and why, across the migration from a
formula1.com/TypeScript scraper to a FastF1/Python pipeline. Kept as a single running log rather
than scattered commit messages, since "we already tried that, it didn't work" is exactly the kind
of institutional knowledge that's easy to lose and expensive to rediscover.

## Where this started

The original app scraped formula1.com with Next.js/TypeScript and used the `ml-random-forest` npm
package for predictions, writing scraper-shaped data (slugs, `sourceUrl`, `qualiPosition`) straight
to Firestore.

## Phase 0 — rewire the read layer

Migrated the Next.js *read* side to a new FastF1-native Firestore schema:
`races/{year}_r{round:02d}_{slug}` with `qualifying`/`race` sub-objects, a separate `calendar/`
collection for upcoming events, no hardcoded years or rounds anywhere.

## Phase 1 — Python ML pipeline

Built `fetch_races.py` (FastF1 → Firestore) and `train_predict.py` (train + freeze predictions)
from scratch, replacing the TypeScript/`ml-random-forest` stack entirely. Random Forest was chosen
only after testing it against gradient boosting, a small neural net, and linear regression on the
real chronological backtest — RF won on every one of those comparisons, and the reason it wins is
structural: training sets are tiny (as few as ~20 rows early in a season), and bagging degrades far
more gracefully than boosting at that scale.

## Phase 2 — Elo ratings, shrinkage, model selection

Replaced rolling-average driver/team form with Elo ratings (`ml/elo.py` — decaying K-factor as
built-in shrinkage) and added a grid-baseline shrinkage blend to the finish model (`_blend_with_grid`
in `predict_finish.py`), moving the finish-model backtest from *losing* to plain grid order to
roughly tied. Also ran a direct RF-vs-XGBoost audit on the real backtest: statistically tied
(3.464 vs 3.460 MAE) — kept RF, no reason to add the dependency for a tie.

## Phase 3 — tires, weather, safety cars, pits, traffic

The question that started this phase: why weren't tires/weather/safety-cars/pit-patterns/traffic
in the predictions at all. The honest answer turned out to be three different reasons for three
different buckets of data, not one blanket oversight:

- **Tried and rejected as finish-model features**: circuit-level historical context — safety-car
  rate, overtaking difficulty, rain probability, pit-stop patterns (`ml/circuit_stats.py`, module
  still exists, unused by any model). Built with recency + regulation-era weighting, actually
  fetched (safety-car counts backfilled across all 184 pre-existing races), then tested against the
  real backtest — it *hurt*, every one of the four features, individually and combined
  (3.453 → 3.464 MAE). Root cause, confirmed by correlation analysis: these numbers are identical
  for every driver in a given race, so a model ranking 20 drivers against each other can't extract
  anything from them. This is a general finding, not specific to safety cars — see the standing
  rule in memory (`ml-feature-validation-rule`): a feature must vary across drivers within the same
  race to be a finish/pole-model candidate.
- **Structurally excluded (leakage), not rejected on merit**: actual race-day tire strategy and
  actual race-day weather. Both describe what *happens during* the race being predicted — not
  knowable before the race, so never valid candidates for a pre-race feature, independent of
  whether they'd otherwise help. Stored for display/analysis, never modeled.
- **Tried and shipped, then reverted at the user's explicit request**: FP1/FP2/FP3 practice-pace
  deltas as pole-model features. These *do* vary per driver and are legitimately knowable before
  qualifying (practice always runs first). Verified real improvement (2.974 MAE, Spearman 0.746,
  P1 hit rate 41.7% on the full 175-round set) and shipped as `sklearn-rf-v3-practice` — then
  reverted (2 commits) so the user could rebuild that part themselves. That revert also removed
  `fetch_practice()` from `fetch_races.py` entirely, so practice-session fetching is currently not
  running at all, not just unused. **This is intentionally left for the user, not something to
  redo without their go-ahead.**
- **Deferred, never built**: traffic (car-to-car gaps on track). FastF1 exposes raw per-car
  telemetry (`pos_data`: X/Y/Z position; `car_data`: speed/throttle/brake/DRS) but no built-in
  gap-to-car-ahead metric — turning that into a real feature needs full-field telemetry fetching,
  track-distance alignment between cars, and a from-scratch time-loss heuristic. Scoped as its own
  project, not attempted half-built.

## Pace model — rebuilt from scratch, post-Phase-3

The original pace model (plain OLS, `qualifyingGapSec` → race pace gap) had never been backtested
with real rigor. Fixed that:

- Found and fixed a genuine target-definition bug: DNF drivers' "fastest lap" is whatever they set
  in the handful of laps before retiring, not a measurement of race pace. Excluding them roughly
  doubled the model's edge over a naive baseline (8% → 20% better than "assume race gap equals
  qualifying gap").
- Replaced the single-variable OLS with Random Forest + a dedicated race-pace Elo track
  (`ml/pace_features.py` — ranked by actual fastest-lap gap, not classified finish position, since
  pace and finish diverge on strategy/incidents/reliability) + grid position. Verified improvement
  across every metric: MAE 1.064 → 0.903, R² -0.283 → -0.146, Spearman 0.449 → 0.615.
- Tested and rejected as further Pace features: historical stint-count as a tyre-wear proxy (no
  real per-compound pace data exists to do this properly — hurt the backtest); practice weather
  (noise-level, on the small 38-round sample that has practice data).

R² is still negative — real room left, but nothing cheap has moved it yet.

## Finish model — exhaustively tested, frozen

Five separate hypotheses tested against the identical 175-round walk-forward backtest, all
rejected:

| Experiment | MAE | vs 3.453 |
|---|---|---|
| Predict `finish − grid` (position-change) instead of finish position directly | 3.598 | worse |
| Add the Pace model's own out-of-fold predicted race pace as a feature | 3.459 | worse |
| Swap finish-based Elo for pace-specific Elo | 3.499 | worse |
| Add historical average position-change per driver | 3.478 | worse |
| Add a driver×team interaction Elo | 3.470 | worse |

The interesting part isn't any single rejection — it's that three independent ways of injecting
race-pace information (B, C, and indirectly D/E) all failed to beat grid + qualifying gap +
finish-based Elo. That's evidence of saturation, not just an unlucky run of ideas: for this dataset
and prediction formulation, the current feature set already captures most of the driver-level
signal available. The remaining variance (safety cars, DNFs, weather, strategy, traffic) isn't
"more driver features" — it's race-level events and conditions, which is exactly the class of
thing Phase 3 already showed doesn't fit this kind of per-driver ranking model. **Finish is frozen
at 3.453 MAE and shouldn't be revisited without a fundamentally different hypothesis.**

## Current state, at a glance

| Model | Algorithm | Features | Benchmark | Status |
|---|---|---|---|---|
| Finish-order | RF, monotonic constraints, grid-baseline shrinkage | `grid`, `qualifyingGapSec`, `driverEloRating`, `teamEloRating`, `driverHistoryCount`, `teamHistoryCount` | 3.453 MAE | 🟢 Frozen |
| Pole | RF, monotonic constraints | `driverQualiEloRating`, `teamQualiEloRating`, `driverHistoryCount`, `teamHistoryCount` | — | 🟡 Reverted to Elo-only; FP1-3 rebuild is the user's |
| Pace | RF, monotonic constraints | `grid`, `qualifyingGapSec`, `driverPaceEloRating`, `teamPaceEloRating` | 0.903 MAE, R² -0.146, Spearman 0.615 | 🟢 Shipped, open to further experiments |

## Known constraints

- **FastF1 public API rate limit**: 500 calls/hour hard ceiling. Each practice-session fetch costs
  ~7 API calls, so a bulk historical backfill blows through this in ~20-25 races/hour. The FP1-3
  historical backfill only reached 2018-2019 (23/184 races) before hitting the wall, and can't be
  resumed right now regardless of the rate limit, since its dependency (`fetch_practice()`) was
  removed by the pole-model revert.
- **GitHub Actions secrets** (adi-alt/F1-Hub): were completely unset until fixed directly —
  `FIREBASE_SERVICE_ACCOUNT_JSON`, all 7 `NEXT_PUBLIC_FIREBASE_*` vars, `CRON_SECRET`,
  `SESSION_SECRET`. All three workflows (`fetch-races.yml`, `sync-calendar.yml`, `ci.yml`)
  confirmed working after the fix.

## The next real architecture (not started)

Race-environment/simulation: safety-car, VSC, DNF, and weather *probability* models, feeding a
Monte Carlo race simulator that outputs a full finish-position probability distribution per driver
rather than a single point estimate — evaluated on calibration/log-loss/Brier score, not just MAE.
This is where the data already collected (safety cars, weather, tire stints) has a legitimate home,
now that the simpler per-driver models are demonstrably saturated. Deliberately not started until
the cheaper wins were exhausted first — which, per the Finish-model results above, they now are.
