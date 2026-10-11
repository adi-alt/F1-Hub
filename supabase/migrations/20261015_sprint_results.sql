-- Sprint classifications (audit R-17). The championship standings summed Grand Prix points only,
-- so every 2026 sprint was missing from them: 180 points across 12 drivers after round 15, checked
-- against Jolpica's official standings.
--
-- Same shape and rules as race_results. Public read like every other race table (see the "public
-- read" policies in 20260929_rls_lockdown.sql); written only by the pipeline, which connects as the
-- owner. New objects only - nothing that exists today changes.

set local lock_timeout = '5s';

create table if not exists public.sprint_results (
  race_id text not null references public.races (id) on delete cascade,
  driver text not null,                 -- 3-letter code
  driver_name text not null,
  team text not null,
  grid int,
  finish_position int not null,
  finish_gap_sec numeric check (finish_gap_sec is null or finish_gap_sec <> 'NaN'::numeric),
  status text not null check (status in ('finished', 'lapped', 'dnf')),
  points numeric not null default 0 check (points <> 'NaN'::numeric),
  -- 'official' when FastF1 or Jolpica classified it; 'openf1_preliminary' until the official
  -- classification is published (fetch_races.py then replaces it).
  source text not null default 'official' check (source in ('official', 'openf1_preliminary')),
  primary key (race_id, driver)
);

alter table public.sprint_results enable row level security;
drop policy if exists "public read" on public.sprint_results;
create policy "public read" on public.sprint_results for select using (true);
revoke insert, update, delete, truncate on public.sprint_results from anon, authenticated;
grant select on public.sprint_results to anon, authenticated;
