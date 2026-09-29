"""Race identity and venue corrections shared by sync_calendar.py and fetch_races.py.

Identity. A race's stable identity is (season, event slug) - the same pair the app's own URLs use
(`/race?year=2026&race=bahrain-grand-prix`; event names are unique within a season). The round
number is an attribute that can change: a cancellation renumbers every later round. The row id
`{year}_r{round:02d}_{slug}` embeds the round it was FIRST written under and is never rewritten
afterwards, because picks, prediction rounds and scores reference it. `id_slug()` recovers the slug
from any id, so a renumbered event is still recognised as the same race.

Venue corrections. FastF1's schedule is the source for every event's location. If it is ever
genuinely wrong, a reviewed entry in VENUE_OVERRIDES is applied by BOTH scripts before anything is
written, so the weekly calendar sync can't restore the bad value and a race row can never be
written with it. Deliberately an explicit, reviewed list - never "revert to what history says" -
because real venue changes happen and must not be undone:
- 2026 Bahrain Grand Prix: relocated by F1/FIA to the Sepang International Circuit, Malaysia
  ("FORMULA 1 GULF AIR BAHRAIN GRAND PRIX IN MALAYSIA 2026", 2-4 Oct, local times UTC+8). FastF1's
  "Kuala Lumpur" is CORRECT. An earlier, never-released override to "Sakhir" was itself the error -
  verify against an official announcement before adding any entry.
- 2026 Spanish Grand Prix: moved to the new Madring circuit in Madrid.
audit_data_consistency.py warns (without failing) about any event whose location differs from its
previous season's; a change a person has verified goes in REVIEWED_VENUE_CHANGES, with the reason, so
the warning stops repeating it but returns if upstream changes the value again.
"""

from __future__ import annotations

import re
import unicodedata


def slugify(name: str) -> str:
    # NFKD + ascii-ignore drops accents (e.g. "São Paulo" -> "Sao Paulo") rather than mangling
    # the character entirely, which plain regex-stripping would do.
    ascii_only = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_only.lower()).strip("-")


def race_id_for(year: int, round_num: int, event_name: str) -> str:
    """The id a NEW race/calendar row gets. Existing rows keep theirs (see resolve_race_id)."""
    return f"{year}_r{round_num:02d}_{slugify(event_name)}"


_ID_RE = re.compile(r"^(\d{4})_r(\d+)_(.+)$")


def id_slug(race_id: str) -> str | None:
    """The event slug inside a `{year}_r{round}_{slug}` id, or None for an id of another shape."""
    m = _ID_RE.match(race_id)
    return m.group(3) if m else None


# (season, event slug) -> {field: corrected value, "reason": why}. Keyed by slug, not round, so a
# correction survives renumbering. Only for an upstream value verified to be WRONG against an official
# source. Empty: no upstream location is currently known to be wrong (see the module docstring for the
# 2026 Bahrain entry that was removed).
VENUE_OVERRIDES: dict[tuple[int, str], dict[str, str]] = {}

# (season, event slug) -> the upstream location a person has verified as CORRECT although it differs
# from the event's previous season, with the evidence. Silences only audit_data_consistency's drift
# warning, and only while the stored value still equals "location". Nothing is rewritten.
REVIEWED_VENUE_CHANGES: dict[tuple[int, str], dict[str, str]] = {
    (2026, "bahrain-grand-prix"): {
        "location": "Kuala Lumpur",
        "previous": "Sakhir",
        "kind": "relocation",
        "reason": "F1/FIA relocated the 2026 Bahrain GP to Sepang International Circuit, Malaysia, 2-4 Oct "
        "(formula1.com announcement; FastF1 OfficialEventName 'GULF AIR BAHRAIN GRAND PRIX IN MALAYSIA'). "
        "Archive locality 'Kuala Lumpur' resolves to circuit 'sepang', which is correct.",
    },
    (2026, "monaco-grand-prix"): {
        "location": "Monte Carlo",
        "previous": "Monaco",
        "kind": "naming",
        "reason": "Same Circuit de Monaco; upstream naming only. 'Monte Carlo' resolves to archive circuit 'monaco' "
        "(alias and archive locality).",
    },
    (2026, "abu-dhabi-grand-prix"): {
        "location": "Yas Marina",
        "previous": "Yas Island",
        "kind": "naming",
        "reason": "Same Yas Marina Circuit; upstream naming only. 'Yas Marina' resolves to archive circuit 'yas_marina' "
        "(alias).",
    },
    # 2026 spanish-grand-prix (Madrid) is a genuine move to the Madring, deliberately NOT listed yet:
    # the app maps "Madrid" to the historical Jarama circuit, a separate open issue - the warning
    # stays until that is fixed (src/lib/circuitSlug.ts, resolveCurrentCircuitToArchiveId).
}


