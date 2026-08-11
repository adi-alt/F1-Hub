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

**Step 2 — DNF, tried, real signal.** Unlike safety cars, DNF is naturally driver/team-specific,
which is exactly what made it a richer target. `ml/predict_dnf.py` — `P(driver DNF)`, cross-season
on purpose (reliability plausibly persists across season boundaries in a way pure competitive
strength doesn't, unlike the Elo-based models). Compared 5 formulations with proper walk-forward
validation (Brier score primary, plus log loss and ROC-AUC):

| Formulation | Brier | LogLoss | AUC |
|---|---|---|---|
| Global rate (naive baseline) | 0.1260 | 0.4194 | 0.500 |
| Driver historical rate alone | 0.1309 | 0.5483 | 0.515 |
| Team historical rate alone | 0.1274 | 0.4491 | 0.538 |
| Driver + team (logistic regression) | 0.1259 | 0.4191 | 0.505 |
| **RF (raw driver/team rates + grid + qualifying gap)** | **0.1252** | **0.4162** | **0.554** |

The driver/team rates *alone* are too noisy to beat naive (small-N per driver/team, same lesson as
the safety-car circuit rates) — but combined with grid and qualifying gap inside a Random Forest,
the result beats naive on all three metrics, not just one. Also tried shrinking the driver/team
rates toward the global rate before feeding the RF (the same principle behind grid-baseline
shrinkage elsewhere) — consistently slightly *worse* than raw at every trust threshold tried,
because RF already learns the equivalent of adaptive trust from raw sample counts via its own
split structure; a hand-tuned linear shrinkage on top is redundant here (unlike for the plain
logistic regression, which has no such mechanism). No consumer yet — this feeds the Monte Carlo
simulator (Step 4), not any currently-shipped prediction.

**Step 3 — weather, shipped, no ML model (deliberately).** `weather_forecast.py` — for an upcoming
race, use a real forecast if available (written against OpenWeatherMap's free 5-day forecast API,
ready to activate once a `WEATHER_API_KEY` secret exists), otherwise fall back to the circuit's
historical rain-probability/temperature via `circuit_stats.py`, clearly labeled `source:
"historical_fallback"` rather than pretending to be a real forecast. Every forecast stores a
`fetchedAt` timestamp and is never silently overwritten by the eventual actual weather — treating a
forecast as a permanent snapshot of what was knowable at that time, not something to retcon later.
Wired into `sync_calendar.py`'s `calendar` collection (the right home, since a forecast is
inherently about an upcoming race, and `races` docs don't exist until something has actually
happened). No ML weather model was built, on purpose — a real forecast is a better input than
reinventing one from history when the actual production input is a live forecast.

**Real bug found and fixed along the way:** `circuit_stats.py` matched circuits by Firestore's
`location` field, but FastF1 reports different `Location` strings for the same physical circuit
across years for at least 4 events (Monaco: "Monte Carlo"/"Monaco", Singapore:
"Singapore"/"Marina Bay", Abu Dhabi: "Yas Marina"/"Yas Island", Miami: "Miami"/"Miami Gardens").
That silently broke matching for those circuits, fell through to the whole-history fallback pool,
and produced nonsense — Abu Dhabi's rain probability came out as 100% for a circuit with zero
rainy races on record, because the era/recency weighting in that fallback ends up dominated by
whichever handful of races happen to be "same year" once the real Abu Dhabi data is silently
excluded. Fixed by matching on `eventName` instead, which is stable across the same dataset.
Verified before/after: Abu Dhabi 100% → 2.6%. This affects anything that ever reuses
`circuit_stats.py`'s circuit-matching, not just weather.

