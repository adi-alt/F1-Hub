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

import json
from datetime import datetime, timezone

from ergast_utils import init_postgres, upsert

SLOTS = ("p1", "p2", "p3")


def score_pick(predicted_podium: list[str], actual_top3: dict[int, str]) -> tuple[int, dict]:
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
    return score, breakdown


def compute_all(cur) -> list[dict]:
    cur.execute("select id from races where status = 'completed'")
    completed_race_ids = [r[0] for r in cur.fetchall()]
    if not completed_race_ids:
        return []

    cur.execute(
        "select race_id, finish_position, driver from race_results where finish_position <= 3"
    )
    top3_by_race: dict[str, dict[int, str]] = {}
    for race_id, position, driver in cur.fetchall():
        top3_by_race.setdefault(race_id, {})[position] = driver

    cur.execute(
        "select gm.group_id, p.race_id, p.user_id, p.predicted_podium "
        "from group_members gm join picks p on p.user_id = gm.user_id "
        "where p.race_id = any(%s)",
        (completed_race_ids,),
    )
    members_by_group_race: dict[tuple[str, str], list[tuple[str, list[str]]]] = {}
    for group_id, race_id, user_id, predicted_podium in cur.fetchall():
        members_by_group_race.setdefault((group_id, race_id), []).append((user_id, predicted_podium))

    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for (group_id, race_id), members in members_by_group_race.items():
        actual_top3 = top3_by_race.get(race_id)
        if not actual_top3:
            # Completed but no classified top-3 recorded — nothing to score against yet.
            continue

        scored = [(user_id, *score_pick(predicted_podium, actual_top3)) for user_id, predicted_podium in members]
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


def main():
    conn = init_postgres()
    with conn.cursor() as cur:
        rows = compute_all(cur)
        upsert(cur, "group_race_scores", rows, ["group_id", "race_id", "user_id"])
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
