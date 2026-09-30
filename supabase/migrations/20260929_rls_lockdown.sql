-- M0 / R-01: lock the public schema down to what the browser actually needs.
--
-- Why: every app read and write goes through the service-role client on the server
-- (src/lib/supabase/admin.ts), and the pipeline connects as the database owner. The only
-- client-role (anon / authenticated) traffic that legitimately exists is:
--   * Supabase Auth calls (auth schema, unaffected here), and
--   * Realtime postgres_changes, which needs SELECT + a matching select policy on the
--     subscribed tables (src/lib/realtime/channels.ts).
-- Everything else the old policies granted was attack surface, most seriously:
--   * "own profile" FOR ALL let a user UPDATE their own profiles.role / points_balance
--     (getUserRole trusts that column) - audit SEC-01;
--   * "joining a group" let a user INSERT themselves into any group with role='admin';
--   * otp_codes, calendar, race_results, archive_* etc. had no RLS in the schema of record,
--     which with Supabase's default grants means readable/writable via the publishable key -
--     audit SEC-02.
--
-- This migration is written to be correct whatever the live state is (the repo's schema.sql
-- admits it omits some live policies): every step is idempotent, nothing is dropped except
-- named policies, and no data is touched. Apply to staging first; verify with
-- scripts/verify-rls.mjs (read-only) before and after.

-- 1. Row level security on every table in public (idempotent; a no-op where already on).
-- Fail fast instead of queueing: each ALTER/CREATE POLICY below needs a strong lock on its table, and
-- a long-running query would otherwise make every app query queue behind this migration. With this,
-- a busy table aborts the whole transaction after 5 s (nothing applied; retry between pipeline ticks).
-- SET LOCAL lasts only for this transaction (scripts/apply-migration.mjs wraps each file in one).
set local lock_timeout = '5s';

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- 2. No client-role writes anywhere in public. The server uses the service role, which keeps
--    its own grants; the pipeline uses the owner role. Also applied to tables created later.
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon, authenticated;

-- 3. Tables no client should even read.
revoke all on table public.otp_codes from anon, authenticated;
revoke all on table public.schema_migrations from anon, authenticated;
revoke all on table public.ai_cache from anon, authenticated;

-- 4. Replace the write-capable policies with read-only equivalents.
drop policy if exists "own profile" on public.profiles;
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select to authenticated using (auth.uid() = id);

drop policy if exists "own picks" on public.picks;
drop policy if exists "own picks read" on public.picks;
create policy "own picks read" on public.picks for select to authenticated using (auth.uid() = user_id);

drop policy if exists "creating a group" on public.groups;
drop policy if exists "joining a group" on public.group_members;
drop policy if exists "admins can update their group" on public.groups;

-- 5. Membership helpers. SECURITY DEFINER so a policy on group_members can ask "is the caller a
--    member?" without re-entering group_members' own policy - the old self-referencing policy is
--    the classic "infinite recursion detected in policy" (42P17) shape, which silently broke
--    every group-scoped read (and so every group Realtime event) for authenticated clients.
--    They only ever answer for auth.uid(), so they can't be used to probe other users.
create or replace function public.is_group_member(gid uuid) returns boolean
language sql security definer stable set search_path = public, pg_temp as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid());
$$;
create or replace function public.is_group_staff(gid uuid) returns boolean
language sql security definer stable set search_path = public, pg_temp as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid() and role in ('admin', 'moderator'));
$$;
create or replace function public.current_user_is_admin() returns boolean
language sql security definer stable set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_group_member(uuid) from public;
revoke all on function public.is_group_staff(uuid) from public;
revoke all on function public.current_user_is_admin() from public;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_staff(uuid) to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;

-- is_admin(uid) took an arbitrary uid, so anyone could ask "is user X an admin?" via
-- /rest/v1/rpc/is_admin (SEC-22). Keep the function (harmless for the owner/service role) but
-- stop exposing it, and move the policy onto the caller-only helper.
alter function public.is_admin(uuid) set search_path = public, pg_temp;
revoke all on function public.is_admin(uuid) from public, anon, authenticated;
drop policy if exists "admin read all profiles" on public.profiles;
create policy "admin read all profiles" on public.profiles for select to authenticated using (public.current_user_is_admin());

-- 6. Re-express the group read policies on the helpers (same meaning, no recursion).
drop policy if exists "members can view their groups" on public.groups;
create policy "members can view their groups" on public.groups for select
  using (visibility = 'public' or public.is_group_member(id));

drop policy if exists "members can view group membership" on public.group_members;
create policy "members can view group membership" on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "members can view their group's scores" on public.group_race_scores;
create policy "members can view their group's scores" on public.group_race_scores for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "members can view group predictions" on public.group_predictions;
create policy "members can view group predictions" on public.group_predictions for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "members can view group posts" on public.group_posts;
create policy "members can view group posts" on public.group_posts for select to authenticated
  using (group_id is null or public.is_group_member(group_id));

drop policy if exists "members can view post votes" on public.group_post_votes;
create policy "members can view post votes" on public.group_post_votes for select to authenticated
  using (post_id in (select id from public.group_posts where group_id is null or public.is_group_member(group_id)));

drop policy if exists "members can view post comments" on public.group_post_comments;
create policy "members can view post comments" on public.group_post_comments for select to authenticated
  using (post_id in (select id from public.group_posts where group_id is null or public.is_group_member(group_id)));

drop policy if exists "members can view comment votes" on public.group_comment_votes;
create policy "members can view comment votes" on public.group_comment_votes for select to authenticated
  using (comment_id in (select c.id from public.group_post_comments c join public.group_posts p on p.id = c.post_id
                        where p.group_id is null or public.is_group_member(p.group_id)));

drop policy if exists "admins can view join requests" on public.group_join_requests;
create policy "admins can view join requests" on public.group_join_requests for select to authenticated
  using (public.is_group_staff(group_id));

-- 7. Public race/archive reference data: read-only for everyone (these are public F1 facts; the
--    app reads them server-side anyway, and calendar/races/drivers/teams feed the public
--    Realtime channel). Created only if missing, so a live policy with the same name is kept.
do $$
declare t text;
begin
  foreach t in array array['races','race_results','race_inputs','tire_stints','race_laps','drivers','teams','calendar',
                           'archive_circuits','archive_drivers','archive_teams','archive_races','archive_results',
                           'archive_qualifying','archive_pit_stops','archive_laps','model_benchmarks'] loop
    if to_regclass('public.' || t) is not null
       and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'public read') then
      execute format('create policy "public read" on public.%I for select using (true)', t);
    end if;
  end loop;
end $$;
