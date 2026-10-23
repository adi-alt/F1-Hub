-- Post and comment moderation (audit R-42): authors edit and delete their own posts and comments, anyone who can see
-- a community post can report it (or one of its comments), moderators work a report queue in Manage, and every
-- moderator decision lands in an audit log (who approved, removed or dismissed what, and when).
--
-- A deleted comment is kept as a tombstone (deleted_at set, its text replaced) so the replies under it keep their
-- thread; a deleted post is removed outright (its comments, votes and call cascade, as they already do).
--
-- Written and read only by the server (the service-role client), like notifications: row level security on, no client
-- policies, no client grants. New tables and new nullable columns only - nothing existing changes.

set local lock_timeout = '5s';

alter table public.group_posts add column if not exists edited_at timestamptz;
alter table public.group_post_comments add column if not exists edited_at timestamptz;
alter table public.group_post_comments add column if not exists deleted_at timestamptz;

create table if not exists public.group_post_reports (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  post_id uuid not null references public.group_posts (id) on delete cascade,
  comment_id uuid references public.group_post_comments (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz
);
-- One report per person per thing: reporting the same post twice changes nothing.
create unique index if not exists group_post_reports_once_idx on public.group_post_reports (reporter_id, post_id, coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists group_post_reports_open_idx on public.group_post_reports (group_id, created_at desc) where status = 'open';

alter table public.group_post_reports enable row level security;
revoke all on public.group_post_reports from anon, authenticated;
grant all on public.group_post_reports to service_role;

create table if not exists public.group_moderation_log (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('post_approved', 'post_removed', 'comment_removed', 'report_dismissed')),
  -- No foreign keys: the log outlives what it describes.
  post_id uuid,
  comment_id uuid,
  report_id uuid,
  target_user_id uuid references public.profiles (id) on delete set null,
  excerpt text check (excerpt is null or char_length(excerpt) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists group_moderation_log_group_idx on public.group_moderation_log (group_id, created_at desc);

alter table public.group_moderation_log enable row level security;
revoke all on public.group_moderation_log from anon, authenticated;
grant all on public.group_moderation_log to service_role;
