-- F1-Hub: Firestore -> Supabase Postgres schema
-- Maps every real collection currently in use (verified against src/lib/firestore/*.ts,
-- src/lib/types/race.ts, and pipeline/*.py `.collection(...)` calls):
--   races, archive_races (+laps subcollection), archive_circuits, archive_drivers,
--   archive_teams, calendar, modelBenchmarks, users (+picks subcollection)
--
-- Normalized where rows get joined/filtered/queried (results, inputs, tire stints, picks).
-- Kept as jsonb where it's an opaque ML output blob nobody ever queries a field out of
-- individually (prediction/polePrediction/simulation/weather) — no point normalizing those.

-- ============================================================= current-season races (FastF1)

create table races (
  id text primary key,                 -- keep existing `${year}_r${round}_{slug}` ids, no remap needed
  year int not null,
  round int not null,
  name text not null,
  circuit text not null,                -- FastF1's raw location string, e.g. "Budapest"
  status text not null check (status in ('upcoming', 'completed', 'scheduled')),
  race_date date,
  pole_sitter text,
  pole_time_sec numeric,
  weather jsonb,                        -- SessionWeather
  prediction jsonb,                     -- RacePrediction (frozen once qualifying exists)
  pole_prediction jsonb,                -- PolePrediction (recomputed pre-quali, then frozen)
  simulation jsonb,                     -- RaceSimulation
  updated_at timestamptz not null default now()
);
create index races_year_round_idx on races (year, round);

create table race_results (
  race_id text not null references races (id) on delete cascade,
  driver text not null,                 -- 3-letter FastF1 code
  driver_name text not null,
  team text not null,
  grid int,
  finish_position int not null,
  finish_gap_sec numeric,
  status text not null check (status in ('finished', 'lapped', 'dnf')),
  fastest_lap_sec numeric,
  points numeric not null default 0,
  primary key (race_id, driver)
);

create table race_inputs (
  race_id text not null references races (id) on delete cascade,
  driver text not null,
  driver_name text not null,
  team text not null,
  grid int not null,
  qualifying_gap_sec numeric,
  primary key (race_id, driver)
);

create table tire_stints (
  race_id text not null references races (id) on delete cascade,
  driver text not null,
  stint_number int not null,
  compound text not null,
  lap_count int not null,
  primary key (race_id, driver, stint_number)
);

-- ============================================================= calendar (pre-FastF1 placeholders)

create table calendar (
  id text primary key,
  year int not null,
  round int not null,
  name text,
  circuit text,
  race_date date,
  status text
);

-- ============================================================= archive (pre-2018, Ergast/Jolpi)

create table archive_races (
  id text primary key,                  -- `${year}_r${round}_{slug}`, same convention as races
  year int not null,
  round int not null,
  race_name text not null,
  circuit_name text,
  locality text,
  country text,
  race_date date,
  laps_backfilled boolean not null default false
);
create index archive_races_year_idx on archive_races (year);
create index archive_races_circuit_name_idx on archive_races (circuit_name);

create table archive_results (
  archive_race_id text not null references archive_races (id) on delete cascade,
  driver_id text not null,
  position int,
  position_text text,
  grid int,
  laps int,
  status text,
  points numeric,
  driver_name text not null,
  constructor text,
  primary key (archive_race_id, driver_id)
);

create table archive_laps (
  archive_race_id text not null references archive_races (id) on delete cascade,
  lap_number int not null,
  driver_id text not null,
  position int,
  time_ms bigint,
  primary key (archive_race_id, lap_number, driver_id)
);

create table archive_circuits (
  circuit_name text primary key,
  country text,
  locality text,
  first_year int,
  last_year int,
  race_count int
  -- add wiki_image_url etc. once confirmed against the live CircuitStats/ArchiveCircuit type
);

create table archive_drivers (
  driver_id text primary key,
  name text not null,
  code text,
  first_year int,
  last_year int,
  race_count int
);

create table archive_teams (
  team_id text primary key,
  name text not null,
  first_year int,
  last_year int,
  race_count int
);

-- ============================================================= ML benchmarks

create table model_benchmarks (
  id text primary key,
  model text not null,                  -- 'finish' | 'pace' | 'pole' | 'simulator'
  generated_at timestamptz not null,
  metrics jsonb not null
);

-- ============================================================= OTP (custom email-code gate)

-- The custom "enter the 6-digit code we emailed you" step this app runs on top of password/OAuth
-- sign-in (src/lib/otp.ts) — was Firestore's `otp_codes` collection, missed on the first pass
-- through this file since that collection name is only ever referenced via a variable
-- (`adminDb.collection(COLLECTION)`), not a string literal a straightforward grep would catch.
create table otp_codes (
  email text primary key,
  code text not null,
  expires_at timestamptz not null,
  sent_at timestamptz not null,
  attempts int not null default 0,
  verified boolean not null default false,
  verified_at timestamptz
);

-- ============================================================= users (now auth-linked)

-- Supabase Auth owns auth.users; this is the app's profile row, one-to-one with it.
-- Create each Supabase auth user with user_id = the existing Firebase uid (admin API supports
-- a caller-supplied UUID) so this FK never needs remapping and picks.user_id stays valid as-is.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  role text check (role in ('admin', 'moderator')),
  first_name text,
  last_name text,
  username text unique,
  favorite_drivers text[] not null default '{}',
  favorite_teams text[] not null default '{}',
  favorite_tracks text[] not null default '{}',
  notify_before_qualifying boolean not null default false,
  notify_on_results boolean not null default false,
  created_at timestamptz not null default now()
);

create table picks (
  user_id uuid not null references profiles (id) on delete cascade,
  race_id text not null references races (id) on delete cascade,
  predicted_winner text not null,
  predicted_podium text[] not null,     -- length-3 array: [p1, p2, p3]
  submitted_at timestamptz not null default now(),
  primary key (user_id, race_id)
);

-- RLS: a user can only read/write their own profile + picks. Enable once Auth is wired up.
alter table profiles enable row level security;
alter table picks enable row level security;
create policy "own profile" on profiles for all using (auth.uid() = id);
create policy "own picks" on picks for all using (auth.uid() = user_id);

-- Everything else (races, archive_*, calendar, model_benchmarks) is public read, service-role
-- write only — same trust model as today (Firestore rules already forbid client writes to these).
alter table races enable row level security;
create policy "public read" on races for select using (true);
-- (repeat "public read" policies for race_results, race_inputs, tire_stints, archive_*, calendar,
--  model_benchmarks — omitted here for brevity, same one-liner each)

-- ============================================================= groups

-- Deliberately no separate group_picks table: a member's prediction is their existing row in
-- `picks` above (one pick per user per race, same as today) — a group's feed of "who picked
-- what" is a join (group_members -> picks), not duplicated storage. This section adds exactly
-- what `picks` doesn't already cover: group identity, membership + role, and — once a race
-- finishes — the computed outcome (who won the prediction, how close everyone was).
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar_url text,                      -- Supabase Storage url, once Storage is wired up (later phase)
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create table group_members (
  group_id uuid not null references groups (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
-- App-level convention, not a trigger: creating a group inserts the creator's own group_members
-- row with role='admin' in the same transaction. Simple enough for one paired insert that it's
-- not worth procedural SQL for.

-- One row per (group, race, member), written once that race's actual result is known. `score`/
-- `rank` are whatever the eventual scoring formula produces (exact winner, podium overlap, etc. —
-- not decided yet, deliberately not hardcoded into column names so the formula can change without
-- a schema migration); `breakdown` holds the human-readable "why" (e.g.
-- {"winner_correct": true, "podium_matches": 2}). rank = 1 is the group's winner for that race.
-- What they actually predicted isn't duplicated here — join (user_id, race_id) back to `picks`.
-- Only meaningful from when a member actually joined onward: filter race_date >= that member's
-- group_members.joined_at at query time, nothing extra needs storing for that.
create table group_race_scores (
  group_id uuid not null references groups (id) on delete cascade,
  race_id text not null references races (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  score numeric not null,
  rank int not null,
  breakdown jsonb,
  computed_at timestamptz not null default now(),
  primary key (group_id, race_id, user_id)
);

alter table groups enable row level security;
alter table group_members enable row level security;
alter table group_race_scores enable row level security;
-- Select-only policies for now — a user can see a group, its membership, and its scoreboard only
-- if they're actually a member. Renaming a group, changing its avatar, promoting/removing a
-- member: no policy yet, deliberately, since that UI doesn't exist yet either. Noting that here
-- so it reads as "not built yet" rather than "forgotten" next time this file is read.
create policy "members can view their groups" on groups for select
  using (id in (select group_id from group_members where user_id = auth.uid()));
create policy "members can view group membership" on group_members for select
  using (group_id in (select group_id from group_members where user_id = auth.uid()));
create policy "members can view their group's scores" on group_race_scores for select
  using (group_id in (select group_id from group_members where user_id = auth.uid()));
create policy "creating a group" on groups for insert with check (auth.uid() = created_by);
create policy "joining a group" on group_members for insert with check (auth.uid() = user_id);
