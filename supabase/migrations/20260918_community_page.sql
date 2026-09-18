-- The community page: a banner tagline, announcements, and a per-community "since your last visit".
--
-- All three changes are additive - two nullable columns and one widened CHECK. Every existing row
-- keeps its current value and every existing query keeps working unchanged. Nothing here backfills
-- or rewrites data.

-- ── Banner tagline ───────────────────────────────────────────────────────────
-- A short line rendered OVER the community's cover image, separate from `description` (which is the
-- paragraph under the name and is what Discover cards show). Deliberately its own column rather
-- than reusing description: the two appear together on the header, and a community that wants a
-- motto over its cover shouldn't have to put that motto in the sentence that explains what it is.
-- Nullable, and the overlay simply doesn't render when it's null - a community with no tagline gets
-- a clean cover, not an empty text block.
alter table groups add column if not exists tagline text;

-- ── Announcements ────────────────────────────────────────────────────────────
-- A fifth post kind. Unlike the other four it is role-gated rather than type-gated: any community
-- can have announcements, but only its moderators and admins can write one (enforced in
-- communities.ts's postKindsFor, which createPost re-validates against - see its own comment).
-- The constraint is declared inline in the 20260911 migration, so its name is whatever Postgres
-- generated; this finds it by definition rather than assuming a name, and is safe to re-run.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'group_posts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table group_posts drop constraint %I', c.conname);
  end loop;

  alter table group_posts
    add constraint group_posts_kind_check
    check (kind in ('discussion', 'question', 'race_discussion', 'prediction', 'announcement'));
end $$;

-- The community feed can now filter by kind (the Announcements / Race Weekend / Predictions chips),
-- which is a different access path from the existing (group_id, created_at desc) index: that one
-- still serves the unfiltered Latest feed, this one serves a filtered page of it without scanning
-- the whole community's history to find, say, three announcements.
create index if not exists group_posts_group_kind_created_idx
  on group_posts (group_id, kind, created_at desc);

-- ── Since your last visit, per community ─────────────────────────────────────
-- profiles.last_communities_visit_at (20260918_scheduled_posts) is the Communities *index*'s marker
-- and must not be reused here - reading one community would silently reset the digest for every
-- other one, exactly the way reusing last_homepage_visit_at would have. A per-(community, member)
-- marker belongs on the membership row itself, which is already keyed (group_id, user_id).
--
-- Null means "never opened this community's page since this column existed", which the pulse widget
-- reports as a first visit (the standing picture) rather than as "nothing has changed" - a claim
-- about a visit that never happened.
alter table group_members add column if not exists last_visit_at timestamptz;
