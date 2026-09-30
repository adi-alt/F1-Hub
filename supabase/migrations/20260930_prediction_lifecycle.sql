-- M0 / R-05 (audit SEC-05, SEC-07, SEC-08, COM-01, COM-02, COM-04, COM-05, DATA-04):
-- a server-enforced prediction lifecycle.
--
-- What was wrong
--   * enterPrediction only checked status = 'open'. Nothing ever wrote 'locked', so a round stayed
--     open until an admin resolved it: members could enter or change a pick AFTER the race and
--     after results were ingested, then collect the 2x payout.
--   * resolvePrediction was check-then-act across N round trips: two concurrent resolves both saw
--     'open' and both paid; a failure half-way left some winners paid and the round still open, so
--     a retry paid them again. The balance update and its ledger row were also separate statements.
--   * Personal picks locked only when the pipeline flipped races.status (i.e. once results
--     arrived), and stored a client-supplied submitted_at.
--
-- The rule (product decision, M0 Batch 2)
--   A community prediction round closes at the START of the weekend's main Qualifying session, read
--   from calendar.sessions (the actual schedule, not race_date). "Qualifying" means the session that
--   sets the Grand Prix grid: on a Sprint weekend the Sprint Qualifying / Sprint Shootout / Sprint
--   sessions are NOT the cutoff, the main Qualifying is (labels are matched, because FastF1 names
--   sessions differently across sprint formats - see src/lib/sessionCode.ts). The cutoff is
--   exclusive of entries: an entry at exactly the session start is rejected. If the calendar has no
--   main Qualifying session for the race the deadline is unknown and the round fails CLOSED
--   (cannot be created, cannot be entered) rather than guessing.
--
-- Everything here is idempotent (create or replace / if not exists) and touches no existing rows
-- except the status of still-open rounds whose deadline has already passed, which the scheduled
-- lock (below) moves from 'open' to 'locked'. It never changes points, entries, answers or results.

-- 1. Session timestamps. FastF1-derived strings are naive UTC ("2026-12-06T13:00:00"); a string that
--    carries its own zone is honoured; a bare date is midnight UTC. Never the database's own
--    timezone setting.
create or replace function public.parse_session_ts(p text) returns timestamptz
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p is null or btrim(p) = '' then null
    when p ~ '[T ][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' then p::timestamptz
    else p::timestamp at time zone 'UTC'
  end
$$;

-- 2. The single source of truth for "when does this round close".
create or replace function public.prediction_lock_at(p_race_id text) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  with r as (select id, year, round from public.races where id = p_race_id),
  cal as (
    select c.sessions
      from public.calendar c join r on c.id = r.id or (c.year = r.year and c.round = r.round)
     order by (c.id = r.id) desc
     limit 1
  ),
  s as (
    select lower(e ->> 'label') as label, public.parse_session_ts(e ->> 'date') as ts
      from cal, jsonb_array_elements(case when jsonb_typeof(cal.sessions) = 'array' then cal.sessions else '[]'::jsonb end) e
  )
  select min(ts) from s
   where label like '%qualif%' and label not like '%sprint%' and label not like '%shootout%'
$$;

-- Batched form for list endpoints (one round trip for many rounds).
create or replace function public.prediction_lock_times(p_race_ids text[])
returns table (race_id text, lock_at timestamptz)
language sql stable set search_path = public, pg_temp as $$
  select id, public.prediction_lock_at(id) from unnest(p_race_ids) as id
$$;

-- Start of the Grand Prix itself - the deadline personal podium picks already advertise in the UI
-- ("Prediction locked at race start"). Null when the calendar doesn't know it.
create or replace function public.race_start_at(p_race_id text) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  with r as (select id, year, round from public.races where id = p_race_id),
  cal as (
    select c.sessions
      from public.calendar c join r on c.id = r.id or (c.year = r.year and c.round = r.round)
     order by (c.id = r.id) desc
     limit 1
  )
  select min(public.parse_session_ts(e ->> 'date'))
    from cal, jsonb_array_elements(case when jsonb_typeof(cal.sessions) = 'array' then cal.sessions else '[]'::jsonb end) e
   where lower(e ->> 'label') = 'race'
$$;

-- 3. Columns + a ledger guard.
alter table public.group_predictions add column if not exists resolved_results_source text;
alter table public.group_prediction_entries add column if not exists updated_at timestamptz;

-- The database itself refuses a second payout / entry charge for the same (round, user) on any
-- ledger row written from now on. History is deliberately excluded: if the old code ever paid twice
-- (scripts/audit-predictions.mjs reports it), the duplicate rows are evidence to be reviewed by a
-- person, not something a migration should trip over or rewrite. The boundary is the time this
-- migration first ran, so re-applying it is a no-op.
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'points_transactions_one_per_round_user') then
    execute format(
      'create unique index points_transactions_one_per_round_user on public.points_transactions (prediction_id, user_id, reason) '
      || 'where prediction_id is not null and reason in (''prediction_entry'', ''prediction_payout'') and created_at >= %L::timestamptz',
      now()
    );
  end if;
end $$;

