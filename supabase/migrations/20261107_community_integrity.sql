-- Community integrity follow-up:
--   * client-role RLS must not expose unpublished community posts/comments;
--   * moderation log must accept every action the service records;
--   * one invite cannot be consumed repeatedly by the same person after leaving.

set local lock_timeout = '5s';

-- The application uses the service role, but the browser's Supabase JWT can still query these
-- tables directly. Keep the client-side defense-in-depth aligned with the server's visibility rule.
drop policy if exists "members can view group posts" on public.group_posts;
create policy "members can view group posts" on public.group_posts for select to authenticated
  using (
    (
      group_id is null
      and (status = 'published' or user_id = auth.uid())
    )
    or (
      group_id is not null
      and public.is_group_member(group_id)
      and (
        status = 'published'
        or user_id = auth.uid()
        or public.is_group_staff(group_id)
      )
    )
  );

drop policy if exists "members can view post votes" on public.group_post_votes;
create policy "members can view post votes" on public.group_post_votes for select to authenticated
  using (
    post_id in (
      select p.id
      from public.group_posts p
      where (
        (p.group_id is null and (p.status = 'published' or p.user_id = auth.uid()))
        or (
          p.group_id is not null
          and public.is_group_member(p.group_id)
          and (p.status = 'published' or p.user_id = auth.uid() or public.is_group_staff(p.group_id))
        )
      )
    )
  );

drop policy if exists "members can view post comments" on public.group_post_comments;
create policy "members can view post comments" on public.group_post_comments for select to authenticated
  using (
    post_id in (
      select p.id
      from public.group_posts p
      where (
        (p.group_id is null and (p.status = 'published' or p.user_id = auth.uid()))
        or (
          p.group_id is not null
          and public.is_group_member(p.group_id)
          and (p.status = 'published' or p.user_id = auth.uid() or public.is_group_staff(p.group_id))
        )
      )
    )
  );

drop policy if exists "members can view comment votes" on public.group_comment_votes;
create policy "members can view comment votes" on public.group_comment_votes for select to authenticated
  using (
    comment_id in (
      select c.id
      from public.group_post_comments c
      join public.group_posts p on p.id = c.post_id
      where (
        (p.group_id is null and (p.status = 'published' or p.user_id = auth.uid()))
        or (
          p.group_id is not null
          and public.is_group_member(p.group_id)
          and (p.status = 'published' or p.user_id = auth.uid() or public.is_group_staff(p.group_id))
        )
      )
    )
  );

-- These actions are written by groups.ts as well as moderation.ts. The original migration's
-- narrower check silently discarded ownership and mute entries from the audit log.
alter table public.group_moderation_log drop constraint if exists group_moderation_log_action_check;
alter table public.group_moderation_log add constraint group_moderation_log_action_check
  check (action in (
    'post_approved', 'post_removed', 'comment_removed', 'report_dismissed',
    'ownership_transferred', 'member_muted', 'member_unmuted'
  ));

-- Keep the invitation's use limit meaningful per person even if they leave and try the same link
-- again. Current members remain idempotent (the early return below is intentional).
create or replace function public.redeem_group_invite(
  p_group_id uuid, p_invite_id uuid, p_user_id uuid, p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare inv public.group_invites%rowtype;
begin
  select * into inv
    from public.group_invites
   where id = p_invite_id and group_id = p_group_id
   for update;
  if not found then raise exception 'invite_invalid' using errcode = 'P0002'; end if;

  if exists (select 1 from public.group_bans where group_id = p_group_id and user_id = p_user_id) then
    raise exception 'banned' using errcode = '42501';
  end if;
  if exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_user_id) then
    return jsonb_build_object('joined', false, 'alreadyMember', true);
  end if;
  if exists (select 1 from public.group_invite_redemptions where invite_id = p_invite_id and user_id = p_user_id) then
    raise exception 'invite_already_used' using errcode = 'P0001';
  end if;
  if inv.revoked_at is not null then raise exception 'invite_revoked' using errcode = 'P0001'; end if;
  if p_now >= inv.expires_at then raise exception 'invite_expired' using errcode = 'P0001'; end if;
  if inv.use_count >= inv.max_uses then raise exception 'invite_exhausted' using errcode = 'P0001'; end if;

  insert into public.group_members (group_id, user_id, role)
  values (p_group_id, p_user_id, 'member') on conflict do nothing;
  insert into public.group_invite_redemptions (invite_id, user_id, redeemed_at)
  values (p_invite_id, p_user_id, p_now);
  update public.group_invites set use_count = use_count + 1 where id = p_invite_id;
  update public.group_join_requests set status = 'approved', decided_at = p_now
    where group_id = p_group_id and user_id = p_user_id and status = 'pending';
  return jsonb_build_object('joined', true, 'alreadyMember', false);
end $$;
