-- M0 / R-06 (audit SEC-06, COM-03): community join authorization, revocable invitations, bans.
--
-- What was wrong
--   * POST /api/groups/[id]/join inserted a membership for ANY group id without reading its
--     visibility. The "Paste invite link or code" box in Discover called it directly, so a private
--     community's approval queue was bypassed by the app's own UI, and anyone who learned a group's
--     uuid could join a private or hidden community outright.
--   * A removed or rejected member could rejoin immediately; there was no ban.
--   * The only "invitation" was the group's own uuid: unrevocable, unexpiring, reusable by anyone.
--
-- The model after this migration
--   public           anyone signed in may join directly.
--   private / hidden joining requires ONE of: an approved join request (approval inserts the
--                    membership), or redeeming a valid invitation. Knowing the uuid is no longer
--                    enough - it only lets you see the preview page and ask to join.
--   invitation       a row here (server-side state) + an HMAC-signed token built by the application
--                    (src/lib/inviteTokens.ts). The token proves the link was issued by us for that
--                    group and carries its expiry; this row decides whether it can still be used
--                    (revoked? expired? uses left?). Revocation is therefore immediate.
--   ban              blocks join, redeem and requests for that group, for every visibility.
--
-- Nothing here touches existing memberships, requests or groups.

create table if not exists public.group_bans (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  banned_by uuid references public.profiles (id) on delete set null,
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  max_uses integer not null check (max_uses between 1 and 1000),
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (use_count <= max_uses),
  check (expires_at > created_at)
);
create index if not exists group_invites_group_active_idx on public.group_invites (group_id) where revoked_at is null;

-- Who used which invitation (audit trail; also stops one person consuming several uses).
create table if not exists public.group_invite_redemptions (
  invite_id uuid not null references public.group_invites (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (invite_id, user_id)
);

-- Server-only tables: RLS on with no policies, and no client grants at all.
alter table public.group_bans enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_invite_redemptions enable row level security;
revoke all on table public.group_bans, public.group_invites, public.group_invite_redemptions from anon, authenticated;

-- Join a PUBLIC community. Idempotent for existing members. Never admits anyone to a private or
-- hidden community - that needs an invitation (below) or an approved request.
create or replace function public.join_group(p_group_id uuid, p_user_id uuid) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare v_visibility text;
begin
  select visibility into v_visibility from public.groups where id = p_group_id;
  if not found then raise exception 'group_not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.group_bans where group_id = p_group_id and user_id = p_user_id) then
    raise exception 'banned' using errcode = '42501';
  end if;
  if exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_user_id) then
    return jsonb_build_object('joined', false, 'alreadyMember', true);
  end if;
  if v_visibility <> 'public' then raise exception 'invite_required' using errcode = '42501'; end if;

  insert into public.group_members (group_id, user_id, role) values (p_group_id, p_user_id, 'member') on conflict do nothing;
  return jsonb_build_object('joined', true, 'alreadyMember', false);
end $$;

-- Redeem an invitation. The invitation must belong to THIS group; checks and the use-count bump
-- happen under one row lock, so the last remaining use cannot be spent twice. Already being a
-- member is success and consumes nothing.
create or replace function public.redeem_group_invite(
  p_group_id uuid, p_invite_id uuid, p_user_id uuid, p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare inv public.group_invites%rowtype;
begin
  select * into inv from public.group_invites where id = p_invite_id and group_id = p_group_id for update;
  if not found then raise exception 'invite_invalid' using errcode = 'P0002'; end if;

  if exists (select 1 from public.group_bans where group_id = p_group_id and user_id = p_user_id) then
    raise exception 'banned' using errcode = '42501';
  end if;
  if exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_user_id) then
    return jsonb_build_object('joined', false, 'alreadyMember', true);
  end if;
  if inv.revoked_at is not null then raise exception 'invite_revoked' using errcode = 'P0001'; end if;
  if p_now >= inv.expires_at then raise exception 'invite_expired' using errcode = 'P0001'; end if;
  if inv.use_count >= inv.max_uses then raise exception 'invite_exhausted' using errcode = 'P0001'; end if;

  insert into public.group_members (group_id, user_id, role) values (p_group_id, p_user_id, 'member') on conflict do nothing;
  insert into public.group_invite_redemptions (invite_id, user_id, redeemed_at) values (p_invite_id, p_user_id, p_now) on conflict do nothing;
  update public.group_invites set use_count = use_count + 1 where id = p_invite_id;
  -- A pending request is now moot; leave it approved rather than dangling in the admins' queue.
  update public.group_join_requests set status = 'approved', decided_at = p_now
   where group_id = p_group_id and user_id = p_user_id and status = 'pending';
  return jsonb_build_object('joined', true, 'alreadyMember', false);
end $$;

do $$
declare f text;
begin
  foreach f in array array['join_group(uuid, uuid)', 'redeem_group_invite(uuid, uuid, uuid, timestamptz)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
