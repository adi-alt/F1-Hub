-- Circuit layouts: the track library. One row per layout of a circuit, with the seasons it was used, so every
-- race - 1950 to now - draws its own circuit by looking up (circuit, season) instead of each race carrying a
-- copy (pipeline/circuit_layouts.py).
--
-- Two sources, one table:
--   drawn     each historical layout as a drawing (f1-circuits-svg by Jules Roy, MIT): an SVG path on its own
--             500x500 canvas. Covers every circuit and season to 2025, but in no real coordinate frame.
--   measured  a layout traced from race car positions in F1's live-timing archive (race_track_stories), in F1's
--             own track coordinates - the frame pass locations are in. One version per run of seasons whose
--             outlines agree; a season that doesn't starts a new version. This is how a changed or new track
--             (a new chicane, 2026's Madring) enters the library, without anyone editing it.
-- Where both cover a season, the app prefers measured.
--
-- circuit_id is archive_circuits.circuit_id when the circuit is in the archive, else a slug of races.circuit
-- (a circuit newer than the archive): deliberately not a foreign key, so a brand-new circuit can be added.
-- A race picks the layout covering its season - a variant whose race_name_match is in the race's name first.
-- aliases holds races.circuit spellings that mean this circuit, which is how a current-season race page (which
-- knows races.circuit, not the archive id) finds it.
--
-- Rebuildable: drawn rows from the dataset, measured rows from race_track_stories. Public read like races; only
-- the service role writes. Safe to run twice.

create table if not exists circuit_layouts (
  layout_id text primary key,
  circuit_id text not null,
  aliases text[] not null default '{}',
  seasons int[] not null check (cardinality(seasons) > 0),
  -- Two layouts in one season at one circuit (2020: the Bahrain GP on the main track, the Sakhir GP on the outer
  -- loop): the variant names the race it was used for, matched against the race's name. Null for the usual one.
  race_name_match text,
  source text not null check (source in ('drawn', 'measured')),
  -- drawn: {"path": "<svg path d>", "viewBox": "0 0 500 500"}; measured: {"outline": [[x, y], ...], ...}.
  -- coalesce: a missing key gives null here, and a null CHECK would pass.
  geometry jsonb not null check (coalesce(
    case source
      when 'drawn' then jsonb_typeof(geometry->'path') = 'string'
      else jsonb_typeof(geometry->'outline') = 'array'
    end, false)),
  attribution text,
  updated_at timestamptz not null default now()
);

create index if not exists circuit_layouts_circuit_idx on circuit_layouts (circuit_id);

alter table circuit_layouts enable row level security;
drop policy if exists "public read" on circuit_layouts;
create policy "public read" on circuit_layouts for select using (true);
revoke insert, update, delete on table circuit_layouts from anon, authenticated;
