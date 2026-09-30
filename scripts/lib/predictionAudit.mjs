// Read-only historical audit of prediction rounds, personal picks and the points ledger
// (M0 Batch 2, decision 2). It REPORTS; it never changes anything - no update, no insert, no delete,
// no payout. What to do about any finding is a separate, human decision (see the correction plan in
// docs/audit/M0_IMPLEMENTATION_STATUS.md).
//
// It must work BEFORE supabase/migrations/20260930_prediction_lifecycle.sql is applied - that is when
// you want the baseline - so it uses only columns that exist on the pre-migration schema and derives
// each round's deadline inline (the same rule as prediction_lock_at(): the start of the weekend's
// MAIN Qualifying session from calendar.sessions; Sprint sessions do not count), reading the race's
// own live calendar row the same way public.race_calendar_sessions() does (20261001_race_identity.sql:
// live over cancelled, then same id, same event, same round). A test asserts the two agree.
//
// Used by scripts/audit-predictions.mjs (real database) and by the test suite (PGlite).

/** CTEs shared by the queries: `lock_times(race_id, lock_at, race_start_at)`. Null = unknown. */
const LOCK_TIMES = String.raw`
sessions as (
  select r.id as race_id,
         lower(e ->> 'label') as label,
         case
           when nullif(btrim(e ->> 'date'), '') ~ '[T ][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'
             then nullif(btrim(e ->> 'date'), '')::timestamptz
           else nullif(btrim(e ->> 'date'), '')::timestamp at time zone 'UTC'
         end as ts
    from races r
    join lateral (
      select c.sessions from calendar c
       where c.year = r.year
         and (c.id = r.id
              or regexp_replace(c.id, '^[0-9]{4}_r[0-9]+_', '') = regexp_replace(r.id, '^[0-9]{4}_r[0-9]+_', '')
              or c.round = r.round)
       order by (c.status is distinct from 'cancelled') desc,
                (c.id = r.id) desc,
                (regexp_replace(c.id, '^[0-9]{4}_r[0-9]+_', '') = regexp_replace(r.id, '^[0-9]{4}_r[0-9]+_', '')) desc
       limit 1
    ) cal on true
    cross join lateral jsonb_array_elements(case when jsonb_typeof(cal.sessions) = 'array' then cal.sessions else '[]'::jsonb end) e
),
lock_times as (
  select race_id,
         min(ts) filter (where label like '%qualif%' and label not like '%sprint%' and label not like '%shootout%') as lock_at,
         min(ts) filter (where label = 'race') as race_start_at
    from sessions
   group by race_id
)`;

/** Exposed so a test can prove this inline rule agrees with prediction_lock_at() / race_start_at(). */
export const LOCK_TIMES_CTE = LOCK_TIMES;

/**
 * Each query returns rows plus a `total` column (window count), so a report can show the first N and
 * still say how many there are. `meaning` says what a finding implies and what it does NOT prove.
 */
