-- The 2026 calendar's Bahrain Grand Prix (round 16) row has circuit = 'Kuala Lumpur' - a real
-- upstream data error (Kuala Lumpur/Sepang was the Malaysian GP venue, off the calendar since
-- 2017; Bahrain has always raced at Sakhir). Every other Bahrain GP in this database, 2016-2025,
-- in both `races` and `archive_races`, uses 'Sakhir' - confirmed against all of them before
-- writing this, not assumed. The WHERE clause pins the exact wrong value so this can never
-- overwrite a different, already-correct row if it's re-run after a manual fix.
update calendar
   set circuit = 'Sakhir'
 where year = 2026
   and round = 16
   and circuit = 'Kuala Lumpur';
