-- Real attachment metadata alongside the existing `media_url`.
--
-- Until now a post stored one thing: the public URL of the uploaded object. The display filename
-- was therefore derived from that URL, which is a storage path keyed by a random UUID - so a post
-- showed "63fa18c3-....pdf" instead of the file the person actually attached. The original name
-- was never wrong, it was never kept.
--
-- Columns rather than an attachments table on purpose: a post carries exactly ONE attachment
-- today (media_url is singular, and every query, type and component in the app is built on that
-- cardinality). A join table would model a many-relationship the product doesn't have yet, and
-- would touch every post query to add it. These columns describe the one attachment honestly; if
-- multiple attachments per post ever land, that is the migration that should introduce the table.
--
-- All nullable and additive: existing posts keep working and simply report no metadata, which the
-- UI treats as "unknown" and falls back on rather than guessing.
alter table group_posts add column if not exists media_name text;
alter table group_posts add column if not exists media_mime text;
alter table group_posts add column if not exists media_size bigint;
-- A generated first-page/frame image. Null means "no preview" - render the typed card instead.
alter table group_posts add column if not exists media_thumb_url text;
-- PDFs only, and only when it could actually be read off the file.
alter table group_posts add column if not exists media_pages integer;
