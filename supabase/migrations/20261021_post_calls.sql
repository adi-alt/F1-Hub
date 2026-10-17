-- Takes with receipts (Communities): a post can carry one "call" about a race weekend - "Norris wins", "pole for
-- Verstappen", "Leclerc beats Hamilton", "at least one safety car" - which the app grades against the official result
-- once the pipeline has stored it (src/lib/postCalls.ts grades on read; no verdict is stored here, so a corrected
-- classification re-grades by itself). A call locks when its session starts (locks_at, taken from the calendar when
-- the post is made); the server refuses one made later.
--
-- Written and read only by the server (the service-role client), like ai_cache and otp_codes: row level security on,
-- no client policies, no client grants. New objects only - nothing that exists today changes.

set local lock_timeout = '5s';

create table if not exists public.post_calls (
  post_id uuid primary key references public.group_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  race_id text not null,
  kind text not null check (kind in ('winner', 'podium', 'pole', 'fastest_lap', 'beats_teammate', 'safety_car', 'retirements')),
  driver text check (driver is null or driver ~ '^[A-Z]{3}$'),
  rival text check (rival is null or rival ~ '^[A-Z]{3}$'),
  threshold smallint check (threshold is null or threshold between 1 and 20),
  locks_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists post_calls_user_idx on public.post_calls (user_id, race_id);
create index if not exists post_calls_race_idx on public.post_calls (race_id);

alter table public.post_calls enable row level security;
revoke all on public.post_calls from anon, authenticated;
grant all on public.post_calls to service_role;