**Weather API key**: a real `WEATHER_API_KEY` (OpenWeatherMap) was added as a GitHub secret and
verified against the live API directly (Monaco, Mexico City, Las Vegas, Miami Gardens all
resolved correctly). One known, gracefully-handled limitation: "Yas Marina" (Abu Dhabi's location
string) 404s against OpenWeatherMap's geocoding — not a recognized city name — so Abu Dhabi's live
forecast always falls through to the historical fallback. Fails safe, not loudly; a
location-to-coordinates override table would fix it properly if it's ever worth the complexity.

**Step 4 — Monte Carlo simulator v1, shipped, a real multi-metric win.** `ml/simulate_race.py`:
samples race pace (predicted pace + Gaussian noise, stdev = the Pace model's own real backtest
residual stdev, 2.2s — not a guess), samples DNF per driver from `ml/predict_dnf.py`, samples
safety-car occurrence from the global historical rate but gives it **no effect on finishing order
yet** — an explicit, documented v1 assumption, not an invented mechanic with no data behind it (see
`ml/circuit_stats.py`'s Step 1 finding for why inventing an SC-effect size would be exactly the
kind of unjustified assumption this project has avoided elsewhere). Runs 10,000× per race, producing
a full finish-position probability distribution per driver rather than one point estimate.

First verified on a 40-race sample, then re-validated on the **full 175-round set** (same
population the frozen Finish/Pole/Pace benchmarks use — the 40-race sample was inadvertently only
2018-2019, not a fair comparison against the frozen 3.453 Finish MAE):

| | MAE | Spearman |
|---|---|---|
| A: existing Finish model | 3.470 | 0.640 |
| B: grid + predicted pace | 3.531 | 0.631 |
| **C: simulator (median position)** | **3.071** | **0.693** |

Finish RF's 3.470 here closely matches the frozen 3.453 (small residual difference is normal
run-to-run noise), confirming this is now a fair comparison — and the simulator's advantage
*widened* on the full set (0.31 → 0.40 MAE gap), not a smaller-sample fluke. The first pass used
the *mean* of each driver's simulated position, which came out worse than both baselines — MAE is
minimized by the median, not the mean; that was a methodology bug in how the point estimate was
extracted, not a real flaw in the simulator. Switching to median flipped the result to a clear win.

Aggregate probability calibration also beats a naive uniform baseline on Brier score: P1 0.0414
vs 0.0473 naive, podium 0.096 vs 0.127 naive. **But bucketed calibration (predicted probability vs
actual outcome rate) is honestly not good yet** — the model is systematically under-confident
about genuine contenders (drivers given a 30-40% predicted podium chance actually podiumed 70% of
the time in that bucket), while roughly right for longshots. Beating naive on *aggregate* Brier
doesn't mean the individual probabilities are trustworthy — a "Verstappen: 42% to win" product
claim built directly on these numbers would currently understate genuine favorites. Likely cause:
one global pace-noise stdev (2.20s) applied uniformly to every driver flattens the distribution
more than real skill gaps warrant.

## Simulator v1.1 — grid-bucket noise: fixed ranking further, did not fix calibration

Diagnosed before fixing, per the agreed order: computed Pace-model residual stdev by grid-position
bucket, twice — once on the full dataset, once on a 2018-2023-only held-out-safe split — and both
confirmed real heteroscedasticity (front-runner residual stdev ~0.9-1.0s, backmarker ~3.2-3.8s, a
3-4x spread). Replaced the single global 2.2s noise with grid-bucketed values estimated only from
2018-2023, explicitly to validate the fix on the genuinely-unseen 2024-2026 split rather than tune
against the same races used to evaluate it.

Result, reported honestly rather than declared a win:

| | MAE | Spearman | P1 Brier | Podium Brier |
|---|---|---|---|---|
| All 175 (Finish RF) | 3.470 | 0.640 | — | — |
| All 175, sim v1 (uniform noise) | 3.071 | 0.693 | 0.0414 (beats 0.0473 naive) | 0.096 (beats 0.127 naive) |
| All 175, sim v1.1 (grid-bucket noise) | **3.011** | **0.700** | 0.0495 (**worse** than 0.0473 naive) | 0.1217 (barely beats 0.127 naive) |
| Held-out 2024-2026, sim v1.1 | **2.653** | **0.755** | 0.0504 (worse than 0.0468 naive) | 0.1306 (**worse** than 0.1258 naive) |

