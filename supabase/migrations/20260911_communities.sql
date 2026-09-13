-- Communities (groups v5): community types, topics/tags, optional feature modules, a real
-- join-request queue, post kinds, and the indexes this table never had.
--
-- Purely ADDITIVE. Nothing is renamed, dropped, or re-typed: `groups`/`group_members`/
-- `group_posts` keep every existing column and every existing route/query keeps working
-- untouched. The user-facing rename (Groups -> Communities) is a UI-layer change only, on
-- purpose - see src/lib/communities/.
--
-- Every statement is idempotent, so re-running this file is a no-op and a partial failure is
-- safe to retry.

-- ---------------------------------------------------------------- community identity

alter table groups add column if not exists community_type text not null default 'general';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'groups_community_type_check') then
    alter table groups add constraint groups_community_type_check
      check (community_type in ('general', 'f1', 'prediction_league', 'private_circle'));
  end if;
end $$;

-- The groups that already exist were all created under the old "Build your own F1 community and
-- prediction league" form, and today render Feed/Predictions/Leaderboard. Backfilling them to
-- 'f1' is precisely what keeps their tab set identical the moment navigation becomes
-- feature-driven - without this they'd silently lose Predictions/Leaderboard on deploy. New
-- communities default to 'general', matching the new type-first create flow.
update groups set community_type = 'f1' where community_type = 'general';

alter table groups add column if not exists topic text;
alter table groups add column if not exists tags text[] not null default '{}';

-- '{}' means "inherit this community_type's defaults", resolved in application code
-- (src/lib/communities/modules.ts) rather than frozen into rows here. That keeps a later type
-- change meaningful, and means this migration needs no per-flag backfill.
alter table groups add column if not exists features jsonb not null default '{}'::jsonb;
alter table groups add column if not exists permissions jsonb not null default '{}'::jsonb;

-- 'hidden' = not discoverable in search or recommendations, invite-only. Widening the existing
-- constraint rather than adding a second column, keeping visibility the one place this lives.
-- Every existing row is 'public' or 'private' and is unaffected.
alter table groups drop constraint if exists groups_visibility_check;
alter table groups add constraint groups_visibility_check
  check (visibility in ('public', 'private', 'hidden'));

-- ---------------------------------------------------------------- post kinds

-- What a post *is*, distinct from its moderation `status`. Deliberately no 'poll' - polls need
-- their own options/votes tables and a real voting UI; exposing the kind without the machinery
-- would be the broken-generic-UI case this redesign is explicitly avoiding.
alter table group_posts add column if not exists kind text not null default 'discussion';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'group_posts_kind_check') then
    alter table group_posts add constraint group_posts_kind_check
      check (kind in ('discussion', 'question', 'race_discussion', 'prediction'));
  end if;
end $$;

-- ---------------------------------------------------------------- join requests

-- Private communities previously had exactly one way in: an invite link or an emailed invite.
-- "Request to Join" had no backing store at all. One row per (community, user) - a re-request
-- after a rejection updates the existing row rather than stacking duplicates.
create table if not exists group_join_requests (
  group_id uuid not null references groups (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  message text check (message is null or char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references profiles (id),
  primary key (group_id, user_id)
);

alter table group_join_requests enable row level security;

-- Same "defense in depth, not the real enforcement" model as every other policy in this schema -
-- real reads/writes go through supabaseAdmin and re-check role in application code.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'group_join_requests' and policyname = 'own join requests') then
    create policy "own join requests" on group_join_requests for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'group_join_requests' and policyname = 'admins can view join requests') then
    create policy "admins can view join requests" on group_join_requests for select
      using (group_id in (select group_id from group_members where user_id = auth.uid() and role in ('admin', 'moderator')));
  end if;
end $$;

-- ---------------------------------------------------------------- indexes

-- group_posts had NO index beyond its primary key, so the cursor-paginated feed
-- (`where group_id in (...) and status = 'published' order by created_at desc limit n`, see
-- listFeedPosts) was a sequential scan on every page of every feed, for every user.
create index if not exists group_posts_group_created_idx on group_posts (group_id, created_at desc);
create index if not exists group_posts_created_idx on group_posts (created_at desc);

-- Both are fetched per feed page, keyed by the page's post ids (see listFeedPosts' Promise.all).
create index if not exists group_post_comments_post_idx on group_post_comments (post_id);
create index if not exists group_post_votes_post_idx on group_post_votes (post_id);

-- Discovery reads every public community on each search.
create index if not exists groups_visibility_idx on groups (visibility);

-- ---------------------------------------------------------------- realtime

-- group_post_comments was never published, so a live comment.created event had nothing to listen
-- to - the Feed could push a new post live but never a new comment on one already on screen.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'group_post_comments') then
    alter publication supabase_realtime add table group_post_comments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'group_join_requests') then
    alter publication supabase_realtime add table group_join_requests;
  end if;
end $$;
