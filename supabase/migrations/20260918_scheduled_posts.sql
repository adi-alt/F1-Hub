-- Scheduled posts + a real "since your last visit" marker for Communities.
--
-- Both changes are additive: a new nullable column each, and one widened CHECK constraint. Every
-- existing row keeps its current value, every existing query keeps working unchanged (a post with
-- scheduled_at NULL and status 'published' is exactly what every post is today), and nothing here
-- backfills or rewrites existing data.

-- ── Scheduled posts ──────────────────────────────────────────────────────────
-- When a post is scheduled, status is 'scheduled' and scheduled_at holds the UTC instant it should
-- become visible. The publisher (api/cron/publish-scheduled-posts) flips it to 'published' once
-- that instant has passed. Until then every existing feed query - all of which filter on
-- status = 'published' - simply doesn't see it, which is the behaviour we want and required no
-- change to those queries.
alter table group_posts add column if not exists scheduled_at timestamptz;

-- Widen the status CHECK to admit 'scheduled'. The constraint is declared inline in schema.sql, so
-- its name is whatever Postgres generated; this finds it by definition rather than assuming a name,
-- and is safe to re-run (the loop simply finds nothing the second time).
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'group_posts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table group_posts drop constraint %I', c.conname);
  end loop;

  alter table group_posts
    add constraint group_posts_status_check
    check (status in ('published', 'pending', 'rejected', 'scheduled'));
end $$;

-- A partial index: the publisher only ever asks "which scheduled posts are now due", so the index
-- only needs to cover rows in that state. Stays tiny no matter how large group_posts grows.
create index if not exists group_posts_scheduled_due_idx
  on group_posts (scheduled_at)
  where status = 'scheduled';

-- ── Since your last visit ────────────────────────────────────────────────────
-- The Communities equivalent of last_homepage_visit_at (which is homepage-scoped and must not be
-- reused here - reading one page would silently reset the other's digest). Read BEFORE the visit's
-- pulse is computed, then written after, exactly like its homepage counterpart.
alter table profiles add column if not exists last_communities_visit_at timestamptz;
