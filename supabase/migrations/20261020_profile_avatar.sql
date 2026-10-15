-- Each member's profile photo, so posts, comments and member lists can show a real picture instead of initials.
-- Until now the only photo the app had was the signed-in viewer's own (session.photoURL, from the sign-in
-- provider's user_metadata.avatar_url), so every other author rendered as letters.
--
-- Filled here from the same source for everyone who already has one (auth.users.raw_user_meta_data.avatar_url,
-- https only), and kept current at each sign-in by lib/session/createSession.ts. Read by the app with the service
-- role, like the rest of profiles; no policy changes. One nullable column - nothing that exists today changes shape.

set local lock_timeout = '5s';

alter table public.profiles add column if not exists avatar_url text;

update public.profiles p
set avatar_url = u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
where u.id = p.id
  and p.avatar_url is null
  and (u.raw_user_meta_data ->> 'avatar_url') like 'https://%';
