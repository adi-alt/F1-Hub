"""Scores every group member's podium pick against a race's real result, once that result exists
- the group-competition layer on top of the personal "X/3 hits" stat PickPanel.tsx already shows
a single user (src/components/race/PickPanel.tsx). Writes `group_race_scores`
(supabase/schema.sql), which had score/rank columns sitting unused until this script existed to
fill them.

Scoring formula (decided here, not left to the frontend to reinvent):
  - a driver predicted in the *exact* slot they actually finished (P1 pick who actually finished
    P1, etc.) scores 3 points for that slot
  - a driver who's *somewhere* in the real top 3, just not the slot picked, scores 1 point - the
    same "loose" hit PickPanel already counts, just weighted: exact position is the harder, more
    valuable call, so it's worth 3x a loose one, not tallied the same
  - anyone else scores 0
  - max 9/race (every slot exact). `breakdown` records which of the 3 outcomes applied per slot,
    e.g. {"p1": "exact", "p2": "podium", "p3": "miss"}.
`rank` is standard competition rank within (group, race) - ties share a rank and the next distinct
score skips ahead accordingly (1, 1, 3 — never 1, 1, 2).

No FastF1/Ergast dependency (pure arithmetic over rows fetch_races.py already wrote) and no rate
limit to respect, unlike every other script in this directory — that's why this always recomputes
every completed race for every group rather than tracking "already scored": it's one query's worth
of arithmetic, not an external API call, and it's the only way a brand-new group's members'
older picks ever get scored (there's no other event that would trigger it for them).

Run:
  export DATABASE_URL='<the pooled connection string, see .env.local>'
  python pipeline/compute_group_scores.py
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from ergast_utils import init_postgres, upsert
from run_ledger import ledgered

SLOTS = ("p1", "p2", "p3")


POLE_POINTS = 3
FASTEST_LAP_POINTS = 2
TOP5_POINTS_EACH = 1
SAFETY_CAR_POINTS = 2
MARGIN_POINTS = 2


def margin_bucket(gap_sec: float) -> str:
    """P2's gap to the winner -> the bucket a pick names (20261011_pick_categories.sql)."""
    if gap_sec < 2:
        return "under_2"
    if gap_sec < 5:
        return "2_5"
    if gap_sec < 10:
        return "5_10"
    return "over_10"


def score_pick(predicted_podium: list[str], actual_top3: dict[int, str], extras: dict | None = None, actual: dict | None = None) -> tuple[int, dict]:
    """Podium: 3 per exact slot, 1 for a podium driver in the wrong slot. The optional categories
    (20261011_pick_categories.sql) score only when picked AND the real answer is known: pole 3, fastest lap 2,
    top five 1 per driver who finished in the top five (any order). `extras` = the pick's pole/fastest_lap/top5,
    `actual` = the race's pole/fastest_lap/top5."""
    extras, actual = extras or {}, actual or {}
    actual_drivers = set(actual_top3.values())
    score = 0
    breakdown = {}
    for i, slot in enumerate(SLOTS, start=1):
        pick = predicted_podium[i - 1]
        if actual_top3.get(i) == pick:
            score += 3
            breakdown[slot] = "exact"
        elif pick in actual_drivers:
            score += 1
            breakdown[slot] = "podium"
        else:
            breakdown[slot] = "miss"
    if extras.get("pole") and actual.get("pole"):
        hit = extras["pole"] == actual["pole"]
        score += POLE_POINTS if hit else 0
        breakdown["pole"] = "exact" if hit else "miss"
    if extras.get("fastest_lap") and actual.get("fastest_lap"):
        hit = extras["fastest_lap"] == actual["fastest_lap"]
        score += FASTEST_LAP_POINTS if hit else 0
        breakdown["fastest_lap"] = "exact" if hit else "miss"
    if extras.get("top5") and actual.get("top5"):
        hits = len(set(extras["top5"]) & set(actual["top5"]))
        score += hits * TOP5_POINTS_EACH
        breakdown["top5"] = hits
    if extras.get("safety_car") is not None and actual.get("safety_car") is not None:
        hit = extras["safety_car"] == actual["safety_car"]
        score += SAFETY_CAR_POINTS if hit else 0
        breakdown["safety_car"] = "exact" if hit else "miss"
    if extras.get("margin") and actual.get("margin"):
        hit = extras["margin"] == actual["margin"]
        score += MARGIN_POINTS if hit else 0
        breakdown["margin"] = "exact" if hit else "miss"
    return score, breakdown


