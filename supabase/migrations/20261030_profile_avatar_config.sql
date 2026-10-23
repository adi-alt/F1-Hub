-- Each member's built avatar: a helmet or a cartoon face, stored as a few option ids and palette colours
-- (lib/avatar.ts) and drawn as SVG in the app. Replaces showing sign-in provider photos; profiles.avatar_url stays
-- in place, unused. Written only through PATCH /api/users/me, which validates it with zod first. Read with the service
-- role, like the rest of profiles; no policy changes. One nullable column - null draws the default helmet.

set local lock_timeout = '5s';

alter table public.profiles add column if not exists avatar jsonb;