-- 4. Guess / answer shape (mirrors validateGuess in groupPredictions.ts; enforced here too so no
--    caller can bypass it).
create or replace function public.valid_prediction_guess(p_type text, p_guess jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_guess is null then false
    when p_type = 'podium' then
      jsonb_typeof(p_guess) = 'array' and jsonb_array_length(p_guess) = 3
      and not exists (select 1 from jsonb_array_elements(p_guess) e where jsonb_typeof(e) <> 'string' or (e #>> '{}') = '')
      and (select count(distinct e #>> '{}') from jsonb_array_elements(p_guess) e) = 3
    when p_type = 'dnf_count' then
      jsonb_typeof(p_guess) = 'number' and (p_guess #>> '{}')::numeric >= 0 and (p_guess #>> '{}')::numeric = trunc((p_guess #>> '{}')::numeric)
    when p_type in ('winner', 'fastest_lap', 'pole') then
      jsonb_typeof(p_guess) = 'string' and (p_guess #>> '{}') <> ''
    else false
  end
$$;

-- 5. Enter or change a pick. One transaction: membership, state, deadline, guess, entry fee and its
--    ledger row all commit together or not at all (no refund path to get wrong).
--    p_now exists only so the deadline boundary can be tested; the application never passes it.
create or replace function public.enter_prediction(
  p_prediction_id uuid, p_group_id uuid, p_user_id uuid, p_guess jsonb, p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare
  pred public.group_predictions%rowtype;
  v_lock_at timestamptz;
  v_created boolean;
  v_balance integer;
begin
  -- FOR SHARE: many entrants may hold it at once, but settle_prediction's FOR UPDATE waits for every
  -- in-flight entry to commit (so none is missed) and any entry arriving after it waits and then
  -- sees status = 'resolved'.
  select * into pred from public.group_predictions where id = p_prediction_id and group_id = p_group_id for share;
  if not found then raise exception 'prediction_not_found' using errcode = 'P0002'; end if;

  if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_user_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  if pred.status = 'resolved' then raise exception 'prediction_resolved' using errcode = 'P0001'; end if;

  v_lock_at := public.prediction_lock_at(pred.race_id);
  if v_lock_at is null then raise exception 'lock_unknown' using errcode = 'P0001'; end if;
  if pred.status <> 'open' or p_now >= v_lock_at then raise exception 'prediction_locked' using errcode = 'P0001'; end if;

  if not public.valid_prediction_guess(pred.type, p_guess) then raise exception 'invalid_guess' using errcode = '22023'; end if;

  insert into public.group_prediction_entries (prediction_id, user_id, guess, points_wagered)
  values (p_prediction_id, p_user_id, p_guess, pred.entry_points)
  on conflict (prediction_id, user_id) do nothing
  returning true into v_created;

  if v_created then
    if pred.entry_points > 0 then
      update public.profiles set points_balance = points_balance - pred.entry_points
       where id = p_user_id and points_balance >= pred.entry_points
      returning points_balance into v_balance;
      if not found then
        select points_balance into v_balance from public.profiles where id = p_user_id;
        raise exception 'insufficient_points' using errcode = 'P0001', detail = format('balance=%s needed=%s', coalesce(v_balance, 0), pred.entry_points);
      end if;
      insert into public.points_transactions (user_id, amount, reason, group_id, prediction_id)
      values (p_user_id, -pred.entry_points, 'prediction_entry', p_group_id, p_prediction_id);
    end if;
    return jsonb_build_object('created', true, 'lockAt', v_lock_at);
  end if;

  -- Already entered: an edit. The fee was paid the first time and is neither re-charged nor refunded.
  update public.group_prediction_entries set guess = p_guess, updated_at = p_now
   where prediction_id = p_prediction_id and user_id = p_user_id;
  return jsonb_build_object('created', false, 'lockAt', v_lock_at);
end $$;

-- 6. Settle a round. The caller computes the correct answer from race results (that logic stays in
--    TypeScript next to the results model); this function owns everything that must be atomic and
--    idempotent: claim the round, score every entry, credit balances, write ledger rows, mark it
--    resolved. Calling it again returns {alreadyResolved: true} and moves no points.
create or replace function public.settle_prediction(
  p_prediction_id uuid, p_group_id uuid, p_correct_answer jsonb, p_results_source text default null, p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare
  pred public.group_predictions%rowtype;
  e record;
  v_slot_score integer;
  v_payout integer;
  v_paid_count integer := 0;
  v_paid_total integer := 0;
begin
  select * into pred from public.group_predictions where id = p_prediction_id and group_id = p_group_id for update;
  if not found then raise exception 'prediction_not_found' using errcode = 'P0002'; end if;

  if pred.status = 'resolved' then
    return jsonb_build_object('alreadyResolved', true, 'correctAnswer', pred.correct_answer, 'paidCount', 0, 'paidTotal', 0);
  end if;
  if not public.valid_prediction_guess(pred.type, p_correct_answer) then raise exception 'invalid_answer' using errcode = '22023'; end if;

  -- Only entries not already awarded: a round left half-settled by the previous implementation
  -- (entries awarded, status still open) must never pay those entries a second time.
  for e in select user_id, guess, points_wagered from public.group_prediction_entries
            where prediction_id = p_prediction_id and points_awarded is null order by user_id for update
  loop
    if pred.type = 'podium' then
      select coalesce(sum(case when g.v = c.v then 3 when g.v in (select jsonb_array_elements_text(p_correct_answer)) then 1 else 0 end), 0)
        into v_slot_score
        from jsonb_array_elements_text(e.guess) with ordinality as g(v, i)
        join jsonb_array_elements_text(p_correct_answer) with ordinality as c(v, i) using (i);
      -- Same formula as the old TypeScript: round(wager * (slotScore / 9) * 2). Computed exactly in
      -- numeric; 4*wager*score / 9 can never land on a half, so rounding rules cannot disagree.
      v_payout := round(e.points_wagered * v_slot_score * 2 / 9.0)::integer;
    else
      v_payout := case when e.guess = p_correct_answer then e.points_wagered * 2 else 0 end;
    end if;

    update public.group_prediction_entries set points_awarded = v_payout where prediction_id = p_prediction_id and user_id = e.user_id;
    if v_payout > 0 then
      update public.profiles set points_balance = points_balance + v_payout where id = e.user_id;
      insert into public.points_transactions (user_id, amount, reason, group_id, prediction_id)
      values (e.user_id, v_payout, 'prediction_payout', p_group_id, p_prediction_id);
      v_paid_count := v_paid_count + 1;
      v_paid_total := v_paid_total + v_payout;
    end if;
  end loop;

  update public.group_predictions
     set status = 'resolved', correct_answer = p_correct_answer, resolved_at = p_now, resolved_results_source = p_results_source
   where id = p_prediction_id;

  return jsonb_build_object('alreadyResolved', false, 'correctAnswer', p_correct_answer, 'paidCount', v_paid_count, 'paidTotal', v_paid_total);
end $$;

-- 7. Move rounds whose deadline has passed from 'open' to 'locked' (what the UI shows as "Closed").
--    Enforcement never depends on this having run - enter_prediction compares the clock itself - it
--    only keeps the stored status honest and lets Realtime tell open pages the round has closed.
create or replace function public.lock_due_predictions(p_now timestamptz default clock_timestamp()) returns integer
language plpgsql set search_path = public, pg_temp as $$
declare n integer;
begin
  update public.group_predictions p set status = 'locked'
   where p.status = 'open' and public.prediction_lock_at(p.race_id) <= p_now;
  get diagnostics n = row_count;
  return n;
end $$;

-- 8. Personal podium picks: enforce on the server the deadline the UI already displays (race start),
--    with the server's clock stamping submitted_at (it used to be client-supplied). A race whose start
--    the calendar doesn't know keeps the previous behaviour (open while races.status = 'upcoming').
create or replace function public.save_pick(
  p_user_id uuid, p_race_id text, p_winner text, p_podium text[], p_now timestamptz default clock_timestamp()
) returns timestamptz
language plpgsql set search_path = public, pg_temp as $$
declare
  v_status text;
  v_start timestamptz;
begin
  select status into v_status from public.races where id = p_race_id for share;
  if not found then raise exception 'race_not_found' using errcode = 'P0002'; end if;
  if v_status <> 'upcoming' then raise exception 'picks_closed' using errcode = 'P0001'; end if;
  v_start := public.race_start_at(p_race_id);
  if v_start is not null and p_now >= v_start then raise exception 'picks_closed' using errcode = 'P0001'; end if;
  if p_podium is null or array_length(p_podium, 1) is distinct from 3 or p_winner is null or p_winner = '' then
    raise exception 'invalid_pick' using errcode = '22023';
  end if;

  insert into public.picks (user_id, race_id, predicted_winner, predicted_podium, submitted_at)
  values (p_user_id, p_race_id, p_winner, p_podium, p_now)
  on conflict (user_id, race_id) do update
    set predicted_winner = excluded.predicted_winner, predicted_podium = excluded.predicted_podium, submitted_at = excluded.submitted_at;
  return p_now;
end $$;

-- 9. Only the server (service role) may call any of this. Clients must never be able to name their
--    own user id, clock, or answer.
do $$
declare f text;
begin
  foreach f in array array[
    'parse_session_ts(text)', 'prediction_lock_at(text)', 'prediction_lock_times(text[])', 'race_start_at(text)',
    'valid_prediction_guess(text, jsonb)',
    'enter_prediction(uuid, uuid, uuid, jsonb, timestamptz)', 'settle_prediction(uuid, uuid, jsonb, text, timestamptz)',
    'lock_due_predictions(timestamptz)', 'save_pick(uuid, text, text, text[], timestamptz)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- 10. Keep stored status in step with the clock. Skipped where pg_cron isn't installed (e.g. local
--     test databases); production already has it (20260918_publish_scheduled_posts_cron.sql).
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.unschedule('lock-due-predictions') where exists (select 1 from cron.job where jobname = 'lock-due-predictions');
    perform cron.schedule('lock-due-predictions', '* * * * *', 'select public.lock_due_predictions()');
  end if;
end $$;