export const AUDIT_QUERIES = [
  {
    id: "summary",
    title: "Inventory",
    meaning: "Baseline counts, so every finding below can be read against the whole.",
    sql: `
      select
        (select count(*) from group_predictions)::int as rounds_total,
        (select count(*) from group_predictions where status = 'open')::int as rounds_open,
        (select count(*) from group_predictions where status = 'locked')::int as rounds_locked,
        (select count(*) from group_predictions where status = 'resolved')::int as rounds_resolved,
        (select count(*) from group_prediction_entries)::int as entries_total,
        (select count(*) from picks)::int as picks_total,
        (select count(*) from points_transactions)::int as ledger_rows,
        1 as total`,
  },
  {
    id: "unknown_deadline",
    title: "Rounds whose deadline cannot be determined",
    meaning:
      "The race has no calendar row, or its schedule has no main Qualifying session. After the lifecycle migration these rounds fail CLOSED (cannot take entries). Each needs its calendar row fixed or an explicit decision.",
    sql: `
      with ${LOCK_TIMES}
      select p.id as prediction_id, p.group_id, p.race_id, p.status, p.created_at, count(*) over ()::int as total
        from group_predictions p left join lock_times l on l.race_id = p.race_id
       where l.lock_at is null
       order by p.created_at desc`,
  },
  {
    id: "open_past_deadline",
    title: "Rounds still 'open' although their deadline has passed",
    meaning:
      "Under the old code nothing ever locked a round, so this is expected for every round awaiting resolution. After the migration the scheduled lock moves these to 'locked'; no points or answers change.",
    sql: `
      with ${LOCK_TIMES}
      select p.id as prediction_id, p.group_id, p.race_id, l.lock_at, p.created_at, count(*) over ()::int as total
        from group_predictions p join lock_times l on l.race_id = p.race_id
       where p.status = 'open' and l.lock_at <= now()
       order by l.lock_at desc`,
  },
  {
    id: "unresolved_after_race",
    title: "Rounds not resolved although their race has finished",
    meaning: "Stuck rounds: entrants are waiting on a payout. There is no void/refund path yet (roadmap follow-up), so these need an admin to resolve them.",
    sql: `
      select p.id as prediction_id, p.group_id, p.race_id, p.status, r.results_source, count(*) over ()::int as total
        from group_predictions p join races r on r.id = p.race_id
       where p.status <> 'resolved' and r.status = 'completed'
       order by p.created_at`,
  },
  {
    id: "rounds_created_after_deadline",
    title: "Rounds created after their own deadline",
    meaning: "The old code let an admin open a round after qualifying had begun, when the grid was already known.",
    sql: `
      with ${LOCK_TIMES}
      select p.id as prediction_id, p.group_id, p.race_id, p.created_at, l.lock_at,
             round(extract(epoch from (p.created_at - l.lock_at)) / 60)::int as minutes_after_deadline, count(*) over ()::int as total
        from group_predictions p join lock_times l on l.race_id = p.race_id
       where p.created_at >= l.lock_at
       order by p.created_at desc`,
  },
  {
    id: "post_cutoff_entries",
    title: "Entries created at or after the deadline (the exploit window)",
    meaning:
      "The entry row was created when the deadline had already passed. Rows in a RESOLVED round with points_awarded > 0 are the ones that may have been paid because of it. LIMITATION: an EDIT of an existing entry after the deadline leaves no trace before the lifecycle migration (entries had no updated_at), so this list is a lower bound.",
    sql: `
      with ${LOCK_TIMES}
      select e.prediction_id, p.group_id, p.race_id, e.user_id, e.created_at as entered_at, l.lock_at,
             round(extract(epoch from (e.created_at - l.lock_at)) / 60)::int as minutes_after_deadline,
             p.status as round_status, e.points_wagered, e.points_awarded, count(*) over ()::int as total
        from group_prediction_entries e
        join group_predictions p on p.id = e.prediction_id
        join lock_times l on l.race_id = p.race_id
       where e.created_at >= l.lock_at
       order by (coalesce(e.points_awarded, 0) > 0) desc, e.created_at desc`,
  },
  {
    id: "duplicate_ledger_rows",
    title: "More than one payout (or entry charge) recorded for the same round and user",
    meaning:
      "The direct evidence of a double payout. Each row is one (round, user, reason) with more than one ledger line; `extra` is the amount beyond the first. The lifecycle migration adds a unique index that stops this for NEW rows only, deliberately excluding history so it cannot fail on these.",
    sql: `
      select prediction_id, user_id, reason, count(*)::int as rows, sum(amount)::int as total_amount,
             (sum(amount) - min(amount))::int as extra, min(created_at) as first_at, max(created_at) as last_at, count(*) over ()::int as total
        from points_transactions
       where prediction_id is not null and reason in ('prediction_payout', 'prediction_entry')
       group by prediction_id, user_id, reason
      having count(*) > 1
       order by count(*) desc, max(created_at) desc`,
  },
  {
    id: "payout_ledger_mismatch",
    title: "Entries whose recorded award differs from what the ledger paid",
    meaning:
      "points_awarded says one thing, the ledger another. awarded > paid means a winner was marked but never (fully) credited - the signature of the old resolve loop failing part-way (it set points_awarded BEFORE crediting). paid > awarded means the ledger paid more than the entry claims.",
    sql: `
      select e.prediction_id, p.group_id, e.user_id, e.points_awarded, coalesce(t.paid, 0)::int as ledger_paid,
             (coalesce(e.points_awarded, 0) - coalesce(t.paid, 0))::int as awarded_minus_paid, p.status as round_status, count(*) over ()::int as total
        from group_prediction_entries e
        join group_predictions p on p.id = e.prediction_id
        left join (select prediction_id, user_id, sum(amount) as paid from points_transactions where reason = 'prediction_payout' and prediction_id is not null group by 1, 2) t
               on t.prediction_id = e.prediction_id and t.user_id = e.user_id
       where coalesce(e.points_awarded, 0) <> coalesce(t.paid, 0)
       order by abs(coalesce(e.points_awarded, 0) - coalesce(t.paid, 0)) desc`,
  },
  {
    id: "orphan_payouts",
    title: "Payout ledger rows with no matching entry",
    meaning: "Points were credited for a round the user has no entry in (or the entry was deleted with its round/group).",
    sql: `
      select t.prediction_id, t.user_id, sum(t.amount)::int as paid, count(*) over ()::int as total
        from points_transactions t
        left join group_prediction_entries e on e.prediction_id = t.prediction_id and e.user_id = t.user_id
       where t.reason = 'prediction_payout' and t.prediction_id is not null and e.prediction_id is null
       group by t.prediction_id, t.user_id`,
  },
  {
    id: "entry_charge_mismatch",
    title: "Entries whose fee is not reflected in the ledger",
    meaning:
      "points_wagered > 0 but the ledger's entry charge for that (round, user) is missing or different. Expected for very old rows if the ledger post-dates them; otherwise a fee that was taken with no record (or a record with no fee).",
    sql: `
      select e.prediction_id, e.user_id, e.points_wagered, coalesce(-t.charged, 0)::int as ledger_charged, e.created_at, count(*) over ()::int as total
        from group_prediction_entries e
        left join (select prediction_id, user_id, sum(amount) as charged from points_transactions where reason = 'prediction_entry' and prediction_id is not null group by 1, 2) t
               on t.prediction_id = e.prediction_id and t.user_id = e.user_id
       where e.points_wagered > 0 and coalesce(-t.charged, 0) <> e.points_wagered
       order by e.created_at desc`,
  },
  {
    id: "partial_settlement",
    title: "Unresolved rounds that already have awarded entries (half-settled)",
    meaning:
      "The old resolve loop died part-way: some entries scored, the round never marked resolved. A retry with the OLD code would have paid the scored entries again. The new settle_prediction skips already-awarded entries, so a retry is safe - but these rounds are the ones a human should look at first.",
    sql: `
      select p.id as prediction_id, p.group_id, p.race_id, p.status,
             count(*) filter (where e.points_awarded is not null)::int as awarded_entries, count(*)::int as entries, count(*) over ()::int as total
        from group_predictions p join group_prediction_entries e on e.prediction_id = p.id
       where p.status <> 'resolved'
       group by p.id
      having count(*) filter (where e.points_awarded is not null) > 0
       order by p.created_at`,
  },
  {
    id: "resolved_unscored_entries",
    title: "Resolved rounds with entries that were never scored",
    meaning: "The round says resolved but some entrants have no points_awarded - they may be owed a payout (or a recorded 0).",
    sql: `
      select p.id as prediction_id, p.group_id, p.race_id,
             count(*) filter (where e.points_awarded is null)::int as unscored_entries, count(*)::int as entries, count(*) over ()::int as total
        from group_predictions p join group_prediction_entries e on e.prediction_id = p.id
       where p.status = 'resolved'
       group by p.id
      having count(*) filter (where e.points_awarded is null) > 0
       order by p.created_at`,
  },
  {
    id: "resolved_on_preliminary",
    title: "Resolved rounds whose race results are still preliminary",
    meaning:
      "Payouts were computed from OpenF1 preliminary classifications, which the official result can later change. The results source AT resolution was not recorded before the migration, so this shows the CURRENT source; a round resolved early may since have been upgraded to official. Review those whose official result differs.",
    sql: `
      select p.id as prediction_id, p.group_id, p.race_id, r.results_source, p.resolved_at, count(*) over ()::int as total
        from group_predictions p join races r on r.id = p.race_id
       where p.status = 'resolved' and r.results_source <> 'official'
       order by p.resolved_at desc`,
  },
  {
    id: "balance_vs_ledger",
    title: "Users whose points balance is not 100 + the ledger's net",
    meaning:
      "Every profile starts at 100 and nothing writes a starting-grant row, so balance should equal 100 plus the ledger's sum. A difference means a balance changed without a ledger row (or vice versa): a direct edit, or a failure between the old balance update and its ledger insert.",
    sql: `
      select p.id as user_id, p.points_balance, (100 + coalesce(t.net, 0))::int as expected, (p.points_balance - (100 + coalesce(t.net, 0)))::int as difference, count(*) over ()::int as total
        from profiles p left join (select user_id, sum(amount) as net from points_transactions group by 1) t on t.user_id = p.id
       where p.points_balance <> 100 + coalesce(t.net, 0)
       order by abs(p.points_balance - (100 + coalesce(t.net, 0))) desc`,
  },
  {
    id: "picks_after_race_start",
    title: "Personal picks stamped after the race started",
    meaning:
      "submitted_at is at or after the start of the calendar's Race session. LIMITATION: before the migration submitted_at was CLIENT-supplied, so a forged timestamp would hide a late pick - treat this as a lower bound. These picks feed group_race_scores and the community leaderboard.",
    sql: `
      with ${LOCK_TIMES}
      select k.user_id, k.race_id, k.submitted_at, l.race_start_at,
             round(extract(epoch from (k.submitted_at - l.race_start_at)) / 60)::int as minutes_after_start, count(*) over ()::int as total
        from picks k join lock_times l on l.race_id = k.race_id
       where k.submitted_at >= l.race_start_at
       order by k.submitted_at desc`,
  },
];

