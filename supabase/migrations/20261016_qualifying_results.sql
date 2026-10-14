-- Full qualifying classifications, stage by stage: Grand Prix qualifying (Q1/Q2/Q3) and sprint qualifying
-- (SQ1/SQ2/SQ3), one row per driver per session. Until now a round kept only the qualifying position and one "gap
-- to pole" per driver (race_inputs), built from whichever stage the driver last reached - so the stage times, who
-- went out where, and sprint qualifying were all lost. Written by pipeline/qualifying_sessions.py.
--
-- Qualifying position is NOT the starting grid: penalties can move a car after qualifying. The grid stays where it
-- is (race_results.grid, from the official race classification); nothing here replaces it.
--
-- Public read like every other race table (see 20260929_rls_lockdown.sql); written only by the pipeline, which
-- connects as the owner. New objects only - nothing that exists today changes.

set local lock_timeout = '5s';

create table if not exists public.qualifying_results (
  race_id text not null references public.races (id) on delete cascade,
  -- 'Q' Grand Prix qualifying, 'SQ' sprint qualifying. A text code, not an enum, so a future format adds a value
  -- with one constraint change.
  session text not null check (session in ('Q', 'SQ')),
  driver text not null,                 -- 3-letter code
  driver_name text not null,
  team text not null,
  position int check (position is null or position > 0),
  -- Each stage's best valid lap, seconds. Null when the driver didn't reach that stage or set no valid lap in it.
  stage1_sec numeric check (stage1_sec is null or (stage1_sec > 0 and stage1_sec <> 'NaN'::numeric)),
  stage2_sec numeric check (stage2_sec is null or (stage2_sec > 0 and stage2_sec <> 'NaN'::numeric)),
  stage3_sec numeric check (stage3_sec is null or (stage3_sec > 0 and stage3_sec <> 'NaN'::numeric)),
  stage_reached smallint not null check (stage_reached between 1 and 3),
  status text not null default 'classified' check (status in ('classified', 'no_time', 'dns', 'dsq')),
  -- 'official': the FIA classification (Jolpica). 'openf1': F1's timing feed via OpenF1 - right after the session
  -- for Grand Prix qualifying (replaced once official), and the only source for sprint qualifying.
  source text not null check (source in ('official', 'openf1')),
  primary key (race_id, session, driver)
);

alter table public.qualifying_results enable row level security;
drop policy if exists "public read" on public.qualifying_results;
create policy "public read" on public.qualifying_results for select using (true);
revoke insert, update, delete, truncate on public.qualifying_results from anon, authenticated;
grant select on public.qualifying_results to anon, authenticated;