def corrected_location(year: int, event_name: str, upstream_location: str) -> str:
    """The location to store for this event: the reviewed override when one exists, else upstream's."""
    override = VENUE_OVERRIDES.get((year, slugify(event_name)))
    return override["location"] if override and "location" in override else upstream_location


class RaceIdentityConflict(Exception):
    """Another race already occupies this (season, round) under a different event. Writing would
    create a second race for the round (or silently re-point someone's picks at a different event),
    so the round is skipped and the conflict reported instead. Seen when an event is renamed
    upstream, or when a cancelled event's placeholder row still holds the round a renumbered event
    now uses."""


def resolve_race_id(existing_rows: list[tuple[str, int]], year: int, round_num: int, event_name: str, calendar_id: str | None = None) -> str:
    """Decide which id this (year, round, event) writes to, given every `races` row already stored
    for `year` as (id, round) pairs.

    - A row for the same event (same slug) exists: reuse its id, whatever round it was first written
      under - the event was renumbered, it is still the same race, and its picks/predictions must
      stay attached to it. The caller writes the new round onto that row.
    - Otherwise, if another event's row holds this round: RaceIdentityConflict (never a duplicate).
    - Otherwise: a fresh id - the live calendar row's own id for this event when there is one
      (`calendar_id`, which keeps the two tables sharing one id even if the calendar row was
      renumbered before any race data existed), else the id built from the current round.
    """
    slug = slugify(event_name)
    # Callers pass one season's rows; filtered again anyway so seasons can never be mixed.
    existing_rows = [(rid, rnd) for rid, rnd in existing_rows if rid.startswith(f"{year}_")]
    same_event = [rid for rid, _ in existing_rows if id_slug(rid) == slug]
    if len(same_event) > 1:
        raise RaceIdentityConflict(f"{year} {event_name}: {len(same_event)} rows already exist for this event ({', '.join(sorted(same_event))})")
    if same_event:
        occupant = next((rid for rid, rnd in existing_rows if rnd == round_num and id_slug(rid) != slug), None)
        if occupant:
            raise RaceIdentityConflict(f"{year} round {round_num}: {event_name} is stored as {same_event[0]}, but {occupant} still holds round {round_num}")
        return same_event[0]
    occupant = next((rid for rid, rnd in existing_rows if rnd == round_num), None)
    if occupant:
        raise RaceIdentityConflict(f"{year} round {round_num}: upstream now calls it {event_name!r}, but {occupant} already holds this round")
    if calendar_id and id_slug(calendar_id) == slug:
        return calendar_id
    return race_id_for(year, round_num, event_name)


def calendar_row_id(existing: list[tuple[str, int, str | None]], race_ids: list[str], year: int, round_num: int, event_name: str) -> str:
    """The id a calendar row for this event writes to. Calendar rows keep their id across
    renumbering exactly like races rows do (resolve_race_id), so the calendar row and the races row
    for one event keep sharing one id - the id the app and the lock-time functions join on.

    Preference: a live (not cancelled) calendar row for the event, then the event's races row id,
    then a cancelled calendar row for it (the event is back on the calendar - revive that row rather
    than add a second one), then a fresh id. `existing` is (id, round, status) for every calendar row
    of `year`; `race_ids` every races id of `year`."""
    slug = slugify(event_name)
    live = sorted(rid for rid, _, status in existing if id_slug(rid) == slug and status != "cancelled")
    if live:
        return live[0]
    raced = sorted(rid for rid in race_ids if id_slug(rid) == slug)
    if raced:
        return raced[0]
    cancelled = sorted(rid for rid, _, status in existing if id_slug(rid) == slug)
    if cancelled:
        return cancelled[0]
    return race_id_for(year, round_num, event_name)


def calendar_rows_to_retire(existing: list[tuple[str, int, str | None]], fresh_ids: set[str], fresh_slug_rounds: dict[str, int]) -> tuple[list[str], list[str]]:
    """Which existing calendar rows (id, round, status) the fresh FastF1 schedule no longer contains,
    split into (retire, keep_and_warn).

    - Retired (status -> 'cancelled', never deleted): a row whose event appears in the fresh schedule
      under a different id (renumbered or re-slugged), or whose event is gone while its round is
      within the fresh schedule's range (a real cancellation).
    - Kept, with a warning: a row beyond the last round the fresh schedule knows about and whose
      event is absent - upstream may simply have returned a partial calendar, and hiding real
      rounds on a partial response would be worse than showing a stale one for a week.
    Nothing is retired at all when the fresh schedule is empty (a failed or empty upstream response).
    """
    if not fresh_ids:
        return [], []
    max_fresh_round = max(fresh_slug_rounds.values()) if fresh_slug_rounds else 0
    retire, keep = [], []
    for row_id, round_num, status in existing:
        if row_id in fresh_ids or status == "cancelled":
            continue
        slug = id_slug(row_id)
        if slug in fresh_slug_rounds or round_num <= max_fresh_round:
            retire.append(row_id)
        else:
            keep.append(row_id)
    return retire, keep