/** Runs every query through `query(sql) -> { rows }` and returns `{ id, title, meaning, total, rows }[]`. */
export async function runPredictionAudit(query, { limit = 200 } = {}) {
  const results = [];
  for (const q of AUDIT_QUERIES) {
    const { rows } = await query(q.sql);
    const total = rows.length ? Number(rows[0].total) : 0;
    const kept = rows.slice(0, limit).map((row) => {
      const copy = { ...row };
      delete copy.total; // the window count, already reported as `total`
      return copy;
    });
    results.push({ id: q.id, title: q.title, meaning: q.meaning, total, rows: kept });
  }
  return results;
}

/** Findings whose existence suggests points may have moved wrongly (as opposed to housekeeping). */
export const MONEY_RELEVANT = new Set(["post_cutoff_entries", "duplicate_ledger_rows", "payout_ledger_mismatch", "orphan_payouts", "entry_charge_mismatch", "balance_vs_ledger", "resolved_unscored_entries"]);

const cell = (v) => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? "-" : String(v));

export function formatReport(results, { showRows = 15 } = {}) {
  const lines = [];
  lines.push("PREDICTION HISTORY AUDIT (read-only: nothing was changed)");
  lines.push("");
  const summary = results.find((r) => r.id === "summary")?.rows[0];
  if (summary) lines.push(`Inventory: ${Object.entries(summary).map(([k, v]) => `${k}=${v}`).join("  ")}`, "");
  lines.push("Findings (0 = nothing found):");
  for (const r of results.filter((x) => x.id !== "summary")) {
    lines.push(`  ${String(r.total).padStart(5)}  ${MONEY_RELEVANT.has(r.id) ? "[points] " : "         "}${r.title}`);
  }
  for (const r of results.filter((x) => x.id !== "summary" && x.total > 0)) {
    lines.push("", `── ${r.title}  (${r.total})`, `   ${r.meaning}`);
    const keys = Object.keys(r.rows[0] ?? {});
    for (const row of r.rows.slice(0, showRows)) lines.push("   " + keys.map((k) => `${k}=${cell(row[k])}`).join("  "));
    if (r.total > Math.min(showRows, r.rows.length)) lines.push(`   … ${r.total - Math.min(showRows, r.rows.length)} more (run with --json for all)`);
  }
  lines.push("", "Nothing above has been corrected. See docs/audit/M0_IMPLEMENTATION_STATUS.md for the proposed correction plan.");
  return lines.join("\n");
}
