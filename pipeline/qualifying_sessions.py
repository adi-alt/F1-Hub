"""Full qualifying classifications: Grand Prix qualifying (Q1/Q2/Q3) and sprint qualifying (SQ1/SQ2/SQ3), stage by
stage, for `qualifying_results`.

Before this, a round kept only each driver's qualifying position and one "gap to pole" (race_inputs) - built from the
best lap of whichever stage the driver last reached, so a Q1 lap was compared with a Q3 pole on a faster track.
These rows keep each stage's own best lap, so stage-by-stage comparisons (and the race page's Q1/Q2/Q3 view) are
like for like.

Sources, in order:
- Grand Prix qualifying: Jolpica's official classification (Q1/Q2/Q3 times) once published, else OpenF1's timing
  result right after the session (`source='openf1'`), replaced by the official one later.
- Sprint qualifying: OpenF1 only. Jolpica has no sprint-qualifying endpoint, so these rows stay `source='openf1'`
  (F1's timing feed, not the FIA's published classification) and the UI says so.

Nothing is invented: a stage a driver didn't reach, or reached without a valid lap, is null. `stage_reached` comes from
which stage a time exists for (Jolpica: which stage keys exist for the driver), never from position arithmetic -
the number of cars knocked out per stage has changed between seasons.
"""
from __future__ import annotations

from datetime import datetime, timezone

import jolpica
from openf1_fallback import _as_date, _get as openf1_get, _pick_race_session

STAGE_KEYS = ("Q1", "Q2", "Q3")
OPENF1_SESSION_NAMES = {"Q": ("Qualifying",), "SQ": ("Sprint Qualifying", "Sprint Shootout")}


def _status(no_time: bool, dns: bool = False, dsq: bool = False) -> str:
    return "dsq" if dsq else "dns" if dns else "no_time" if no_time else "classified"


def parse_jolpica_stages(payload: dict, year: int, round_num: int, event_date) -> list[dict] | None:
    """Jolpica's official Grand Prix qualifying, one row per driver with each stage's time - or None if this isn't
    a complete classification for this round (the same checks parse_qualifying applies)."""
    race = jolpica._race_for(payload, year, round_num, event_date)
    if race is None or not race.get("QualifyingResults"):
        return None
    rows = []
    for q in race["QualifyingResults"]:
        times = [jolpica.parse_lap_time(q.get(k)) if q.get(k) else None for k in STAGE_KEYS]
        # A stage key is present for every stage the driver took part in, even without a valid lap ("Q1": "").
        reached = max((i + 1 for i, k in enumerate(STAGE_KEYS) if k in q), default=1)
        rows.append(
            {
                "driver": q["Driver"].get("code"),
                "driverName": f"{q['Driver'].get('givenName', '')} {q['Driver'].get('familyName', '')}".strip(),
                "team": q["Constructor"].get("name"),
                "position": int(q["position"]),
                "stages": times,
                "stageReached": reached,
                "status": _status(no_time=all(t is None for t in times)),
            }
        )
    reason = jolpica._looks_complete([{**r, "gridPosition": r["position"]} for r in rows], "gridPosition")
    if reason:
        print(f"    jolpica: round {round_num} qualifying stages rejected ({reason})")
        return None
    return sorted(rows, key=lambda r: r["position"])


