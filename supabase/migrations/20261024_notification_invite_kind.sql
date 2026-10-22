-- Notifications learn one more kind: 'invite', the site notice someone with an account gets when they're invited to a
-- community by email (lib/notificationEvents.ts notifyInvited). The check constraint is swapped for one that also
-- allows it; every existing row already satisfies the new one. Until this runs, the invitation email still goes and
-- only the bell notice is skipped (notify logs and swallows the insert error).

set local lock_timeout = '5s';

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'prediction_result', 'new_round', 'reply', 'join_request', 'join_decision', 'post_pending', 'post_moderated', 'role_changed', 'invite'
));
