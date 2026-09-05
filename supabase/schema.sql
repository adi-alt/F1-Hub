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
  country text,
  status text not null check (status in ('upcoming', 'completed', 'scheduled')),
  race_date date,
  pole_sitter text,
  pole_time_sec numeric,
  weather jsonb,                        -- SessionWeather
  prediction jsonb,                     -- RacePrediction (frozen once qualifying exists)
  pole_prediction jsonb,                -- PolePrediction (recomputed pre-quali, then frozen)
  simulation jsonb,                     -- RaceSimulation
  -- ML-feature-only, never read by the app's own RaceDoc type (fetch_races.py writes these,
  -- train_predict.py/ml/*.py read them straight back for pole/pace features - the frontend never
  -- needed them, which is exactly how this got missed on the first schema pass). jsonb since
  -- nothing ever queries a single field out of these individually.
  practice jsonb,                       -- {FP1?/FP2?/FP3?: {bestLaps, weather}}
  traffic_stats jsonb,                  -- [{driver, avgGapAheadSec, pctLapsCloseBehind}] - written, not consumed by a model yet
  safety_car_periods int,
  tire_compound_pace jsonb,             -- [{driver, compound, lapCount, avgPaceDeltaSec, degradationSecPerLap}]
  photo_url text,                       -- legacy single photo, superseded by photo_urls below -
                                         -- kept populated (= photo_urls[0]) for anything still
                                         -- reading it, not written to directly anymore
  photo_urls text[],                    -- real photos (Wikimedia Commons category, not a circuit
                                         -- diagram - see ergast_utils.py's fetch_commons_photos),
                                         -- re-hosted in Storage, up to a handful per race - the
                                         -- homepage's rotating background draws from this
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

-- Live-season equivalent of archive_laps below - same shape (lap_number/driver/position/time),
-- same reason it's its own table rather than a field on `races` (a full race's worth of per-driver
-- per-lap rows, not a handful of summary fields). The data source differs though: FastF1's own
-- `session.laps` (already loaded by fetch_races.py's fetch_race() for fastest-lap/tyre-stint/
-- traffic-stat purposes - this just persists the Position column that pass already reads and
-- otherwise discards), not a separate paginated Ergast fetch. No `laps_backfilled`-style flag
-- needed - unlike the archive backfill (14 paginated requests per race), this is one already-loaded
-- DataFrame column, cheap enough that fetch_races.py's own backfill_race_laps() just checks "does
-- this completed race already have race_laps rows" directly.
create table race_laps (
  race_id text not null references races (id) on delete cascade,
  lap_number int not null,
  driver text not null,          -- 3-letter FastF1 code, matches race_results.driver
  position int,
  time text,                     -- display string ("1:23.456"), same convention as archive_laps.time
  primary key (race_id, lap_number, driver)
);

-- Current-roster only (not cross-season history like archive_drivers/archive_teams) - one row per
-- driver/team currently racing, overwritten in place every fetch_races.py run rather than
-- versioned, since "what does this driver look like right now" has no meaningful history to keep.
-- driver code is the same 3-letter FastF1 `Abbreviation` race_results.driver already uses, so this
-- joins onto every existing table with zero new lookup logic; team name is the same free-text
-- `TeamName` string race_results.team/race_inputs.team already store (no separate id/slug - this
-- table exists to hang a logo off that same string, not to normalize it).
--
-- *_url columns below are always a Supabase Storage `media` bucket URL, never a hotlinked external
-- one - fetch_races.py/fetch_team_logos.py download the source image (F1's own media CDN,
-- Wikipedia) and re-upload it, same reasoning group avatars already established: an external host
-- can rate-limit, add hotlink protection, reorganize its URL scheme, or disappear, and this app
-- would rather own a copy than find out live. It's also what makes a single next.config.ts
-- remotePatterns entry (Storage's own host) cover every image in the app, instead of allow-listing
-- media.formula1.com/upload.wikimedia.org/etc. individually.
create table drivers (
  code text primary key,
  name text not null,
  team text not null,
  headshot_url text,
  updated_at timestamptz not null default now()
);

create table teams (
  name text primary key,
  color text,                           -- FastF1's TeamColor, hex without '#' - already fetched
                                         -- per-race, never stored until now
  logo_url text,
  updated_at timestamptz not null default now()
);

-- One bucket, path-prefixed (drivers/{code}.png, teams/{slug}.png, circuits/{circuit_id}.png)
-- rather than one bucket per media type - same trust model as group-avatars (public, uploaded only
-- via supabaseAdmin/the pipeline's service-role key, never written to by a browser), just shared
-- since none of these need a different size cap or a different set of allowed types. 10MB, not
-- 5MB: found live that Wikipedia's own lead image for one circuit (Pescara) is a 7MB PNG -
-- some circuit diagrams are genuinely that large, this isn't a mistake to clamp down on.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760, array['image/png', 'image/jpeg', 'image/webp']);

-- ============================================================= calendar (pre-FastF1 placeholders)

create table calendar (
  id text primary key,
  year int not null,
  round int not null,
  name text,
  circuit text,
  country text,
  event_format text,                    -- "conventional" | "sprint_qualifying" | ...
  sessions jsonb,                        -- [{label, date}] - whatever this weekend format actually has
  weather_forecast jsonb,                -- written by weather_forecast.py, not consumed by a model yet
  race_date date,
  status text
);

-- ============================================================= archive (pre-2018, Ergast/Jolpi)

-- archive_circuits before archive_races: the latter's circuit_id references this. Kept minimal -
-- just the raw per-circuit doc (id/name/wiki/image/coords). raceCount/firstYear/lastYear/country/
-- locality are NOT columns here, on purpose: in the original Firestore model those were computed
-- at read time by scanning archive_races grouped by *circuit_name* (see the stats query below),
-- specifically because circuit_id only covers however much of the archive
-- enrich_archive_circuits.py has reached, while circuit_name has been on every race since the
-- very first backfill. Baking them into this table would silently narrow that coverage back down
-- to the enriched subset - keeping them as a query preserves the exact behavior this was for.
create table archive_circuits (
  circuit_id text primary key,
  name text,
  wikipedia_url text,
  image_url text,                       -- legacy single image, superseded by image_urls below
  image_urls text[],                    -- real photos of the circuit itself (Wikimedia Commons
                                         -- category off wikipedia_url's own title, not that page's
                                         -- infobox image - which is almost always the track-layout
                                         -- diagram, not a photo - see fetch_commons_photos)
  lat numeric,
  long numeric
);

-- Ahead of archive_races/archive_results too - both reference these (circuit_id, team_id), and a
-- forward reference to a table that doesn't exist yet is a DDL error regardless of deferrability
-- (deferrable only changes when a constraint is *checked*, not whether the table exists yet).
create table archive_drivers (
  driver_id text primary key,
  name text not null,
  code text,
  first_year int,
  last_year int,
  race_count int,
  constructors text[],                  -- every constructor name this driver's results ever carried
  date_of_birth date,                   -- Ergast's own get_driver_info(driver=driver_id) - same
                                         -- per-entity /results.description trick already used for
                                         -- circuits, not name-guessed (see fetch_archive_driver_media.py)
  wikipedia_url text,                   -- Ergast's own driverUrl for this driver_id
  photo_url text                        -- Supabase Storage url, re-hosted from wikipedia_url's lead image
);

create table archive_teams (
  team_id text primary key,
  name text not null,
  first_year int,
  last_year int,
  race_count int,
  drivers text[]                        -- every driver_id who's raced for this team
);

create table archive_races (
  id text primary key,                  -- `${year}_r${round}_{slug}`, same convention as races
  year int not null,
  round int not null,
  race_name text not null,
  circuit_name text,
  locality text,
  country text,
  race_date date,
  wikipedia_url text,                   -- this race's own report page, separate from the circuit's
  photo_url text,                       -- legacy single photo, superseded by photo_urls below
  photo_urls text[],                    -- real photos (Wikimedia Commons category, not the report
                                         -- page's own lead image, which is usually a circuit
                                         -- diagram - see ergast_utils.py's fetch_commons_photos),
                                         -- re-hosted in Storage - see enrich_archive.py's
                                         -- backfill_race_photos(); the archive-side half of "real
                                         -- photos per circuit" (the 2018+ half is races.photo_urls)
  weather jsonb,                        -- ArchiveWeather: raw WMO code + readings, opaque blob
  circuit_id text references archive_circuits (circuit_id),  -- null until that enrichment pass reaches this race
  laps_backfilled boolean not null default false,
  enriched_at timestamptz  -- set once enrich_archive.py has added qualifying/pit stops/wiki/fastest lap for this race
);
create index archive_races_year_idx on archive_races (year);
create index archive_races_circuit_name_idx on archive_races (circuit_name);
create index archive_races_circuit_id_idx on archive_races (circuit_id);

-- team_id is the resolved/canonicalized slug (see pipeline/enrich_archive_entities.py's
-- team_slug()) - `constructor` alone is just Ergast's display name for that era ("McLaren-Ford"),
-- not something you can safely group or join on across engine-supplier renames. Null until that
-- enrichment pass reaches this result row.
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
  team_id text references archive_teams (team_id),
  time text,                            -- display string: winner's total or +gap, exactly as formatted for the UI
  driver_code text,
  fastest_lap jsonb,                    -- ArchiveFastestLap: {rank, lap, time, avgSpeedKph} - small optional blob
  primary key (archive_race_id, driver_id)
);
create index archive_results_driver_idx on archive_results (driver_id);
create index archive_results_team_idx on archive_results (team_id);

-- Not on the Firestore version (quali lived as a `qualifying` array field on the race doc) - here
-- it's its own table for the same reason race_results/race_inputs are split from `races`: real
-- rows to join/filter, not an array to unpack by hand every read.
create table archive_qualifying (
  archive_race_id text not null references archive_races (id) on delete cascade,
  driver_id text not null,
  position int not null,
  driver_name text not null,
  constructor text,
  q1 text,
  q2 text,
  q3 text,
  primary key (archive_race_id, driver_id)
);

create table archive_pit_stops (
  archive_race_id text not null references archive_races (id) on delete cascade,
  driver_id text not null,
  stop int not null,
  lap int not null,
  time text,
  duration_sec numeric,
  primary key (archive_race_id, driver_id, stop)
);

create table archive_laps (
  archive_race_id text not null references archive_races (id) on delete cascade,
  lap_number int not null,
  driver_id text not null,
  position int,
  time text,                            -- display string ("1:23.456"), not milliseconds - matches
                                         -- exactly what enrich_archive_laps.py already formats
  primary key (archive_race_id, lap_number, driver_id)
);

-- Deliberately no driverIds/teamIds flat-array mirror columns on archive_races (the Firestore
-- version needed them purely because `array-contains` was the only way to query inside a nested
-- array - Postgres doesn't have that limitation). "Every race this driver/team was in" is just a
-- join against archive_results now - see getArchiveRacesByDriver/Team in lib/supabase/archive.ts.

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
  created_at timestamptz not null default now(),
  onboarding_completed_at timestamptz    -- null until the homepage tutorial is dismissed; shown
                                         -- again on every visit until then (see OnboardingTour.tsx)
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

-- security definer bypasses RLS internally when this runs, which is exactly what's needed here -
-- a plain `exists (select 1 from profiles where id = auth.uid() and role = 'admin')` inside a
-- profiles policy would recurse into the very table the policy is attached to and fail with
-- "infinite recursion detected in policy". Lets an admin's browser-side Supabase client (used
-- only by *RealtimeWatcher components and AuthProvider.signOut, see src/lib/supabase/client.ts)
-- receive realtime postgres_changes events for every profiles row, not just their own — the same
-- data an admin already sees on every /users page load via supabaseAdmin (which bypasses RLS
-- entirely server-side), just extended to the one transport that doesn't: live updates.
create or replace function is_admin(uid uuid) returns boolean
language sql security definer stable
as $$
  select exists (select 1 from profiles where id = uid and role = 'admin');
$$;
create policy "admin read all profiles" on profiles for select using (is_admin(auth.uid()));

-- Everything else (races, archive_*, calendar, model_benchmarks, drivers, teams) is public read,
-- service-role write only — same trust model as today (Firestore rules already forbid client
-- writes to these).
alter table races enable row level security;
create policy "public read" on races for select using (true);
-- (repeat "public read" policies for race_results, race_inputs, tire_stints, archive_*, calendar,
--  model_benchmarks — omitted here for brevity, same one-liner each)
alter table drivers enable row level security;
alter table teams enable row level security;
create policy "public read" on drivers for select using (true);
create policy "public read" on teams for select using (true);

-- ============================================================= realtime

-- Lets RaceRealtimeWatcher (src/components/RaceRealtimeWatcher.tsx) push the race page and home
-- page live the moment the pipeline writes something, instead of waiting for a manual reload or
-- the next 300s ISR window. Just `races` is enough signal: every pipeline write that matters
-- (qualifying landing, results landing, prediction/pole/simulation freezing) always upserts this
-- same row too (see fetch_races.py/train_predict.py), so a separate race_results/race_inputs
-- subscription would be redundant. Respects the "public read" policy above the same way any other
-- select does — no separate grant needed.
alter publication supabase_realtime add table races;

-- Lets FavoritesRealtimeWatcher (src/components/FavoritesRealtimeWatcher.tsx, filtered to the
-- signed-in user's own row, respects "own profile" above) and the Users admin page's realtime
-- sync (src/app/users/_hooks/useUsersRealtimeSync.ts, respects "admin read all profiles" above)
-- both react the moment a profiles row changes, instead of a manual reload.
alter publication supabase_realtime add table profiles;

-- Lets CalendarRealtimeWatcher (src/components/CalendarRealtimeWatcher.tsx) react the moment
-- sync_calendar.py writes a schedule/session-time change.
alter publication supabase_realtime add table calendar;

-- Lets MediaRealtimeWatcher (src/components/MediaRealtimeWatcher.tsx) react the moment
-- fetch_races.py updates the current-season driver/team roster.
alter publication supabase_realtime add table drivers;
alter publication supabase_realtime add table teams;

-- ============================================================= groups

-- Deliberately no separate group_picks table: a member's prediction is their existing row in
-- `picks` above (one pick per user per race, same as today) — a group's feed of "who picked
-- what" is a join (group_members -> picks), not duplicated storage. This section adds exactly
-- what `picks` doesn't already cover: group identity, membership + role, and — once a race
-- finishes — the computed outcome (who won the prediction, how close everyone was).
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar_url text,                      -- Supabase Storage url (see the group-avatars bucket below)
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

-- Storage is wired up: one public bucket, since a group avatar is exactly as sensitive as the
-- OAuth-provider avatars ProfileMenu.tsx already renders unauthenticated (a public image URL).
-- Uploaded through /api/groups/[id]/avatar via supabaseAdmin (service role), same trust model as
-- every other write in this app — no storage.objects RLS policy needed, since the browser never
-- talks to Storage directly. 2MB cap, 3 mime types, enforced by the bucket itself as a backstop
-- behind the route handler's own checks.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('group-avatars', 'group-avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']);

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
-- A user can see a group, its membership, and its scoreboard only if they're actually a member.
-- These policies are defense-in-depth, not the actual enforcement mechanism — every real read/
-- write goes through supabaseAdmin (service role, bypasses RLS), which re-checks membership
-- itself (src/lib/supabase/groups.ts's requireMember) the same way it always has for every other
-- table. Promoting/removing a member still has no policy, deliberately - that UI doesn't exist
-- yet either. Noting that here so it reads as "not built yet" rather than "forgotten" next time
-- this file is read.
create policy "members can view their groups" on groups for select
  using (id in (select group_id from group_members where user_id = auth.uid()));
create policy "members can view group membership" on group_members for select
  using (group_id in (select group_id from group_members where user_id = auth.uid()));
create policy "members can view their group's scores" on group_race_scores for select
  using (group_id in (select group_id from group_members where user_id = auth.uid()));
create policy "creating a group" on groups for insert with check (auth.uid() = created_by);
create policy "joining a group" on group_members for insert with check (auth.uid() = user_id);
create policy "admins can update their group" on groups for update
  using (id in (select group_id from group_members where user_id = auth.uid() and role = 'admin'));

-- Lets GroupRealtimeWatcher (src/components/GroupRealtimeWatcher.tsx) push a group's page live the
-- moment compute_group_scores.py writes a new score or another member joins via the invite link -
-- same idea as the `races` publication above, just declared down here since these two tables don't
-- exist yet at that earlier point in this file (alter publication needs the table to already exist).
alter publication supabase_realtime add table group_race_scores;
alter publication supabase_realtime add table group_members;

-- ============================================================= groups v2: points economy, roles, predictions, feed, discovery

-- Every user starts with 100 virtual points (never real money) - one column, not a new table,
-- since it's a single number per user like every other profile field. The DEFAULT backfilled every
-- existing profiles row to 100 the moment this ran (confirmed live), same as any new signup going
-- forward via the same column default.
alter table profiles add column points_balance integer not null default 100 check (points_balance >= 0);

-- A real audit trail for every balance change (the initial grant, a prediction entry, a payout, a
-- refund) - not what actually prevents a negative balance (the atomic guarded UPDATE the service
-- layer uses for that - see lib/supabase/points.ts - is what does), but "the backend should always
-- validate" extends to "and be able to explain how a balance got here," which a bare column alone
-- can't.
-- `prediction_id`'s own FK is added further down (as a separate `alter table`, right after
-- `group_predictions` exists) rather than inline here - same forward-reference situation as the
-- realtime publications at the bottom of the original groups section above, since this table is
-- declared before group_predictions is.
create table points_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  amount integer not null,              -- negative = spent, positive = credited
  reason text not null check (reason in ('starting_grant', 'prediction_entry', 'prediction_payout', 'prediction_refund')),
  group_id uuid references groups (id) on delete set null,
  prediction_id uuid,
  created_at timestamptz not null default now()
);

-- A third real role, alongside the original admin/member - widening the existing check rather than
-- a new column, keeping this the one place a member's permission level lives.
alter table group_members drop constraint group_members_role_check;
alter table group_members add constraint group_members_role_check check (role in ('admin', 'moderator', 'member'));

-- Opt-in public discovery (every existing and new group defaults to 'private' - the exact behavior
-- this app always had; nothing already-created became newly discoverable by this migration) plus a
-- real description field the original name-only create form never had, and a per-group toggle for
-- whether member posts need approval before appearing in the feed.
alter table groups add column description text;
alter table groups add column visibility text not null default 'private' check (visibility in ('public', 'private'));
alter table groups add column moderation_enabled boolean not null default false;

-- One admin-created prediction per (group, race, type) - "type" is what's actually being predicted
-- (winner/podium/fastest lap/pole/DNF count), kept as one table with a check rather than a table per
-- type, since every type shares the same lifecycle (open -> locked -> resolved) and the same entry/
-- payout mechanics - only how a guess is checked against the real result differs, and that lives in
-- application code (lib/supabase/groupPredictions.ts), not the schema. Distinct from a member's
-- personal `picks` row above - this is a group's own prediction, not an aggregation of picks.
create table group_predictions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  race_id text not null references races (id) on delete cascade,
  type text not null check (type in ('winner', 'podium', 'fastest_lap', 'pole', 'dnf_count')),
  entry_points integer not null default 0 check (entry_points >= 0),
  status text not null default 'open' check (status in ('open', 'locked', 'resolved')),
  correct_answer jsonb,                 -- filled in once resolved - shape depends on `type`
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (group_id, race_id, type)
);

-- points_transactions.prediction_id's own FK, deferred until here - see that table's own comment.
alter table points_transactions add constraint points_transactions_prediction_id_fkey
  foreign key (prediction_id) references group_predictions (id) on delete set null;

-- One entry per (prediction, member) - `guess` shape depends on the prediction's own `type` (a
-- driver code for winner/fastest_lap/pole, a 3-element array for podium, a number for dnf_count).
-- `points_wagered` is captured at entry time, not re-read from group_predictions.entry_points at
-- resolution, so a later admin change to entry_points never retroactively changes what an existing
-- entry already paid. `points_awarded` stays null until resolution.
create table group_prediction_entries (
  prediction_id uuid not null references group_predictions (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  guess jsonb not null,
  points_wagered integer not null,
  points_awarded integer,
  created_at timestamptz not null default now(),
  primary key (prediction_id, user_id)
);

-- The Reddit-style discussion feed - flat (group_post_comments below is its own flat list per
-- post, not a threaded tree), upvote-only (no downvotes - matches the product spec's own single
-- "^ 24" example, and halves the moderation-abuse surface a downvote button would add).
create table group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  status text not null default 'published' check (status in ('published', 'pending', 'rejected')),
  created_at timestamptz not null default now()
);

create table group_post_votes (
  post_id uuid not null references group_posts (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table group_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references group_posts (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);

alter table points_transactions enable row level security;
alter table group_predictions enable row level security;
alter table group_prediction_entries enable row level security;
alter table group_posts enable row level security;
alter table group_post_votes enable row level security;
alter table group_post_comments enable row level security;

-- Same "defense in depth, not the real enforcement" model the original groups policies above use -
-- every real read/write goes through supabaseAdmin (service role), which re-checks membership/role
-- itself (groups.ts's requireMember, and the same pattern in groupPredictions.ts/groupPosts.ts).
create policy "own points transactions" on points_transactions for select using (auth.uid() = user_id);
create policy "members can view group predictions" on group_predictions for select
  using (group_id in (select group_id from group_members where user_id = auth.uid()));
create policy "own prediction entries" on group_prediction_entries for select using (auth.uid() = user_id);
create policy "members can view group posts" on group_posts for select
  using (group_id in (select group_id from group_members where user_id = auth.uid()));
create policy "members can view post votes" on group_post_votes for select
  using (post_id in (select id from group_posts where group_id in (select group_id from group_members where user_id = auth.uid())));
create policy "members can view post comments" on group_post_comments for select
  using (post_id in (select id from group_posts where group_id in (select group_id from group_members where user_id = auth.uid())));

-- Public groups become listable (Discover Groups) without membership - the one deliberate
-- relaxation of the original "nothing is discoverable" model, and only for groups an admin
-- explicitly opted into via visibility='public'; every existing/private group is unaffected.
drop policy "members can view their groups" on groups;
create policy "members can view their groups" on groups for select
  using (visibility = 'public' or id in (select group_id from group_members where user_id = auth.uid()));

-- Lets a group's Feed and Predictions tabs react live the same way its Leaderboard/Members already
-- do (see the group_race_scores/group_members publication above).
alter publication supabase_realtime add table group_predictions;
alter publication supabase_realtime add table group_posts;

-- Groups v3 (UI refinement): real banner upload, and a case-insensitive uniqueness constraint on
-- group name (applied and verified live).
alter table groups add column banner_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('group-banners', 'group-banners', true, 3145728, array['image/png', 'image/jpeg', 'image/webp']);

-- Case-insensitive: "F1 Worldwide" and "f1 worldwide" collide. A unique index on lower(name), not
-- a check constraint - Postgres has no direct "unique, case-insensitive" column modifier, this is
-- the standard way to express it. createGroup/updateGroupSettings both translate the resulting
-- 23505 violation into a real "A group with this name already exists." error.
create unique index groups_name_unique_idx on groups (lower(name));

-- Groups v4 (Reddit-style redesign): real up/down voting, threaded comments, personal (no-group)
-- posts, post titles, and post media (images/video/documents) - applied and verified live.
alter table group_post_votes add column value smallint not null default 1 check (value in (1, -1));

create table group_comment_votes (
  comment_id uuid not null references group_post_comments (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  value smallint not null default 1 check (value in (1, -1)),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table group_comment_votes enable row level security;
create policy "members can view comment votes" on group_comment_votes for select
  using (comment_id in (select id from group_post_comments where post_id in (
    select id from group_posts where group_id in (select group_id from group_members where user_id = auth.uid()) or group_id is null
  )));

alter table group_posts add column title text check (title is null or char_length(title) <= 300);
alter table group_posts add column media_url text;
alter table group_posts alter column group_id drop not null;

drop policy "members can view group posts" on group_posts;
create policy "members can view group posts" on group_posts for select
  using (group_id is null or group_id in (select group_id from group_members where user_id = auth.uid()));
drop policy "members can view post comments" on group_post_comments;
create policy "members can view post comments" on group_post_comments for select
  using (post_id in (select id from group_posts where group_id is null or group_id in (select group_id from group_members where user_id = auth.uid())));

alter table group_post_comments add column parent_comment_id uuid references group_post_comments (id) on delete cascade;

-- Images (500KB), video (2MB), and common document types (2MB) - one bucket, the bucket's own
-- file_size_limit is the largest per-type cap; the tighter image limit is enforced in the API
-- route (see /api/posts/media/route.ts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  true,
  2097152,
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
);
