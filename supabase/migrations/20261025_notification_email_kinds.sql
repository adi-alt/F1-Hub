-- Four more kinds of notification, for the emails that were missing (src/lib/notificationKinds.ts):
--   membership    - you were removed or banned from a community, or one you were in was deleted
--   photos_ready  - (site admins) new race photos are waiting to be chosen
--   race_reminder - picks and rounds close at qualifying (people who turned "Before qualifying locks" on)
--   race_results  - how your picks did on a race weekend (people who turned "When results land" on)
-- The check constraint is swapped for one that also allows them; every existing row satisfies it.

set local lock_timeout = '5s';

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'prediction_result', 'new_round', 'reply', 'join_request', 'join_decision', 'post_pending', 'post_moderated', 'role_changed', 'invite',
  'membership', 'photos_ready', 'race_reminder', 'race_results'
));
