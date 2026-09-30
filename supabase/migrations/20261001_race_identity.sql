-- Race identity: one row per event per season, in both `races` and `calendar`, enforced by the
-- database rather than only by the pipeline (pipeline/race_identity.py).
--
-- A race's identity is (year, event slug) - the id minus its "{year}_r{round}_" prefix. The round
-- is an attribute: upstream renumbers every later round when an event is cancelled, and the
-- pipeline keeps the event's original id (its picks and prediction rounds reference it) while
-- writing the new round. sync_calendar.py marks an event that has left the schedule `cancelled`
-- instead of deleting it, so calendar uniqueness applies to live (not cancelled) rows only.
--
-- Safe to re-run. It changes no data. If existing rows already violate a rule, the migration stops
-- with the offending ids BEFORE creating anything, so nothing is half-applied (a read-only precheck
-- against the live project on 2026-09-29 found no violations). Deploy with or after the pipeline
-- change: the old pipeline never produces a violation either, but concurrent old runs are exactly
-- what these indexes exist to stop.

-- 1. The slug of a race/calendar id; ids of any other shape map to themselves.
create or replace function public.race_slug(p_id text) returns text
language sql immutable parallel safe set search_path = public, pg_temp as $$
  select regexp_replace(p_id, '^[0-9]{4}_r[0-9]+_', '')
$$;

-- 2. Guard: report existing duplicates instead of failing halfway through index creation.
do $$
declare
  v_problems text;
begin
  select string_agg(problem, E'\n') into v_problems from (
    select format('races (year %s, round %s): %s', year, round, string_agg(id, ', ')) as problem
      from public.races group by year, round having count(*) > 1
    union all
    select format('races (year %s, event %s): %s', year, public.race_slug(id), string_agg(id, ', '))
      from public.races group by year, public.race_slug(id) having count(*) > 1
    union all
    select format('calendar live (year %s, round %s): %s', year, round, string_agg(id, ', '))
      from public.calendar where status is distinct from 'cancelled' group by year, round having count(*) > 1
    union all
    select format('calendar live (year %s, event %s): %s', year, public.race_slug(id), string_agg(id, ', '))
      from public.calendar where status is distinct from 'cancelled' group by year, public.race_slug(id) having count(*) > 1
  ) p;
  if v_problems is not null then
    raise exception 'race identity migration: duplicate rows must be resolved by hand first:%', E'\n' || v_problems;
  end if;
end $$;

-- 3. The rules. Concurrent or repeated pipeline runs can now only ever converge on one row.
create unique index if not exists races_year_round_key on public.races (year, round);
create unique index if not exists races_year_event_key on public.races (year, public.race_slug(id));
create unique index if not exists calendar_live_year_round_key on public.calendar (year, round)
  where status is distinct from 'cancelled';
create unique index if not exists calendar_live_year_event_key on public.calendar (year, public.race_slug(id))
  where status is distinct from 'cancelled';

-- 4. Lock times read the event's own live calendar row. Replaces the 20260930_prediction_lifecycle
--    versions (same signatures, same rules), which matched `c.id = r.id or (year, round)` and could
--    pick a cancelled row, or another event's row after a renumbering. Preference, per race:
--    a live row over a cancelled one; then the same id, then the same event, then the same round.
--    Kept in step with LOCK_TIMES_CTE in scripts/lib/predictionAudit.mjs (a test compares them).
create or replace function public.race_calendar_sessions(p_race_id text) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select c.sessions
    from public.races r
    join public.calendar c
      on c.year = r.year and (c.id = r.id or public.race_slug(c.id) = public.race_slug(r.id) or c.round = r.round)
   where r.id = p_race_id
   order by (c.status is distinct from 'cancelled') desc,
            (c.id = r.id) desc,
            (public.race_slug(c.id) = public.race_slug(r.id)) desc
   limit 1
$$;

create or replace function public.prediction_lock_at(p_race_id text) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  with s as (
    select lower(e ->> 'label') as label, public.parse_session_ts(e ->> 'date') as ts
      from (select public.race_calendar_sessions(p_race_id) as sessions) cal,
           jsonb_array_elements(case when jsonb_typeof(cal.sessions) = 'array' then cal.sessions else '[]'::jsonb end) e
  )
  select min(ts) from s
   where label like '%qualif%' and label not like '%sprint%' and label not like '%shootout%'
$$;

create or replace function public.race_start_at(p_race_id text) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select min(public.parse_session_ts(e ->> 'date'))
    from (select public.race_calendar_sessions(p_race_id) as sessions) cal,
         jsonb_array_elements(case when jsonb_typeof(cal.sessions) = 'array' then cal.sessions else '[]'::jsonb end) e
   where lower(e ->> 'label') = 'race'
$$;

-- The schedule lookup is server-only, like the lock-time functions that use it (their existing
-- grants survive `create or replace`). race_slug keeps default privileges: it is a pure string
-- function, and it is evaluated by every write to the two indexed tables.
revoke all on function public.race_calendar_sessions(text) from public, anon, authenticated;
grant execute on function public.race_calendar_sessions(text) to service_role;
