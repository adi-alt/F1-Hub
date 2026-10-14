-- Starts the "Fetch race data and predict" workflow from inside the database, but only while a race weekend's data
-- is actually arriving. GitHub's own schedule for that workflow ("*/15 * * * *") is best effort: over October 2026 it
-- ran about 5 times a day instead of 96, so a race's result could wait hours. GitHub's schedule stays as a backup;
-- this makes sure a run happens when it matters, and nothing happens otherwise.
--
-- When (fetch_races_due, from the calendar's own session times, UTC):
--   - every 15 minutes from each session's start until 3 hours after it (OpenF1 publishes minutes after a session);
--   - every 15 minutes on race day until 8 hours after the start (long races, red flags, late classification);
--   - hourly for the 3 days after the race (Jolpica publishes the official classification, usually on the Monday);
--   - once a day (06:00 UTC) for 21 days after the race (results the stewards amend - fetch_races re-checks them).
-- A cancelled round is skipped.
--
-- The GitHub token lives in Vault (vault.secrets, name 'github_fetch_races_token'), never in this file or the repo: a
-- fine-grained token for adi-alt/F1-Hub with only "Actions: read and write". Until it is stored, nothing is sent.
-- Rotate it with vault.update_secret. Stop the trigger with: select cron.unschedule('dispatch-fetch-races').
-- The workflow's concurrency group queues any overlap with GitHub's own schedule.

set local lock_timeout = '5s';

-- pg_net makes the HTTP request. Guarded so the migrations also load where it doesn't exist (the test database).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end;
$$;

-- Pure: is a fetch due at `at`, given the calendar? Tested on its own (sessionTrigger.test.ts).
create or replace function public.fetch_races_due(at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  with sessions as (
    select
      c.id,
      s->>'label' as label,
      (s->>'date')::timestamp at time zone 'UTC' as starts
    from public.calendar c
    cross join lateral jsonb_array_elements(coalesce(c.sessions, '[]'::jsonb)) s
    where c.status is distinct from 'cancelled'
      and s->>'date' is not null
  ),
  races as (
    select id, starts from sessions where label = 'Race'
  )
  select
    -- during and just after any session
    exists (select 1 from sessions where at >= starts and at < starts + interval '3 hours')
    -- race day
    or exists (select 1 from races where at >= starts and at < starts + interval '8 hours')
    -- hourly for 3 days, on the first tick of each hour
    or (extract(minute from at) < 15 and exists (select 1 from races where at >= starts + interval '8 hours' and at < starts + interval '3 days'))
    -- daily for 21 days, at 06:00 UTC
    or (extract(hour from at at time zone 'UTC') = 6 and extract(minute from at) < 15
        and exists (select 1 from races where at >= starts and at < starts + interval '21 days'));
$$;

create or replace function public.dispatch_fetch_races()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
begin
  if not public.fetch_races_due(now()) then
    return;
  end if;
  select decrypted_secret into token from vault.decrypted_secrets where name = 'github_fetch_races_token' limit 1;
  if token is null then
    return; -- not configured yet
  end if;
  perform net.http_post(
    url := 'https://api.github.com/repos/adi-alt/F1-Hub/actions/workflows/fetch-races.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'apex-f1-hub-dispatch',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('ref', 'main'),
    timeout_milliseconds := 10000
  );
end;
$$;

-- Only the scheduler (as the owner) runs these: no client role can start a workflow or read the schedule logic.
revoke all on function public.fetch_races_due(timestamptz) from public, anon, authenticated;
revoke all on function public.dispatch_fetch_races() from public, anon, authenticated;

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.unschedule('dispatch-fetch-races') where exists (select 1 from cron.job where jobname = 'dispatch-fetch-races');
    perform cron.schedule('dispatch-fetch-races', '*/15 * * * *', 'select public.dispatch_fetch_races()');
  end if;
end;
$$;
