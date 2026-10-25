-- One-off data fix (NOT run automatically): the 2026 Bahrain Grand Prix was run at Sepang, but FastF1's "Country"
-- is the event's nominal host, so the stored rows read "Kuala Lumpur, Bahrain". race_identity.VENUE_COUNTRY now
-- stores "Malaysia" on every future write; this corrects the rows already written.
--
-- Run by hand against production after review:  psql "$DATABASE_URL" -f pipeline/sql/fix_2026_bahrain_country.sql
-- then bust the races cache (POST /api/admin/revalidate, tag "races") or wait for the next pipeline run.
begin;

update races
   set country = 'Malaysia'
 where year = 2026 and name = 'Bahrain Grand Prix' and circuit = 'Kuala Lumpur' and country = 'Bahrain';

update calendar
   set country = 'Malaysia'
 where year = 2026 and name = 'Bahrain Grand Prix' and circuit = 'Kuala Lumpur' and country = 'Bahrain';

-- Expect one row each.
select 'races' as tbl, id, circuit, country from races where year = 2026 and name = 'Bahrain Grand Prix'
union all
select 'calendar', id, circuit, country from calendar where year = 2026 and name = 'Bahrain Grand Prix';

commit;
