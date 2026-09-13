-- One-off data backfill: give the communities that existed before `topic` was introduced a real
-- topic, so Discover's topic filter isn't a dead control on the day it ships.
--
-- NOT idempotent by design, which is exactly why the migration ledger in
-- scripts/apply-migration.mjs exists: re-running this would re-set a topic an admin had
-- deliberately cleared. The runner records it and skips it on a second run.
--
-- Every community this touches is a Formula 1 community by name and by community_type (all six were
-- backfilled to 'f1' by 20260911_communities.sql), so "Formula 1" is an accurate label rather than
-- a guess. Any admin can change it from Manage > General.
update groups
set topic = 'Formula 1'
where topic is null
  and community_type = 'f1';
