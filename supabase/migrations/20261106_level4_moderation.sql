-- Level 4: Private-Community Hardening, Roles & Moderation
-- Adds slow mode rate-limiting, community rules, structured removal reasons, and member temporary mutes.

-- 1. Slow Mode & Community Rules on groups
alter table public.groups add column if not exists slow_mode_seconds integer default 0;
alter table public.groups add column if not exists rules text[] default '{}';

-- 2. Structured Removal Reason on group_posts
alter table public.group_posts add column if not exists removal_reason text;

-- 3. Temporary Mutes on group_members
alter table public.group_members add column if not exists muted_until timestamptz;
alter table public.group_members add column if not exists mute_reason text;

