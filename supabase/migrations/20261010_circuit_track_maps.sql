-- Circuit track maps: the circuit's Wikipedia lead image (its track map), shown wherever a circuit image is.
--
--   en.wikipedia.org (pageprops.page_image_free) -> Commons imageinfo (licence, author)
--   -> pipeline/circuit_track_maps.py -> archive_circuits.track_map_* -> the app loads Wikimedia's 960px thumbnail.
--
-- Replaces image_url / image_urls for display: those hold photos from each circuit's Commons category, which
-- are often not of the track at all (Singapore's was a car park). Those columns stay, but the app stops
-- reading them. Only metadata and Wikimedia URLs live here; nothing is copied into Supabase Storage.
--
-- The same licence and attribution rules as race_photos (20261009_race_photos.sql), enforced by the database:
--   - licence: CC0, Public domain, CC BY or CC BY-SA only (any version);
--   - author, licence URL and source page all present;
--   - the map on Wikimedia's upload host, the source a Commons file page;
--   - either no map at all (every column null) or a complete one.
-- Safe to run twice.

alter table archive_circuits
  add column if not exists track_map_url text,
  add column if not exists track_map_source_url text,
  add column if not exists track_map_credit text,
  add column if not exists track_map_license text,
  add column if not exists track_map_license_url text,
  add column if not exists track_map_checked_at timestamptz;

alter table archive_circuits drop constraint if exists archive_circuits_track_map_url_check;
alter table archive_circuits add constraint archive_circuits_track_map_url_check
  check (track_map_url like 'https://upload.wikimedia.org/%');

alter table archive_circuits drop constraint if exists archive_circuits_track_map_source_url_check;
alter table archive_circuits add constraint archive_circuits_track_map_source_url_check
  check (track_map_source_url like 'https://commons.wikimedia.org/wiki/File:%');

alter table archive_circuits drop constraint if exists archive_circuits_track_map_credit_check;
alter table archive_circuits add constraint archive_circuits_track_map_credit_check
  check (length(btrim(track_map_credit)) > 0);

alter table archive_circuits drop constraint if exists archive_circuits_track_map_license_check;
alter table archive_circuits add constraint archive_circuits_track_map_license_check
  check (track_map_license ~ '^(CC0|Public domain|CC BY(-SA)? [0-9]\.[0-9])$');

alter table archive_circuits drop constraint if exists archive_circuits_track_map_license_url_check;
alter table archive_circuits add constraint archive_circuits_track_map_license_url_check
  check (track_map_license_url ~ '^https?://');

-- All or nothing: a map is never shown without its full credit.
alter table archive_circuits drop constraint if exists archive_circuits_track_map_complete_check;
alter table archive_circuits add constraint archive_circuits_track_map_complete_check
  check (
    (track_map_url is null and track_map_source_url is null and track_map_credit is null
      and track_map_license is null and track_map_license_url is null and track_map_checked_at is null)
    or
    (track_map_url is not null and track_map_source_url is not null and track_map_credit is not null
      and track_map_license is not null and track_map_license_url is not null)
  );