def parse_openf1_stages(session_result: list[dict], drivers: list[dict]) -> list[dict] | None:
    """OpenF1's qualifying or sprint-qualifying session_result -> one row per driver with each stage's time
    (`duration` holds [stage1, stage2, stage3]), or None if it doesn't read as a complete session."""
    info = {d["driver_number"]: d for d in drivers}
    rows = []
    for r in session_result:
        d = info.get(r["driver_number"])
        if d is None or not d.get("name_acronym"):
            print(f"    openf1: qualifying skipping car {r['driver_number']}, no driver info")
            continue
        duration = r.get("duration") if isinstance(r.get("duration"), list) else [r.get("duration")]
        times = [round(float(t), 3) if isinstance(t, (int, float)) else None for t in (list(duration) + [None, None, None])[:3]]
        reached = max((i + 1 for i, t in enumerate(times) if t is not None), default=1)
        rows.append(
            {
                "driver": d["name_acronym"],
                "driverName": d.get("full_name"),
                "team": d.get("team_name"),
                "position": r.get("position") if isinstance(r.get("position"), int) else None,
                "stages": times,
                "stageReached": reached,
                "status": _status(no_time=all(t is None for t in times), dns=bool(r.get("dns")), dsq=bool(r.get("dsq"))),
            }
        )
    positions = [r["position"] for r in rows if r["position"] is not None]
    if len(rows) < 10 or len(positions) != len(set(positions)):
        print(f"    openf1: qualifying stages rejected ({len(rows)} cars, positions {'unique' if len(positions) == len(set(positions)) else 'repeated'})")
        return None
    return sorted(rows, key=lambda r: (r["position"] is None, r["position"] or 0))


def fetch_openf1_stages(year: int, country: str, race_date, session: str) -> list[dict] | None:
    """This round's Grand Prix qualifying ("Q") or sprint qualifying ("SQ") from OpenF1, pinned to the race's own
    meeting by date and only once the session has ended. None when the weekend has no such session. Never raises."""
    try:
        sessions = openf1_get("sessions", year=year, country_name=country)
        race_session = _pick_race_session(sessions, _as_date(race_date))
        if race_session is None:
            return None
        s = next((x for x in sessions if x.get("meeting_key") == race_session["meeting_key"] and x.get("session_name") in OPENF1_SESSION_NAMES[session]), None)
        if s is None:
            return None
        end = datetime.fromisoformat(s["date_end"])
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) < end:
            return None
        return parse_openf1_stages(openf1_get("session_result", session_key=s["session_key"]), openf1_get("drivers", session_key=s["session_key"]))
    except Exception as exc:
        print(f"    openf1: {session} stages not available ({exc})")
        return None


def stages_for_round(year: int, round_num: int, country: str, race_date, sprint_weekend: bool, stored_sources: dict[str, str]) -> list[tuple[str, list[dict], str]]:
    """[(session, rows, source)] to write this tick. `stored_sources` is {session: source} of what's already
    stored: an official Grand Prix classification is never fetched again, and sprint qualifying (OpenF1 only) is
    fetched until stored once."""
    out = []
    if stored_sources.get("Q") != "official":
        try:
            official = parse_jolpica_stages(jolpica._get(f"{year}/{round_num}/qualifying.json"), year, round_num, race_date)
        except Exception as exc:
            print(f"    jolpica: qualifying stages not available ({exc})")
            official = None
        if official:
            out.append(("Q", official, "official"))
        elif "Q" not in stored_sources:
            prelim = fetch_openf1_stages(year, country, race_date, "Q")
            if prelim:
                out.append(("Q", prelim, "openf1"))
    if sprint_weekend and "SQ" not in stored_sources:
        sq = fetch_openf1_stages(year, country, race_date, "SQ")
        if sq:
            out.append(("SQ", sq, "openf1"))
    return out


def qualifying_result_rows(race_id: str, session: str, rows: list[dict], source: str, team_of=lambda name: name, roster: dict | None = None) -> list[dict]:
    """Rows for the table. `team_of` maps a source's team name to the app's (fetch_races.normalize_team_name), so
    "RB F1 Team" is stored as the same "Racing Bulls" every other race table uses; a driver in `roster` (code ->
    {name}) keeps the app's own name rather than OpenF1's "Max VERSTAPPEN"."""
    roster = roster or {}
    return [
        {
            "race_id": race_id,
            "session": session,
            "driver": r["driver"],
            "driver_name": roster.get(r["driver"], {}).get("name") or r["driverName"] or r["driver"],
            "team": team_of(r["team"]) if r["team"] else "",
            "position": r["position"],
            "stage1_sec": r["stages"][0],
            "stage2_sec": r["stages"][1],
            "stage3_sec": r["stages"][2],
            "stage_reached": r["stageReached"],
            "status": r["status"],
            "source": source,
        }
        for r in rows
    ]
