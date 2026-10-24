-- "Report a problem": what someone saw go wrong, with the page, browser and (optionally) a screenshot it happened
-- on, for the site's admins to work through on the Models page. A screenshot is kept in the row itself as a data URL
-- (under 1 MB, checked by the app) - no bucket to provision, and it goes when the report does.
--
-- Written and read only by the server (the service-role client), like notifications: row level security on, no client
-- policies, no client grants. The notifications kind check gains 'problem_report' (the admins' notice of a new one);
-- every existing row satisfies the new constraint.

set local lock_timeout = '5s';

create table if not exists public.problem_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('broken', 'data', 'suggestion', 'other')),
  description text not null check (char_length(description) between 10 and 2000),
  page text,
  context jsonb not null default '{}'::jsonb,
  screenshot text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);
create index if not exists problem_reports_created_idx on public.problem_reports (created_at desc);

alter table public.problem_reports enable row level security;
revoke all on public.problem_reports from anon, authenticated;
grant all on public.problem_reports to service_role;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'prediction_result', 'new_round', 'reply', 'join_request', 'join_decision', 'post_pending', 'post_moderated', 'role_changed', 'invite',
  'membership', 'photos_ready', 'race_reminder', 'race_results', 'problem_report'
));
