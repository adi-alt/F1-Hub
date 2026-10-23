-- Notification email retries (audit R-51). A notification that should also be emailed records what the email shows
-- (email_payload, set when the row is written); emailed_at stays null until a send succeeds. The hourly
-- /api/cron/emails job retries rows still unsent, a bounded number of times with backoff, and every failure is
-- recorded here (attempt count, last error, when to try next) instead of only in the function log.
--
-- Server-only table (see 20261022_notifications.sql); new nullable/defaulted columns and one partial index -
-- nothing existing changes, and rows written before this keep email_payload null, so they are never retried.

set local lock_timeout = '5s';

alter table public.notifications
  add column if not exists email_payload jsonb,
  add column if not exists email_attempts integer not null default 0 check (email_attempts >= 0),
  add column if not exists email_last_error text check (email_last_error is null or char_length(email_last_error) <= 1000),
  add column if not exists email_next_attempt_at timestamptz;

create index if not exists notifications_email_retry_idx on public.notifications (email_next_attempt_at)
  where email_payload is not null and emailed_at is null;
