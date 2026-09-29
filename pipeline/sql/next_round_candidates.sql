-- Rounds of one season that fetch_races.next_relevant_round() may fetch, earliest first.
-- Parameter: year (psycopg2 named style). Kept in its own file so this exact text can be run against
-- the real schema by a database test (not part of this change) as well as by fetch_races.py.
--
-- Identity is (year, event slug), the id minus its "{year}_r{round}_" prefix, not (year, round):
-- a renumbered event is still the same race.
--
-- 1. Every live calendar event (not cancelled) that is not yet completed with an official
--    result, whether or not a races row exists yet. Before this, only rounds that already had a
--    races row were candidates, so a round's first fetch never happened (audit finding DATA-01).
-- 2. Every unfinished races row with no calendar event at all (sync_calendar.py has not reached
--    it): fetched anyway, as before. A races row whose calendar event was cancelled is not.
with cal as (
  select c.round, c.sessions, c.race_date::text as race_date, regexp_replace(c.id, '^[0-9]{4}_r[0-9]+_', '') as slug
    from calendar c
   where c.year = %(year)s and c.status is distinct from 'cancelled'
),
rc as (
  select r.round, r.status, r.results_source, regexp_replace(r.id, '^[0-9]{4}_r[0-9]+_', '') as slug
    from races r
   where r.year = %(year)s
)
select cal.round, cal.sessions, cal.race_date, 'calendar' as source
  from cal
  left join rc on rc.slug = cal.slug
 where rc.slug is null
    or rc.status is distinct from 'completed'
    or rc.results_source = 'openf1_preliminary'
union all
select rc.round, null, null, 'races'
  from rc
 where (rc.status is distinct from 'completed' or rc.results_source = 'openf1_preliminary')
   and not exists (select 1 from calendar c where c.year = %(year)s and regexp_replace(c.id, '^[0-9]{4}_r[0-9]+_', '') = rc.slug)
order by 1, 4
