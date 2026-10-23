-- Account deletion (audit R-53). Deleting a profile already cascades to nearly everything a person owns (picks,
-- prediction entries, the points ledger, notifications, memberships, posts, comments, votes, calls, join requests,
-- invites, bans). Three references block it instead: groups.created_by, group_predictions.created_by (both not null,
-- no cascade) and group_join_requests.decided_by. delete_account() clears those first, in one transaction:
--
--   * a community the person created, or runs as an admin, passes to the longest-standing remaining member (an admin
--     or moderator first), who becomes its admin if no other admin is left; a community with nobody else in it is
--     deleted with them;
--   * prediction rounds they created are re-attributed to the community's (new) creator - other people's entries in
--     them are kept;
--   * join requests they decided keep the decision, without the decider.
--
-- Then it deletes the profile, which cascades the rest. Their posts and comments go with it, replies to them included
-- (the product decision for R-53). The auth user is removed by the app afterwards (Supabase's admin API). Idempotent:
-- a second call finds no profile and changes nothing. Server-only, like settle_prediction: service_role may execute
-- it, no client role can.

set local lock_timeout = '5s';

create or replace function public.delete_account(p_user_id uuid) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare
  g record;
  heir uuid;
  v_deleted_groups integer := 0;
  v_transferred_groups integer := 0;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then return jsonb_build_object('alreadyDeleted', true, 'deletedCommunities', 0, 'transferredCommunities', 0); end if;

  for g in
    select id, created_by from public.groups
     where created_by = p_user_id
        or id in (select group_id from public.group_members where user_id = p_user_id and role = 'admin')
     order by id
     for update
  loop
    heir := null;
    select user_id into heir from public.group_members
     where group_id = g.id and user_id <> p_user_id
     order by (role = 'admin') desc, (role = 'moderator') desc, joined_at, user_id
     limit 1;

    if heir is null then
      delete from public.groups where id = g.id;
      v_deleted_groups := v_deleted_groups + 1;
      continue;
    end if;

    if not exists (select 1 from public.group_members where group_id = g.id and user_id <> p_user_id and role = 'admin') then
      update public.group_members set role = 'admin' where group_id = g.id and user_id = heir;
    end if;
    if g.created_by = p_user_id then
      update public.groups set created_by = heir where id = g.id;
      v_transferred_groups := v_transferred_groups + 1;
    end if;
  end loop;

  update public.group_predictions gp set created_by = gr.created_by
    from public.groups gr
   where gp.group_id = gr.id and gp.created_by = p_user_id;
  update public.group_join_requests set decided_by = null where decided_by = p_user_id;

  delete from public.profiles where id = p_user_id;

  return jsonb_build_object('alreadyDeleted', false, 'deletedCommunities', v_deleted_groups, 'transferredCommunities', v_transferred_groups);
end $$;

revoke all on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;
