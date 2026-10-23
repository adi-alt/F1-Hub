-- Deterministic F1 reference data for a disposable local database (scripts/local-db.ts): the three 2026
-- rounds the synthetic seed (scripts/staging/seed-app.mjs) builds its prediction rounds on, a small
-- roster, and two results. Not real timing data: just enough for every key route to render real rows.
-- R15 and R16 are in the past (resolved and locked rounds); R23's weekend is always 30 days from load
-- time, so its round stays open whenever the database is built.

insert into teams (name, color) values
  ('Mercedes', '27F4D2'), ('Red Bull Racing', '3671C6'), ('Ferrari', 'E80020'), ('McLaren', 'FF8000'), ('Racing Bulls', '6692FF');

insert into drivers (code, name, team) values
  ('RUS', 'George Russell', 'Mercedes'), ('ANT', 'Andrea Kimi Antonelli', 'Mercedes'),
  ('VER', 'Max Verstappen', 'Red Bull Racing'), ('HAD', 'Isack Hadjar', 'Red Bull Racing'),
  ('LEC', 'Charles Leclerc', 'Ferrari'), ('HAM', 'Lewis Hamilton', 'Ferrari'),
  ('NOR', 'Lando Norris', 'McLaren'), ('PIA', 'Oscar Piastri', 'McLaren');

insert into calendar (id, year, round, name, circuit, country, event_format, race_date, status, sessions) values
  ('2026_r15_azerbaijan-grand-prix', 2026, 15, 'Azerbaijan Grand Prix', 'Baku', 'Azerbaijan', 'conventional', '2026-09-27', 'completed',
   '[{"label":"Practice 1","date":"2026-09-25T08:30:00Z"},{"label":"Qualifying","date":"2026-09-26T12:00:00Z"},{"label":"Race","date":"2026-09-27T11:00:00Z"}]'),
  ('2026_r16_bahrain-grand-prix', 2026, 16, 'Bahrain Grand Prix', 'Sakhir', 'Bahrain', 'conventional', '2026-10-04', 'completed',
   '[{"label":"Practice 1","date":"2026-10-02T11:30:00Z"},{"label":"Qualifying","date":"2026-10-03T16:00:00Z"},{"label":"Race","date":"2026-10-04T15:00:00Z"}]'),
  ('2026_r23_abu-dhabi-grand-prix', 2026, 23, 'Abu Dhabi Grand Prix', 'Yas Island', 'UAE', 'conventional', (now() + interval '31 days')::date, 'scheduled',
   jsonb_build_array(
     jsonb_build_object('label', 'Practice 1', 'date', to_char((now() + interval '29 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:00:00"Z"')),
     jsonb_build_object('label', 'Qualifying', 'date', to_char((now() + interval '30 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:00:00"Z"')),
     jsonb_build_object('label', 'Race', 'date', to_char((now() + interval '31 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:00:00"Z"'))));

insert into races (id, year, round, name, circuit, country, status, race_date, pole_sitter, pole_time_sec) values
  ('2026_r15_azerbaijan-grand-prix', 2026, 15, 'Azerbaijan Grand Prix', 'Baku', 'Azerbaijan', 'completed', '2026-09-27', 'RUS', 101.234),
  ('2026_r16_bahrain-grand-prix', 2026, 16, 'Bahrain Grand Prix', 'Sakhir', 'Bahrain', 'completed', '2026-10-04', 'NOR', 89.876),
  ('2026_r23_abu-dhabi-grand-prix', 2026, 23, 'Abu Dhabi Grand Prix', 'Yas Island', 'UAE', 'upcoming', (now() + interval '31 days')::date, null, null);

insert into race_results (race_id, driver, driver_name, team, grid, finish_position, finish_gap_sec, status, points)
select r.race_id, d.code, d.name, d.team, r.grid, r.pos, r.gap, r.status, r.points
  from (values
    ('2026_r15_azerbaijan-grand-prix', 'RUS', 1, 1, 0, 'finished', 25), ('2026_r15_azerbaijan-grand-prix', 'VER', 3, 2, 2.4, 'finished', 18),
    ('2026_r15_azerbaijan-grand-prix', 'HAD', 2, 3, 5.1, 'finished', 15), ('2026_r15_azerbaijan-grand-prix', 'NOR', 4, 4, 9.8, 'finished', 12),
    ('2026_r15_azerbaijan-grand-prix', 'LEC', 5, 5, 14.0, 'finished', 10), ('2026_r15_azerbaijan-grand-prix', 'HAM', 7, 6, 20.3, 'finished', 8),
    ('2026_r15_azerbaijan-grand-prix', 'ANT', 6, 7, null, 'lapped', 6), ('2026_r15_azerbaijan-grand-prix', 'PIA', 8, 8, null, 'dnf', 0),
    ('2026_r16_bahrain-grand-prix', 'NOR', 1, 1, 0, 'finished', 25), ('2026_r16_bahrain-grand-prix', 'PIA', 2, 2, 1.9, 'finished', 18),
    ('2026_r16_bahrain-grand-prix', 'LEC', 4, 3, 6.2, 'finished', 15), ('2026_r16_bahrain-grand-prix', 'RUS', 3, 4, 8.7, 'finished', 12),
    ('2026_r16_bahrain-grand-prix', 'HAM', 5, 5, 11.5, 'finished', 10), ('2026_r16_bahrain-grand-prix', 'VER', 6, 6, 15.0, 'finished', 8),
    ('2026_r16_bahrain-grand-prix', 'ANT', 8, 7, 22.4, 'finished', 6), ('2026_r16_bahrain-grand-prix', 'HAD', 7, 8, null, 'dnf', 0)
  ) as r (race_id, code, grid, pos, gap, status, points)
  join drivers d on d.code = r.code;
