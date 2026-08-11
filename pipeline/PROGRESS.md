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
  still exists, unused by any model). Built with recency + regulation-era weighting; safety-car
  counts were fetched and backfilled across all 184 pre-existing races at the time. Tested against
  the real backtest — it *hurt*, every one of the four features, individually and combined
  (3.453 → 3.464 MAE). Root cause, confirmed by correlation analysis: these numbers are identical
  for every driver in a given race, so *for this specific ranking formulation* — a model ordering
  20 drivers against each other within one race — there's no standalone discriminative information
  to extract. That's not a claim that circuit-level data is inherently useless; the same
  `circuit_SC_rate = 0.42` that can't distinguish Verstappen from Norris inside this Random Forest
  could be exactly the input a future `P(safety car | race)` model needs, since that model isn't
  ranking drivers against each other at all. See the standing rule in memory
  (`ml-feature-validation-rule`): a feature must vary across drivers within the same race to be a
  finish/pole/pace-model candidate — that's a rule about *this layer* of the architecture, not a
  general verdict on the data. **The safety-car fetch itself was bundled into the same
  2 commits as the FP1-3 practice work and got removed by the revert below — safety cars aren't
  being fetched at all right now, not just unused.**
- **Structurally excluded (leakage), not rejected on merit**: actual race-day tire strategy and
  actual race-day weather. Both describe what *happens during* the race being predicted — not
  knowable before the race, so never valid candidates for a pre-race feature, independent of
  whether they'd otherwise help. Stored for display/analysis, never modeled.
- **Shipped, reverted, then rebuilt**: FP1/FP2/FP3 practice-pace deltas as pole-model features.
  These *do* vary per driver and are legitimately knowable before qualifying (practice always runs
  first). Verified real improvement, shipped as `sklearn-rf-v3-practice`, reverted at the user's
  explicit request so they could rebuild it themselves, then rebuilt at the user's later explicit
  request — re-verified fresh on the current dataset before recommitting (Elo-only 3.014 → Elo +
  practice 2.974 MAE), not just trusting the old numbers. The historical practice-data backfill
  also finished completely this time (184/184 races, across several rate-limit-respecting passes),
  so the frozen benchmark now reflects real practice data for every evaluable round instead of
  falling back to neutral defaults for 2020-2026 — see the current-state table below for the final
  numbers.
- **Fetched and tested, rejected as a Pace feature**: traffic (car-to-car gaps on track). Turned
  out to be much cheaper than the full-telemetry approach first assumed — lap `Position` + `Time`
  (already loaded via `laps=True`) is enough to compute gap-to-car-ahead per lap without any GPS
  telemetry, no new fetch cost. Backfilled across all 184 races (`race.trafficStats`, from local
  cache, no rate-limit exposure). Tested as a leakage-safe historical feature (a driver's own
  average traffic exposure from strictly-prior rounds this season, not this race's own — which
  would be leakage) against the Pace benchmark: 0.905 → 0.904 MAE, a wash. Not shipped as a model
  feature, kept as raw data — likely too noisy/circumstantial a trait to persist race-to-race
  compared to something like Elo, and probably partly redundant with grid position (which already
  correlates with how much traffic a driver sees).

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
  (noise-level, on the small 38-round sample that has practice data); historical traffic exposure
  (see the traffic entry above — 0.905 → 0.904 MAE, a wash).

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
| Pole | RF, monotonic constraints | `driverQualiEloRating`, `teamQualiEloRating`, `driverHistoryCount`, `teamHistoryCount`, `fp1DeltaToBestSec`, `fp2DeltaToBestSec`, `fp3DeltaToBestSec` | MAE 2.872, naive baseline 3.595, Spearman 0.762 (pooled 0.765), P1 hit rate 38.3%, top-3 overlap 1.93/3, top-5 overlap 3.65/5 — full 175-round set, frozen at `modelBenchmarks/sklearn-rf-v3-practice` | 🟢 Shipped |
| Pace | RF, monotonic constraints | `grid`, `qualifyingGapSec`, `driverPaceEloRating`, `teamPaceEloRating` | 0.903 MAE, R² -0.146, Spearman 0.615 | 🟢 Shipped, open to further experiments |

## Known constraints

- **FastF1 public API rate limit**: 500 calls/hour hard ceiling. Each practice-session fetch costs
  ~7 API calls, so a bulk historical backfill blows through this in ~20-25 races/hour. The FP1-3
  historical backfill needed 7 separate rate-limit-respecting passes (spaced far enough apart to
  let the ceiling reset) to go from 23/184 to the full 184/184 — expect the same pattern for any
  future bulk historical fetch of a new data type.
- **GitHub Actions secrets** (adi-alt/F1-Hub): were completely unset until fixed directly —
  `FIREBASE_SERVICE_ACCOUNT_JSON`, all 7 `NEXT_PUBLIC_FIREBASE_*` vars, `CRON_SECRET`,
  `SESSION_SECRET`. All three workflows (`fetch-races.yml`, `sync-calendar.yml`, `ci.yml`)
  confirmed working after the fix.

## Race-environment / simulation architecture — in progress

Safety-car, VSC, DNF, and weather *probability* models, feeding a Monte Carlo race simulator that
outputs a full finish-position probability distribution per driver rather than a single point
estimate — evaluated on calibration/log-loss/Brier score, not just MAE. This is where circuit-level
data (safety cars, tire stints, weather) has a legitimate home, now that the simpler per-driver
models are demonstrably saturated.

**Step 1 — safety car, tried, null result.** `race.safetyCarPeriods` re-fetched (this time with a
legitimate race-level use, unlike its earlier rejected per-driver-feature attempt) and backfilled
across all 184 races. Built a race-level `P(safety car occurred | race)` model and tested three
feature formulations against a naive "historical global base rate" baseline (~73% of races have a
safety car), all with proper walk-forward validation: `circuit_stats.py`'s recency+era-weighted
rate, a purpose-built circuit-own-occurrence-rate, and a shrinkage blend swept across trust
thresholds. **All converge to the same conclusion: circuit-specific signal doesn't beat the global
rate with this much data** (~5-11 races per circuit — real cross-circuit variation exists in the
raw numbers, from 43% at Yas Island to 100% at Baku/Mexico City/Jeddah, but it's too noisy a sample
per circuit to exploit reliably going forward). The shrinkage sweep makes this unambiguous: trusting
circuit-specific data more aggressively only makes predictions worse (Brier 0.2265 at low trust vs
0.2088 naive), converging back to the naive number as trust decreases toward zero. Not shipped as a
model — for now, the honest answer for a simulation's `P(SC)` input is closer to "the global base
rate" than "a circuit-specific model." `circuit_stats.py` kept as infrastructure regardless; the
module itself is fine, this specific application of it just didn't pan out.

**Steps 2/3 (DNF, weather-forecast-based) and the Monte Carlo engine itself: not started.**
