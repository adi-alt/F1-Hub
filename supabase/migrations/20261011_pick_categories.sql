-- More than a podium: a pick can also name the pole sitter, the fastest lap and the top five, each set against
-- what the model predicts (pole prediction, race pace, simulated top-five odds) and scored after the race by
-- pipeline/compute_group_scores.py:
--   podium      3 per exact slot, 1 for a podium driver in the wrong slot (unchanged)
--   pole        3 if right
--   fastest lap 2 if right
--   top five    1 per driver who finishes in the top five, any order
--   safety car  2 if right (was there one: races.safety_car_periods > 0)
--   margin      2 if the winning margin (P2's gap) falls in the bucket picked: under 2s, 2-5s, 5-10s, over 10s
--
-- All three are optional, so every existing pick stays valid as it is. Pole locks when qualifying starts (the
-- "Qualifying" session, not sprint qualifying); everything else still locks at lights out. Safe to run twice.

alter table picks
  add column if not exists predicted_pole text,
  add column if not exists predicted_fastest_lap text,
  add column if not exists predicted_top5 text[],
  add column if not exists predicted_safety_car boolean,
  add column if not exists predicted_margin text;

alter table picks drop constraint if exists picks_predicted_margin_check;
alter table picks add constraint picks_predicted_margin_check
  check (predicted_margin is null or predicted_margin in ('under_2', '2_5', '5_10', 'over_10'));

alter table picks drop constraint if exists picks_predicted_top5_check;
alter table picks add constraint picks_predicted_top5_check
  check (predicted_top5 is null or array_length(predicted_top5, 1) = 5);

-- When qualifying starts for a race: its calendar's "Qualifying" session (the same source as race_start_at).
create or replace function public.qualifying_start_at(p_race_id text) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select min(public.parse_session_ts(e ->> 'date'))
    from (select public.race_calendar_sessions(p_race_id) as sessions) cal,
         jsonb_array_elements(case when jsonb_typeof(cal.sessions) = 'array' then cal.sessions else '[]'::jsonb end) e
   where lower(e ->> 'label') = 'qualifying'
$$;

-- The old five-argument version is replaced, not overloaded: one way to save a pick.
drop function if exists public.save_pick(uuid, text, text, text[], timestamptz);

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
  v_old_pole text;
begin
  select status into v_status from public.races where id = p_race_id for share;
  if not found then raise exception 'race_not_found' using errcode = 'P0002'; end if;
  if v_status <> 'upcoming' then raise exception 'picks_closed' using errcode = 'P0001'; end if;
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

revoke all on function public.save_pick(uuid, text, text, text[], text, text, text[], boolean, text, timestamptz) from public, anon, authenticated;
revoke all on function public.qualifying_start_at(text) from public, anon, authenticated;
