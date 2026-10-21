-- Notifications: one row per thing that happened to one person ("your prediction was right", "a post is waiting
-- for approval in a community you moderate", "someone replied to you"), shown in the site's notification centre.
-- Each person chooses, per kind, whether it appears on the site and whether it's also emailed
-- (profiles.notification_prefs: {"<kind>": {"site": bool, "email": bool}}; a kind not in the map uses the app's
-- default for it, so the column starts empty and nothing has to be backfilled).
--
-- dedupe_key makes each event notify a person once even if the code that raises it runs twice (a retried
-- request, a second admin resolving the same round): unique per person.
--
-- Written and read only by the server (the service-role client), like post_calls: row level security on, no client
-- policies, no client grants. New objects and one new column with a default - nothing existing changes.

set local lock_timeout = '5s';

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'prediction_result', 'new_round', 'reply', 'join_request', 'join_decision', 'post_pending', 'post_moderated', 'role_changed', 'invite'
  )),
  title text not null check (char_length(title) between 1 and 200),
  body text check (body is null or char_length(body) <= 500),
  href text check (href is null or (char_length(href) <= 500 and href like '/%')),
  actor_id uuid references public.profiles (id) on delete set null,
  group_id uuid references public.groups (id) on delete cascade,
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 200),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  emailed_at timestamptz,
  unique (user_id, dedupe_key)
);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant all on public.notifications to service_role;

alter table public.profiles add column if not exists notification_prefs jsonb not null default '{}'::jsonb;
