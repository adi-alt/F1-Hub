-- One realtime signal for "the app's cached data just changed" (audit R-19, DATA-10).
--
-- Browsers used to subscribe to row changes on races/calendar/drivers/teams and refresh on each one. The
-- pipeline writes those rows first and busts the server's cache only when the whole run finishes, so the
-- refresh landed on the old cache and nothing prompted another: an open tab stayed on stale data.
-- The pipeline now bumps a row here AFTER the cache bust, and the browser refreshes on that single event.
--
-- Public read like the tables it stands for; only the service role writes. Rebuildable: the rows are
-- counters, recreated by the inserts below.
create table if not exists data_version (
  tag text primary key,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into data_version (tag) values ('races'), ('calendar'), ('media') on conflict (tag) do nothing;

alter table data_version enable row level security;
drop policy if exists "public read" on data_version;
create policy "public read" on data_version for select using (true);
revoke insert, update, delete on table data_version from anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'data_version') then
    alter publication supabase_realtime add table data_version;
  end if;
end $$;