def compute_all(cur) -> list[dict]:
    cur.execute("select id from races where status = 'completed'")
    completed_race_ids = [r[0] for r in cur.fetchall()]
    if not completed_race_ids:
        return []

    cur.execute(
        "select race_id, finish_position, driver, status, fastest_lap_sec, finish_gap_sec from race_results where race_id = any(%s)",
        (completed_race_ids,),
    )
    top3_by_race: dict[str, dict[int, str]] = {}
    actual_by_race: dict[str, dict] = {}
    best_lap: dict[str, tuple[float, str]] = {}
    for race_id, position, driver, status, lap, gap in cur.fetchall():
        if position == 2 and status == "finished" and gap is not None:
            actual_by_race.setdefault(race_id, {})["margin"] = margin_bucket(float(gap))
        if position <= 3:
            top3_by_race.setdefault(race_id, {})[position] = driver
        if position <= 5 and status != "dnf":
            actual_by_race.setdefault(race_id, {}).setdefault("top5", []).append(driver)
        if lap is not None and (race_id not in best_lap or float(lap) < best_lap[race_id][0]):
            best_lap[race_id] = (float(lap), driver)
    for race_id, (_, driver) in best_lap.items():
        actual_by_race.setdefault(race_id, {})["fastest_lap"] = driver
    cur.execute("select id, pole_sitter, safety_car_periods from races where id = any(%s)", (completed_race_ids,))
    for race_id, pole, sc_periods in cur.fetchall():
        if pole:
            actual_by_race.setdefault(race_id, {})["pole"] = pole
        if sc_periods is not None:
            actual_by_race.setdefault(race_id, {})["safety_car"] = sc_periods > 0
    for actual in actual_by_race.values():
        if len(actual.get("top5", [])) < 5:
            actual.pop("top5", None)  # an incomplete classification can't score a top five

    cur.execute(
        "select gm.group_id, p.race_id, p.user_id, p.predicted_podium, p.predicted_pole, p.predicted_fastest_lap, p.predicted_top5, "
        "p.predicted_safety_car, p.predicted_margin "
        "from group_members gm join picks p on p.user_id = gm.user_id "
        "where p.race_id = any(%s)",
        (completed_race_ids,),
    )
    members_by_group_race: dict[tuple[str, str], list[tuple[str, list[str], dict]]] = {}
    for group_id, race_id, user_id, predicted_podium, pole, fastest_lap, top5, safety_car, margin in cur.fetchall():
        extras = {"pole": pole, "fastest_lap": fastest_lap, "top5": top5, "safety_car": safety_car, "margin": margin}
        members_by_group_race.setdefault((group_id, race_id), []).append((user_id, predicted_podium, extras))

    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for (group_id, race_id), members in members_by_group_race.items():
        actual_top3 = top3_by_race.get(race_id)
        if not actual_top3:
            # Completed but no classified top-3 recorded — nothing to score against yet.
            continue

        actual = actual_by_race.get(race_id, {})
        scored = [(user_id, *score_pick(predicted_podium, actual_top3, extras, actual)) for user_id, predicted_podium, extras in members]
        scored.sort(key=lambda row: -row[1])

        rank, prev_score = 0, None
        for position, (user_id, score, breakdown) in enumerate(scored, start=1):
            if score != prev_score:
                rank = position
            prev_score = score
            rows.append(
                {
                    "group_id": group_id,
                    "race_id": race_id,
                    "user_id": user_id,
                    "score": score,
                    "rank": rank,
                    "breakdown": json.dumps(breakdown),
                    "computed_at": now,
                }
            )
    return rows


@ledgered("group-scores")
def main():
    conn = init_postgres()
    with conn.cursor() as cur:
        rows = compute_all(cur)
        # computed_at is left out of the comparison: it is rewritten only along with a real change, so a
        # tick that finds the same scores writes nothing instead of re-stamping every row.
        upsert(cur, "group_race_scores", rows, ["group_id", "race_id", "user_id"], skip_unchanged=True, unchanged_ignore=("computed_at",))
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
