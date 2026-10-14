-- Sprint classifications for past seasons (the archive). archive_results holds Grand Prix results only, so every
-- archive season since sprints began (2021) has been missing its sprint points: checked against Jolpica's official
-- standings, 18 points in 2021, 108 in 2022 and 216 in each of 2023, 2024 and 2025 - exactly the sprint totals.
--
-- Same columns and rules as archive_results, so a sprint row reads like a race row. Points count towards both
-- championships; wins and podiums stay Grand Prix only, as F1 counts them. Filled by
-- pipeline/backfill_archive_sprints.py from Jolpica's official classifications.
--
-- Public read like every other archive table (see 20260929_rls_lockdown.sql); written only by the pipeline, which
-- connects as the owner. New objects only - nothing that exists today changes.

set local lock_timeout = '5s';

create table if not exists public.archive_sprint_results (
  archive_race_id text not null references public.archive_races (id) on delete cascade,
  driver_id text not null,
  position int check (position is null or position > 0),
  position_text text,
  grid int,
  laps int,
  status text,
  points numeric not null default 0 check (points >= 0 and points <> 'NaN'::numeric),
  driver_name text not null,
  constructor text,
  team_id text references public.archive_teams (team_id),
  time text,
  driver_code text,
  primary key (archive_race_id, driver_id)
);
create index if not exists archive_sprint_results_driver_idx on public.archive_sprint_results (driver_id);
create index if not exists archive_sprint_results_team_idx on public.archive_sprint_results (team_id);

alter table public.archive_sprint_results enable row level security;
drop policy if exists "public read" on public.archive_sprint_results;
create policy "public read" on public.archive_sprint_results for select using (true);
revoke insert, update, delete, truncate on public.archive_sprint_results from anon, authenticated;
grant select on public.archive_sprint_results to anon, authenticated;
