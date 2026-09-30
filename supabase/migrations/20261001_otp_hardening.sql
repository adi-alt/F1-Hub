-- Email OTP hardening (M0 Batch 3). The database decides every rule, atomically, under a row lock;
-- src/lib/otp.ts only generates the code (crypto.randomInt), hashes it and sends it.
--
-- Before: a plaintext code (Math.random) in otp_codes.code; verification read the row, compared in
-- TypeScript and wrote `attempts + 1` back (two concurrent guesses both counted as one); every
-- resend reset the attempt counter (5 guesses per 60-second resend, indefinitely); a correct code
-- stayed valid for its whole 10 minutes after use (replayable); complete-signup checked and cleared
-- the verified flag in two separate steps.
--
-- Now:
-- * Only an HMAC of the code is stored (keyed with a server secret the database never sees).
-- * otp_issue(): 60 s resend cooldown; at most 5 codes and 10 failed guesses per email per rolling
--   hour (so resending no longer buys more guesses: <= 10 guesses/hour/email against 1,000,000 codes).
-- * otp_verify(): expiry, 5 guesses per code, single use - a correct code is spent the moment it
--   verifies; all under SELECT ... FOR UPDATE, so concurrent submissions are counted exactly and at
--   most one of them can succeed.
-- * otp_consume_verification(): complete-signup spends the "verified" state in one statement.
-- * Rows are never deleted by the app (deleting would reset the hourly counters); a scheduled purge
--   removes rows a day after they stop mattering.
--
-- Rollout: apply BEFORE deploying the app change (the new code calls these functions). The old app
-- keeps working against this schema in the meantime. Plaintext codes still in the table when this
-- runs are cleared, so anyone mid-sign-in at that moment has to request a new code (codes live 10
-- minutes). A later migration can drop the `code` column once the old app is gone.

alter table public.otp_codes alter column code drop not null;
alter table public.otp_codes add column if not exists code_hash text;
alter table public.otp_codes add column if not exists used_at timestamptz;
alter table public.otp_codes add column if not exists verification_consumed_at timestamptz;
alter table public.otp_codes add column if not exists send_window_started_at timestamptz;
alter table public.otp_codes add column if not exists sends_in_window int not null default 0;
alter table public.otp_codes add column if not exists failures_in_window int not null default 0;

-- No plaintext secret at rest.
update public.otp_codes set code = null where code is not null;

-- Issue a code. Returns {"status": "issued"} | {"status": "cooldown" | "throttled", "retry_after_seconds": n}.
create or replace function public.otp_issue(p_email text, p_code_hash text, p_now timestamptz default now())
returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare
  v_email text := lower(btrim(p_email));
  r public.otp_codes%rowtype;
  v_window_start timestamptz;
  v_sends int;
  v_failures int;
begin
  if v_email = '' or p_code_hash is null or length(p_code_hash) < 32 then
    raise exception 'otp_invalid_arguments';
  end if;

  -- Materialise the row first so there is always something to lock: two first-ever requests for one
  -- email serialise on it instead of both passing the cooldown check.
  insert into public.otp_codes (email, expires_at, sent_at) values (v_email, p_now, 'epoch')
  on conflict (email) do nothing;
  select * into r from public.otp_codes where email = v_email for update;

  v_window_start := r.send_window_started_at;
  v_sends := r.sends_in_window;
  v_failures := r.failures_in_window;
  if v_window_start is null or v_window_start <= p_now - interval '1 hour' then
    v_window_start := p_now;
    v_sends := 0;
    v_failures := 0;
  end if;

  if r.sent_at > p_now - interval '60 seconds' then
    return jsonb_build_object('status', 'cooldown', 'retry_after_seconds', ceil(extract(epoch from (r.sent_at + interval '60 seconds' - p_now)))::int);
  end if;
  if v_sends >= 5 or v_failures >= 10 then
    return jsonb_build_object('status', 'throttled', 'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_window_start + interval '1 hour' - p_now)))::int));
  end if;

  update public.otp_codes set
    code = null,
    code_hash = p_code_hash,
    expires_at = p_now + interval '10 minutes',
    sent_at = p_now,
    attempts = 0,
    verified = false,
    verified_at = null,
    used_at = null,
    verification_consumed_at = null,
    send_window_started_at = v_window_start,
    sends_in_window = v_sends + 1,
    failures_in_window = v_failures
  where email = v_email;
  return jsonb_build_object('status', 'issued');
end $$;

-- Check a code. Returns 'ok' | 'wrong' | 'expired' | 'used' | 'too-many'.
create or replace function public.otp_verify(p_email text, p_code_hash text, p_now timestamptz default now())
returns text
language plpgsql set search_path = public, pg_temp as $$
declare
  v_email text := lower(btrim(p_email));
  r public.otp_codes%rowtype;
begin
  select * into r from public.otp_codes where email = v_email for update;
  if not found then return 'expired'; end if;
  if r.used_at is not null then return 'used'; end if;
  if r.code_hash is null then return 'expired'; end if; -- never issued, or a legacy plaintext row
  if r.attempts >= 5 or r.failures_in_window >= 10 then return 'too-many'; end if;
  if r.expires_at <= p_now then return 'expired'; end if;

  if p_code_hash is distinct from r.code_hash then
    update public.otp_codes
       set attempts = attempts + 1, failures_in_window = failures_in_window + 1
     where email = v_email;
    return 'wrong';
  end if;

  -- Single use: the code is spent now. `verified` opens complete-signup's window (below).
  update public.otp_codes
     set used_at = p_now, code_hash = null, verified = true, verified_at = p_now
   where email = v_email;
  return 'ok';
end $$;

-- complete-signup: spend a verification that is at most 10 minutes old, exactly once.
create or replace function public.otp_consume_verification(p_email text, p_now timestamptz default now())
returns boolean
language sql set search_path = public, pg_temp as $$
  with spent as (
    update public.otp_codes
       set verification_consumed_at = p_now
     where email = lower(btrim(p_email))
       and verified
       and verified_at > p_now - interval '10 minutes'
       and verified_at <= p_now
       and verification_consumed_at is null
    returning 1
  )
  select exists (select 1 from spent)
$$;

do $$
declare f text;
begin
  foreach f in array array['otp_issue(text, text, timestamptz)', 'otp_verify(text, text, timestamptz)', 'otp_consume_verification(text, timestamptz)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Retention: a row stops mattering once its code is long expired and its hourly window long over.
-- Skipped where pg_cron isn't installed (local test databases).
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.unschedule('purge-otp-codes') where exists (select 1 from cron.job where jobname = 'purge-otp-codes');
    perform cron.schedule('purge-otp-codes', '17 * * * *',
      $job$delete from public.otp_codes where expires_at < now() - interval '1 day' and coalesce(send_window_started_at, sent_at) < now() - interval '1 day'$job$);
  end if;
end $$;
