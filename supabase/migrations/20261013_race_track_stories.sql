-- Race track stories: each race's real circuit outline and where on it the lead changed hands, for the race
-- page's "How the race unfolded" (pipeline/race_track_story.py).
--
-- Its own table, not a column on races: the race list queries select races.* (RACE_SELECT in
-- src/lib/supabase/races.ts), so a ~5 KB column there would ride along on every season, calendar and circuit
-- history query. Only the race page reads this, by race id, one row.
--
-- One row per race, replaced whenever the pipeline recomputes it; deleting a race deletes its story. The story
-- is derived data, rebuildable from F1's live-timing archive at any time, so it isn't backed up separately.
-- Public read like races; only the service role writes. Safe to run twice.

create table if not exists race_track_stories (
  race_id text primary key references races(id) on delete cascade,
  -- race_track_story.py's STORY_VERSION: the app ignores a story whose shape it doesn't know.
  version int not null check (version > 0),
  -- The live-timing session it was built from ('/static/2026/.../2026-07-05_Race/'), for audit.
  session_path text not null check (session_path like '/static/%'),
  -- coalesce: a story with no outline key gives null here, and a null CHECK would pass.
  story jsonb not null check (coalesce(jsonb_typeof(story) = 'object' and jsonb_typeof(story->'outline') = 'array', false)),
  computed_at timestamptz not null default now()
);

alter table race_track_stories enable row level security;
drop policy if exists "public read" on race_track_stories;
create policy "public read" on race_track_stories for select using (true);
revoke insert, update, delete on table race_track_stories from anon, authenticated;
