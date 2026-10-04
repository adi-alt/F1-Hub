-- Durable rate limiting (audit R-14, SEC-13, D-03): a counter per key and fixed window, in Postgres, so a
-- limit holds across every serverless instance and survives a deploy (the old limiter lived in each
-- instance's memory). One atomic upsert per call: the window restarts when it has expired, and the
-- caller is told whether this hit is within the limit and how long until the window resets.
--
-- Internal, like otp_codes: RLS on with no policies and no client grants. Only the server (service
-- role) calls rate_limit_hit.
create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);

alter table rate_limits enable row level security;
revoke all on table rate_limits from anon, authenticated;

create or replace function rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns table (allowed boolean, hits int, retry_after_seconds int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window interval := make_interval(secs => p_window_seconds);
  v_hits int;
  v_start timestamptz;
begin
  insert into rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set window_start = case when r.window_start <= now() - v_window then now() else r.window_start end,
        hits = case when r.window_start <= now() - v_window then 1 else r.hits + 1 end
  returning r.hits, r.window_start into v_hits, v_start;

  return query select v_hits <= p_limit, v_hits, greatest(1, ceil(extract(epoch from (v_start + v_window - now())))::int);
end;
$$;

revoke all on function rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function rate_limit_hit(text, int, int) to service_role;

-- Old windows are dead weight: clear them hourly (pg_cron is already in use for scheduled posts).
select cron.unschedule('purge-rate-limits') where exists (select 1 from cron.job where jobname = 'purge-rate-limits');
select cron.schedule('purge-rate-limits', '17 * * * *', $$ delete from rate_limits where window_start < now() - interval '2 days' $$);
