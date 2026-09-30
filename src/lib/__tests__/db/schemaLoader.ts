// Loads the repo's real supabase/schema.sql + migrations into a database, behind a small shim for
// the Supabase-provided pieces the schema expects (auth.users, auth.uid(), the anon / authenticated /
// service_role roles, storage.buckets, the realtime publication, pg_cron). Shared by the in-process
// PGlite suites (testDb.ts) and the real-Postgres concurrency suite (concurrency.pg.test.ts), so both
// test exactly the same schema.
//
// After loading it applies Supabase's default grants - every table in public granted to anon and
// authenticated - because that is the worst case a live project starts from; the migrations' policies
// and revokes are what have to hold on top of it.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../../..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase/migrations");

// Migrations written before 2026-09-29 were applied by hand and folded back into schema.sql, so
// replaying them over schema.sql can hit "already exists"; those are tolerated. Everything from
// M0 onwards must apply cleanly on top of the schema.
const FIRST_STRICT_MIGRATION = "20260929";
// pg_cron isn't available in the test databases; the shim's cron.schedule() stands in for it.
const SKIP = new Set(["20260918_publish_scheduled_posts_cron.sql"]);

// Roles are cluster-wide in a real Postgres (they survive between test databases), so they are
// created only if missing; everything else lives in the fresh database being loaded.
const SHIM = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create publication supabase_realtime;
create schema cron;
create table cron.job (jobid serial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql
  as $$ insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
        on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
create function cron.unschedule(job_name text) returns boolean language sql
  as $$ delete from cron.job where jobname = job_name returning true $$;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase's own default privileges: every table/sequence/function created later in public is
-- granted to the API roles, service_role included (this is what makes a NEW table usable by the
-- server without an explicit grant, and why migrations must revoke what clients must not have).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

const SUPABASE_DEFAULT_GRANTS = `
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
`;

/** `exec` runs a multi-statement SQL string. `upTo` (exclusive) stops before a migration, e.g. to
 * reproduce a vulnerability as it stood before its fix. */
export async function loadAppSchema(exec: (sql: string) => Promise<unknown>, opts: { upTo?: string } = {}): Promise<void> {
  await exec(SHIM);
  await exec(fs.readFileSync(path.join(ROOT, "supabase/schema.sql"), "utf8"));

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  let defaultsApplied = false;
  for (const file of files) {
    if (SKIP.has(file)) continue;
    if (opts.upTo && file >= opts.upTo) break;
    const strict = file >= FIRST_STRICT_MIGRATION;
    if (strict && !defaultsApplied) {
      await exec(SUPABASE_DEFAULT_GRANTS);
      defaultsApplied = true;
    }
    try {
      await exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
    } catch (err) {
      if (strict) throw new Error(`${file} failed to apply: ${(err as Error).message}`);
    }
  }
  if (!defaultsApplied) await exec(SUPABASE_DEFAULT_GRANTS);
}
