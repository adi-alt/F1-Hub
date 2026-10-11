-- Predictions open 24 hours before the weekend's first session (FP1, or sprint qualifying / the sprint on a
-- sprint weekend: whichever comes first), and from that moment can always be saved:
--   - save_pick refuses a pick made earlier than that ('picks_not_open');
--   - a weekend whose races row the pipeline hasn't written yet (it writes one once there is session data) gets
--     a minimal one from its live calendar row, so the pick has something to belong to. The pipeline's own
--     upsert fills in the rest later; race identity (20261001_race_identity.sql) keeps it to one row per event.
-- Everything else about save_pick is unchanged from 20261011_pick_categories.sql. Safe to run twice.

-- When the weekend starts: its earliest calendar session of any kind. Before the pipeline has written the race
-- (race_calendar_sessions goes through races), the live calendar row with the same id answers instead.
create or replace function public.weekend_start_at(p_race_id text) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select min(public.parse_session_ts(e ->> 'date'))
    from (select coalesce(
                   public.race_calendar_sessions(p_race_id),
                   (select c.sessions from public.calendar c where c.id = p_race_id and c.status is distinct from 'cancelled' limit 1)
                 ) as sessions) cal,
         jsonb_array_elements(case when jsonb_typeof(cal.sessions) = 'array' then cal.sessions else '[]'::jsonb end) e
$$;

create or replace function public.save_pick(
  p_user_id uuid,
  p_race_id text,
  p_winner text,
  p_podium text[],
  p_pole text default null,
  p_fastest_lap text default null,
  p_top5 text[] default null,
  p_safety_car boolean default null,
  p_margin text default null,
  p_now timestamptz default clock_timestamp()
) returns timestamptz
language plpgsql set search_path = public, pg_temp as $$
declare
  v_status text;
  v_start timestamptz;
  v_quali timestamptz;
  v_opens timestamptz;
  v_old_pole text;
begin
  v_opens := public.weekend_start_at(p_race_id) - interval '1 day';
  if v_opens is not null and p_now < v_opens then raise exception 'picks_not_open' using errcode = 'P0001'; end if;

  select status into v_status from public.races where id = p_race_id for share;
  if not found then
    -- The weekend is open but the pipeline hasn't written its race yet: start one from the live calendar row.
    insert into public.races (id, year, round, name, circuit, country, status, race_date)
    select c.id, c.year, c.round, coalesce(c.name, c.id), coalesce(c.circuit, c.name, c.id), c.country, 'upcoming', c.race_date
      from public.calendar c
     where c.id = p_race_id and c.status is distinct from 'cancelled'
    on conflict do nothing;
    select status into v_status from public.races where id = p_race_id for share;
    if not found then raise exception 'race_not_found' using errcode = 'P0002'; end if;
  end if;
  if v_status not in ('upcoming', 'scheduled') then raise exception 'picks_closed' using errcode = 'P0001'; end if;
  v_start := public.race_start_at(p_race_id);
  if v_start is not null and p_now >= v_start then raise exception 'picks_closed' using errcode = 'P0001'; end if;
  if p_podium is null or array_length(p_podium, 1) is distinct from 3 or p_winner is null or p_winner = ''
     or (select count(distinct d) from unnest(p_podium) d) <> 3 then
    raise exception 'invalid_pick' using errcode = '22023';
  end if;
  if p_margin is not null and p_margin not in ('under_2', '2_5', '5_10', 'over_10') then
    raise exception 'invalid_pick' using errcode = '22023';
  end if;
  if p_top5 is not null and (array_length(p_top5, 1) is distinct from 5 or (select count(distinct d) from unnest(p_top5) d) <> 5) then
    raise exception 'invalid_pick' using errcode = '22023';
  end if;

  -- Pole can't change once qualifying has started; the rest of the pick still can, until lights out.
  select predicted_pole into v_old_pole from public.picks where user_id = p_user_id and race_id = p_race_id;
  v_quali := public.qualifying_start_at(p_race_id);
  if v_quali is not null and p_now >= v_quali and p_pole is distinct from v_old_pole then
    raise exception 'pole_closed' using errcode = 'P0001';
  end if;

  insert into public.picks (user_id, race_id, predicted_winner, predicted_podium, predicted_pole, predicted_fastest_lap, predicted_top5, predicted_safety_car, predicted_margin, submitted_at)
  values (p_user_id, p_race_id, p_winner, p_podium, nullif(p_pole, ''), nullif(p_fastest_lap, ''), p_top5, p_safety_car, p_margin, p_now)
  on conflict (user_id, race_id) do update
    set predicted_winner = excluded.predicted_winner,
        predicted_podium = excluded.predicted_podium,
        predicted_pole = excluded.predicted_pole,
        predicted_fastest_lap = excluded.predicted_fastest_lap,
        predicted_top5 = excluded.predicted_top5,
        predicted_safety_car = excluded.predicted_safety_car,
        predicted_margin = excluded.predicted_margin,
        submitted_at = excluded.submitted_at;
  return p_now;
end $$;

revoke all on function public.weekend_start_at(text) from public, anon, authenticated;
