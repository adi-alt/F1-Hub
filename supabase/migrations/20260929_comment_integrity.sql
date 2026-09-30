-- M0 / R-11 (audit SEC-12, COM-14): comment integrity.
--
-- 1. A reply's parent must belong to the same post. Before this, parent_comment_id was an
--    unconstrained FK, so a comment could be attached under another post's (or another
--    community's) comment.
-- 2. Comment votes are cast through one atomic function that also proves the comment belongs to
--    the post the caller was authorised against. The route gated on the membership of the POST in
--    the URL and never checked the COMMENT id, so pairing any personal post (no membership gate)
--    with a private community's comment id let any signed-in user vote there. The old
--    select-then-write toggle in TypeScript was also racy under a double click.

create or replace function public.enforce_comment_parent_same_post() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.parent_comment_id is not null
     and not exists (select 1 from public.group_post_comments p where p.id = new.parent_comment_id and p.post_id = new.post_id) then
    raise exception 'parent_comment_not_in_post' using errcode = 'P0002';
  end if;
  return new;
end $$;

drop trigger if exists group_post_comments_parent_same_post on public.group_post_comments;
create trigger group_post_comments_parent_same_post
  before insert or update of parent_comment_id, post_id on public.group_post_comments
  for each row execute function public.enforce_comment_parent_same_post();

-- Returns the caller's vote after the call: 1, -1, or 0 (cleared - casting the direction you
-- already hold clears it, matching the UI toggle).
create or replace function public.cast_comment_vote(p_post_id uuid, p_comment_id uuid, p_user_id uuid, p_direction smallint)
returns smallint language plpgsql security invoker set search_path = public, pg_temp as $$
declare current_value smallint;
begin
  if p_direction not in (1, -1) then
    raise exception 'invalid_direction' using errcode = '22023';
  end if;
  if not exists (select 1 from public.group_post_comments where id = p_comment_id and post_id = p_post_id) then
    raise exception 'comment_not_in_post' using errcode = 'P0002';
  end if;

  -- Serialise concurrent casts by the same user on the same comment.
  perform pg_advisory_xact_lock(hashtextextended(p_comment_id::text || p_user_id::text, 0));
  select value into current_value from public.group_comment_votes where comment_id = p_comment_id and user_id = p_user_id;
  if current_value = p_direction then
    delete from public.group_comment_votes where comment_id = p_comment_id and user_id = p_user_id;
    return 0;
  end if;
  insert into public.group_comment_votes (comment_id, user_id, value) values (p_comment_id, p_user_id, p_direction)
    on conflict (comment_id, user_id) do update set value = excluded.value;
  return p_direction;
end $$;

revoke all on function public.cast_comment_vote(uuid, uuid, uuid, smallint) from public, anon, authenticated;
grant execute on function public.cast_comment_vote(uuid, uuid, uuid, smallint) to service_role;
