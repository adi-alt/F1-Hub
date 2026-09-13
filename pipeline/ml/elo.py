"""A round-robin-of-pairwise-comparisons Elo rating, the same adaptation the F1 community actually
uses for this exact problem (see e.g. github.com/matthewperron/f1-elo, the SIAM "Pole to Podium"
paper) — F1 isn't 1-on-1, so a race with N classified finishers is treated as N-1 pairwise games
per driver: beat everyone you finished ahead of, lost to everyone ahead of you.

Why this over the plain rolling-average form feature it replaces: the rolling average has no
principled way to say "this estimate is still mostly guesswork" early on — it just averages
whatever's there, including a single race's worth of noise. Elo's K-factor answers that directly:
a brand-new driver's rating moves in big swings (K=BASE_K) because there's nothing to protect yet;
an established one's moves in small increments (K decays toward MIN_K), because a single race
shouldn't meaningfully move an estimate built on 15 races of evidence. That decay *is* the
shrinkage the earlier "backoff toward baseline" idea was reaching for — built into the update
rule instead of bolted on after the fact.
"""

from __future__ import annotations

from statistics import mean

BASE_RATING = 1500.0
BASE_K = 40.0
MIN_K = 8.0
K_DECAY_RACES = 20.0  # roughly how many races until K has decayed most of the way to MIN_K


def k_factor(races_played: int) -> float:
    decay = 2.0 ** (-races_played / K_DECAY_RACES)
    return MIN_K + (BASE_K - MIN_K) * decay


def expected_score(rating_a: float, rating_b: float) -> float:
    return 1.0 / (1.0 + 10.0 ** ((rating_b - rating_a) / 400.0))


def _update_event(ratings: dict[str, float], races_played: dict[str, int], order: list[str]) -> None:
    """order: entities (drivers or teams) sorted best-to-worst for one event (a race or a
    qualifying session). Every entity's rating is updated once, from its average expected score
    against the whole field vs. the fraction of the field it actually beat — not N-1 separate
    per-opponent updates, which would let a single race swing a rating by an unreasonable amount
    on a 20-car field.
    """
    n = len(order)
    if n < 2:
        return
    for entity in ratings.keys() | set(order):
        ratings.setdefault(entity, BASE_RATING)
        races_played.setdefault(entity, 0)

    snapshot = dict(ratings)  # all updates use the *pre-event* ratings, not partially-updated ones
    for i, entity in enumerate(order):
        opponents = [o for o in order if o != entity]
        expected_avg = mean(expected_score(snapshot[entity], snapshot[o]) for o in opponents)
        actual_avg = (n - 1 - i) / (n - 1)  # fraction of this event's field finished ahead of
        k = k_factor(races_played[entity])
        ratings[entity] = snapshot[entity] + k * (actual_avg - expected_avg)
        races_played[entity] += 1


def rating_progression(events: list[list[str]]) -> list[dict[str, float]]:
    """events: one entry per round, in chronological order, each a list of entities sorted
    best-to-worst for that round. Returns one ratings snapshot per round, taken *before* that
    round's own result is applied — the leakage-safe value to use as that round's feature, since
    it reflects only strictly-prior rounds by construction.
    """
    ratings: dict[str, float] = {}
    races_played: dict[str, int] = {}
    snapshots = []
    for order in events:
        snapshots.append(dict(ratings))
        _update_event(ratings, races_played, order)
    return snapshots


def current_ratings(events: list[list[str]]) -> tuple[dict[str, float], dict[str, int]]:
    """The live rating after all supplied events — what to use as input features for a race that
    hasn't happened yet (as opposed to `rating_progression`, which is for historical training
    rows)."""
    ratings: dict[str, float] = {}
    races_played: dict[str, int] = {}
    for order in events:
        _update_event(ratings, races_played, order)
    return ratings, races_played
