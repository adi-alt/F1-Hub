-- Level 3: Structured F1 Entity Tags and Spoiler Shield
alter table public.group_posts add column if not exists f1_tags jsonb;
alter table public.group_posts add column if not exists is_spoiler boolean default false;

