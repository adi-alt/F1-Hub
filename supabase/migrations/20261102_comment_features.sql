-- Level 1 comment enhancements: pinned comments, accepted answers on question posts,
-- quick emoji reactions, and optional GIF/image attachments on comments.

alter table public.group_post_comments add column if not exists pinned_at timestamptz;
alter table public.group_post_comments add column if not exists accepted_at timestamptz;
alter table public.group_post_comments add column if not exists reactions jsonb;
alter table public.group_post_comments add column if not exists media_url text;

