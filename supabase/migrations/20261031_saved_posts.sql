-- Saved community posts: one private bookmark per user and post.
-- The server owns reads and writes, matching the post/comment service-role model. A post delete
-- removes its bookmark automatically; deleting an account removes the user's saved rows.

create table if not exists public.group_post_saves (
  post_id uuid not null references public.group_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists group_post_saves_user_created_idx
  on public.group_post_saves (user_id, created_at desc);

alter table public.group_post_saves enable row level security;
revoke all on public.group_post_saves from anon, authenticated;
grant all on public.group_post_saves to service_role;