MAE/Spearman improved further with v1.1, and that improvement **genuinely generalizes** — held-out
2024-2026 scores even better than the estimation years, so it's not overfitting to 2018-2023.
But **calibration got worse, not better**, on the metric the whole exercise was meant to fix: P1
Brier flipped from beating naive to losing to it, and held-out podium Brier also now loses to
naive. The bucketed calibration table shows why — the severe under-confidence for genuine
high-probability contenders (30-50%+ predicted podium buckets actually podium 63-100% of the time)
persists almost unchanged; heteroscedastic noise shifted *where* some of the miscalibration shows
up (the lowest bucket flipped from over- to under-predicted) without fixing the core problem.

**Conclusion**: the noise-heteroscedasticity hypothesis was real (independently confirmed twice)
and a genuine, validated ranking-accuracy improvement — but it is not sufficient by itself to fix
probability calibration. Something else is contributing to the miscalibration. Next candidate per
the original diagnostic plan: proper output recalibration (isotonic or Platt scaling, fit only on
past races), not further tuning of the input noise mechanism. Kept v1.1's noise change (real,
held-out-validated MAE/Spearman win) rather than reverting it, since it's net-positive on the
metrics it actually improved — calibration remains open, tracked separately.

## Step 4.2 — probability recalibration: podium fixed, P1 improved to parity

`ml/calibrate_probabilities.py` — Platt (logistic) and isotonic regression tested walk-forward on
the real simulator output (175 races), each calibrator fit only on the pooled (probability,
outcome) pairs from strictly-prior races, never the race being evaluated. Different winner per
target, not one universal answer:

| | raw (v1.1) | Platt | Isotonic |
|---|---|---|---|
| P1 Brier | 0.0494 | **0.0473** | 0.0473 |
| Podium Brier | 0.1221 | 0.1219 | **0.1185** |

**P1**: both methods land at exact parity with the naive base-rate baseline (0.0473) — a real fix
over raw's worse-than-naive number, but not a genuine edge beyond it. Checking why: P1 is rare
enough (~1/20 by definition) that there isn't much separable signal left to calibrate toward once
properly corrected. Uses Platt as the simpler, lower-variance choice since isotonic offers no
advantage here.

**Podium**: isotonic clearly wins, and — checking the reliability curve rather than trusting
aggregate Brier alone, per instruction — it's for the right reason. The exact bucket that was
worst before is the one it fixes: 30-40% predicted → 65.1% actual now corrects to 72.3% (was
33.8%); 40-50% predicted → 100% actual now corrects to 93.4% (was 44.3%). That's the real,
high-probability-contender miscalibration this whole investigation was chasing. Cost: isotonic
gets slightly noisier at the low end (0-10% bucket moves a bit further from truth) — a real,
smaller tradeoff, not free.

MAE/Spearman are unaffected by design — recalibration only touches the P1/podium probability
*values*, not the underlying position-ranking mechanism (median position, computed from the full
per-position probability array), confirming the conceptual separation between "is the ranking
correct" and "are the probabilities correct" holds cleanly in this architecture.

**Verdict**: partial, honest success. Podium — the more product-relevant metric — is genuinely
fixed. P1 is improved but not clearly better than just guessing the base rate; there may not be
much more to extract for that specific target with current inputs.

**Not yet done**: tyre strategy, traffic, pit strategy remain explicitly out of scope. A live
consumer for the calibrators (fitting incrementally as new races complete, mirroring every other
walk-forward feature in this pipeline) doesn't exist yet either, since there's still no product
surface consuming the simulator's output at all.
