-- Each person's time zone (an IANA name such as "Asia/Kolkata"), so emails can say when something happens in
-- their own time - "Qualifying starts Sat 25 Oct, 23:00" - instead of "in 3 hours". The browser reports it
-- (AuthProvider, through /api/users/me), the app validates it, and the email falls back to UTC while it's unknown.
-- One nullable column; nothing existing changes.

set local lock_timeout = '5s';

alter table public.profiles add column if not exists time_zone text;
