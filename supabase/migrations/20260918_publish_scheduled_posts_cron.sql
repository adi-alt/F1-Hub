-- Publish scheduled posts from inside Postgres, via pg_cron, instead of a Vercel cron hitting an
-- HTTP route.
--
-- Why this is the better home for it:
--   * No plan ceiling. Vercel's Hobby tier caps crons at once per day and REJECTS the deployment
--     outright if you declare anything finer - which is exactly what stalled production on one
--     commit while two later ones sat on main. pg_cron has no such limit, so this runs every
--     minute and a post scheduled for 19:30 actually goes out at 19:30.
--   * No HTTP hop, no shared secret, no publicly reachable endpoint to protect. The work is a
--     single UPDATE against a table in the same database, so there is nothing in between to
--     authenticate, time out, or cold-start.
--   * Not coupled to deployments. The schedule lives with the data it operates on; shipping the
--     app can no longer break it, and it keeps running if the app is rolled back.
--
-- The statement is the same one the application service ran, and is idempotent for the same
-- reason: it is filtered on status = 'scheduled', so a run that overlaps another (or fires while a
-- post is being published by any other path) matches nothing already published. It can never
-- double-publish, reorder, or touch a post in any other state.

create extension if not exists pg_cron;

-- Re-runnable: unschedule the previous definition first, but only if one exists (cron.unschedule
-- raises when the job is absent, which would abort the whole migration on a first run).
select cron.unschedule('publish-scheduled-posts')
where exists (select 1 from cron.job where jobname = 'publish-scheduled-posts');

select cron.schedule(
  'publish-scheduled-posts',
  '* * * * *',
  $$
    update group_posts
       set status = 'published'
     where status = 'scheduled'
       and scheduled_at <= now()
  $$
);
