-- Level 2 community engagement: pinned posts, interactive polls, multi-image galleries,
-- and per-post notification subscriptions (follow / mute).
alter table public.group_posts add column if not exists pinned_at timestamptz;
alter table public.group_posts add column if not exists poll jsonb;
alter table public.group_posts add column if not exists gallery jsonb;
alter table public.group_posts add column if not exists subscriptions jsonb;

