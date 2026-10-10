// Every table in `public`, classified (audit R-27). The nightly backup includes the IRREPLACEABLE ones and
// REFUSES TO RUN if the database has a table that is in none of the three lists, so a new user table can
// never be silently left out of the backups: whoever adds it has to say what it is.

/** Cannot be rebuilt from anywhere else: user accounts' data, community content, picks, points, and the
 * frozen model predictions (a prediction made before a race can't be regenerated afterwards). */
export const IRREPLACEABLE = [
  "profiles",
  "groups",
  "group_members",
  "group_posts",
  "group_post_comments",
  "group_post_votes",
  "group_comment_votes",
  "group_join_requests",
  "group_invites",
  "group_invite_redemptions",
  "group_bans",
  "group_predictions",
  "group_prediction_entries",
  "group_race_scores",
  "picks",
  "points_transactions",
  "user_invites",
  "races",
  // A person chose these photos; the candidates they were chosen from can be found again.
  "race_photos",
  "model_benchmarks",
  "schema_migrations",
];

/** Public F1 facts the pipeline can fetch again (FastF1, OpenF1, Jolpica, Ergast, Wikimedia). */
export const REBUILDABLE = [
  "data_version",
  "calendar",
  "drivers",
  "teams",
  "race_inputs",
  "race_results",
  "race_laps",
  "tire_stints",
  "sprint_results",
  "archive_circuits",
  "archive_drivers",
  "archive_teams",
  "archive_races",
  "archive_results",
  "archive_qualifying",
  "archive_pit_stops",
  "archive_laps",
  "race_photo_candidates",
  // Derived from F1's live-timing archive by pipeline/race_track_story.py; rebuilt by its --backfill.
  "race_track_stories",
];

/** Short-lived or regenerable, and some of it sensitive (one-time codes): deliberately not backed up. */
export const EPHEMERAL = ["otp_codes", "ai_cache", "rate_limits", "pipeline_runs"];

/** Supabase Auth's own tables, backed up from the auth schema (accounts and sign-in methods). */
export const AUTH_TABLES = ["users", "identities"];

/** Tables present in the database that no list accounts for. */
export function unclassified(existing) {
  const known = new Set([...IRREPLACEABLE, ...REBUILDABLE, ...EPHEMERAL]);
  return existing.filter((t) => !known.has(t)).sort();
}
