-- Race photos from Wikimedia Commons, chosen by a person (not by the pipeline alone).
--
--   Wikimedia -> pipeline/race_photos.py (licence + relevance filters, ranking) -> race_photo_candidates
--   -> admin approval (/admin/race-photos) -> race_photos -> the race page loads Wikimedia's own thumbnails.
--
-- Only metadata and Wikimedia URLs live here. No image is ever copied into Supabase Storage: the browser
-- loads upload.wikimedia.org directly, so these photos cost no Storage space or egress.
--
-- The licence and attribution rules are enforced by the database too, not only by the pipeline, so a bug in
-- either the pipeline or the approval page can't store a photo we may not show:
--   - licence: CC0, Public domain, CC BY or CC BY-SA only (any version);
--   - photographer, licence URL and source page all present;
--   - image URLs on Wikimedia's upload host, the source a Commons file page.
-- Both tables carry the same checks, since an approved photo is a copy of a candidate's row.
--
-- Server-only, like pipeline_runs: RLS on with no policies and no client grants. The pipeline writes with
-- DATABASE_URL; the app reads and approves through the service role, after its own admin check.
-- Safe to run twice.

create table if not exists race_photo_candidates (
  id bigint generated always as identity primary key,
  race_id text not null references races (id) on delete cascade,
  provider text not null check (provider in ('wikimedia')),
  provider_id text not null,               -- the Commons file title, "File:...jpg"
  image_url text not null check (image_url like 'https://upload.wikimedia.org/%'),       -- 1280px
  thumbnail_url text not null check (thumbnail_url like 'https://upload.wikimedia.org/%'), -- 500px
  source_url text not null check (source_url like 'https://commons.wikimedia.org/wiki/File:%'),
  photographer text not null check (length(btrim(photographer)) > 0),
  license text not null check (license ~ '^(CC0|Public domain|CC BY(-SA)? [0-9]\.[0-9])$'),
  license_url text not null check (license_url ~ '^https?://'),
  alt_text text not null,
  width int not null check (width > 0),
  height int not null check (height > 0),
  taken_on date,
  subject text not null check (subject in ('car', 'podium', 'driver', 'atmosphere', 'general')),
  score int not null,
  group_key text not null,                 -- frames from one burst share it; the review page groups by it
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  found_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  unique (race_id, provider, provider_id)
);

create index if not exists race_photo_candidates_race_status_idx on race_photo_candidates (race_id, status);

create table if not exists race_photos (
  id bigint generated always as identity primary key,
  race_id text not null references races (id) on delete cascade,
  -- The candidate it was approved from. No foreign key on purpose: race_photos is in the nightly backup and
  -- the candidates are not (the pipeline can find them again), so a restore must not depend on them.
  candidate_id bigint,
  provider text not null check (provider in ('wikimedia')),
  provider_id text not null,
  image_url text not null check (image_url like 'https://upload.wikimedia.org/%'),
  thumbnail_url text not null check (thumbnail_url like 'https://upload.wikimedia.org/%'),
  source_url text not null check (source_url like 'https://commons.wikimedia.org/wiki/File:%'),
  photographer text not null check (length(btrim(photographer)) > 0),
  license text not null check (license ~ '^(CC0|Public domain|CC BY(-SA)? [0-9]\.[0-9])$'),
  license_url text not null check (license_url ~ '^https?://'),
  alt_text text not null,
  width int not null check (width > 0),
  height int not null check (height > 0),
  -- 1-4, unique per race: the database itself caps a race at four approved photos.
  rank smallint not null check (rank between 1 and 4),
  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  checked_at timestamptz not null default now(),   -- last weekly re-check against Commons
  unique (race_id, provider, provider_id),
  unique (race_id, rank)
);

alter table race_photo_candidates enable row level security;
alter table race_photos enable row level security;
revoke all on table race_photo_candidates from anon, authenticated;
revoke all on table race_photos from anon, authenticated;
