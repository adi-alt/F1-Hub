-- Moderator-controlled discussion locks. The API enforces the lock; this column only records the
-- current state on the post so every feed surface can explain why replies are unavailable.

alter table public.group_posts add column if not exists comments_locked_at timestamptz;
