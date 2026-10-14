-- Narrows when the fetch workflow is started (20261017): per session, and only until that session's data is stored.
--
-- For every session of a weekend (practice, sprint qualifying, sprint, qualifying, race), with its end taken as its
-- start plus its usual length:
--   - every 15 minutes from its start until 2 hours after it ends;
--   - then hourly (the first tick of each hour) until 24 hours after it ends;
--   - then never.
-- And never once the session's data is stored in final form: practice in races.practice; sprint qualifying in
-- qualifying_results (OpenF1 is its only source); the sprint, qualifying and the race only once their OFFICIAL
-- classification is stored - a preliminary OpenF1 result keeps checking until the official one arrives.
--
-- The daily 21-day re-check from 20261017 is gone: amended classifications are now caught by GitHub's own schedule
-- (best effort), whose runs still re-check the last 21 days (fetch_races.recheck_amended_classifications).

set local lock_timeout = '5s';

create or replace function public.fetch_races_due(at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  with sessions as (
    select
      c.id,
      s->>'label' as label,
      (s->>'date')::timestamp at time zone 'UTC' as starts
    from public.calendar c
    cross join lateral jsonb_array_elements(coalesce(c.sessions, '[]'::jsonb)) s
    where c.status is distinct from 'cancelled'
      and s->>'date' is not null
  ),
  timed as (
    select
      id,
      label,
      starts,
      starts + case
        when label = 'Race' then interval '2 hours'
        when label in ('Sprint', 'Sprint Qualifying', 'Sprint Shootout') then interval '45 minutes'
        else interval '1 hour'
      end as ends
    from sessions
  ),
  pending as (
    select t.*
    from timed t
    left join public.races r on r.id = t.id
    where not case
      when t.label in ('Practice 1', 'Practice 2', 'Practice 3') then
        coalesce(r.practice ? ('FP' || right(t.label, 1)), false)
      when t.label in ('Sprint Qualifying', 'Sprint Shootout') then
        exists (select 1 from public.qualifying_results q where q.race_id = t.id and q.session = 'SQ')
      when t.label = 'Sprint' then
        exists (select 1 from public.sprint_results x where x.race_id = t.id)
        and not exists (select 1 from public.sprint_results x where x.race_id = t.id and x.source <> 'official')
      when t.label = 'Qualifying' then
        exists (select 1 from public.qualifying_results q where q.race_id = t.id and q.session = 'Q')
        and not exists (select 1 from public.qualifying_results q where q.race_id = t.id and q.session = 'Q' and q.source <> 'official')
      when t.label = 'Race' then
        coalesce(r.status = 'completed' and r.results_source = 'official', false)
      else true -- a session this pipeline doesn't fetch: never a reason to run
    end
  )
  select
    exists (select 1 from pending where at >= starts and at < ends + interval '2 hours')
    or (extract(minute from at) < 15 and exists (select 1 from pending where at >= ends + interval '2 hours' and at < ends + interval '24 hours'));
$$;

revoke all on function public.fetch_races_due(timestamptz) from public, anon, authenticated;
