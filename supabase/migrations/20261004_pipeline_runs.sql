-- A ledger of pipeline runs (audit R-13, DATA-16): each job records when it started, how it ended and
-- what it touched, so "did the pipeline run, and when did it last succeed?" has an answer that doesn't
-- depend on scrolling GitHub's run history. /api/health reads it; the heartbeat alert reads /api/health.
--
-- Internal, like otp_codes: RLS on with no policies and no client grants, so only the server (service
-- role) can read or write it.
create table if not exists pipeline_runs (
  id bigint generated always as identity primary key,
  job text not null,
  status text not null check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  race_id text,
  detail jsonb
);

create index if not exists pipeline_runs_job_started_idx on pipeline_runs (job, started_at desc);

alter table pipeline_runs enable row level security;
revoke all on table pipeline_runs from anon, authenticated;
