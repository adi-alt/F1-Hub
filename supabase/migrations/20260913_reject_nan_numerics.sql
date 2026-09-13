-- Postgres `numeric` accepts NaN, and `not null` does nothing to stop it. PostgREST then serialises
-- that value as the JSON *string* "NaN", which lands in a field TypeScript declares as `number` -
-- so `driver.points += result.points` in src/lib/standings.ts silently becomes string
-- concatenation and every championship total in the season reads "241.0NaN". It sorts as NaN, and
-- `points > 0` is false, so the standings order and the progression chart both quietly collapse.
--
-- This happened for real: 2026 round 14 was written from a FastF1 frame that had live-timing
-- positions but no published classification yet, so `Points` was NaN for all 22 drivers (fixed at
-- source in pipeline/fetch_races.py's has_official_classification(), this is the backstop).
--
-- For `numeric`, Postgres defines NaN = NaN as true, so `<> 'NaN'` is a correct, index-friendly
-- rejection - it is not the float-comparison trap the same expression would be on `double
-- precision`. Every numeric column the race pipeline writes from a pandas float is covered, not
-- just the one that failed, since they all reach the database by the same route.

-- Safety net for any environment that still carries the corrupt rows. Zero is not a guess about
-- what those drivers scored - it is the only value that lets the constraint below go on, and the
-- round it affects is re-fetched from a real source as part of this fix, which overwrites it with
-- the actual points. In the environment this was written against the row count here is already 0.
update race_results set points = 0 where points = 'NaN'::numeric;

alter table race_results add constraint race_results_points_not_nan
  check (points <> 'NaN'::numeric);
alter table race_results add constraint race_results_finish_gap_not_nan
  check (finish_gap_sec is null or finish_gap_sec <> 'NaN'::numeric);
alter table race_results add constraint race_results_fastest_lap_not_nan
  check (fastest_lap_sec is null or fastest_lap_sec <> 'NaN'::numeric);
alter table race_inputs add constraint race_inputs_qualifying_gap_not_nan
  check (qualifying_gap_sec is null or qualifying_gap_sec <> 'NaN'::numeric);
alter table races add constraint races_pole_time_not_nan
  check (pole_time_sec is null or pole_time_sec <> 'NaN'::numeric);
alter table archive_results add constraint archive_results_points_not_nan
  check (points is null or points <> 'NaN'::numeric);
alter table archive_pit_stops add constraint archive_pit_stops_duration_not_nan
  check (duration_sec is null or duration_sec <> 'NaN'::numeric);
