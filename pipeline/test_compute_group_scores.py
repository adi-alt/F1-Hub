"""Plain assert-based self-check for the scoring formula - no pytest, nothing to install, just
`python test_compute_group_scores.py`. The one thing worth pinning down: the exact-vs-loose-hit
point values and the standard-competition-rank tie handling, since both are easy to get subtly
wrong and nothing else in this script would catch it.
"""

from compute_group_scores import score_pick

actual = {1: "VER", 2: "NOR", 3: "LEC"}

# Perfect call: every slot exact -> max score.
score, breakdown = score_pick(["VER", "NOR", "LEC"], actual)
assert score == 9, score
assert breakdown == {"p1": "exact", "p2": "exact", "p3": "exact"}, breakdown

# Right 3 drivers, wrong order -> loose hit each (1 point), not exact.
score, breakdown = score_pick(["LEC", "VER", "NOR"], actual)
assert score == 3, score
assert breakdown == {"p1": "podium", "p2": "podium", "p3": "podium"}, breakdown

# Mixed: p1 exact, p2 a real podium finisher in the wrong slot, p3 a complete miss.
score, breakdown = score_pick(["VER", "LEC", "HAM"], actual)
assert score == 3 + 1 + 0, score
assert breakdown == {"p1": "exact", "p2": "podium", "p3": "miss"}, breakdown

# Total miss.
score, breakdown = score_pick(["HAM", "ALO", "PIA"], actual)
assert score == 0, score
assert breakdown == {"p1": "miss", "p2": "miss", "p3": "miss"}, breakdown

# Optional categories: unchanged podium scoring when they're absent (every pick made before them).
assert score_pick(["VER", "NOR", "LEC"], actual, {}, {"pole": "VER", "fastest_lap": "NOR", "top5": ["VER", "NOR", "LEC", "PIA", "RUS"]})[0] == 9

real = {"pole": "NOR", "fastest_lap": "LEC", "top5": ["VER", "NOR", "LEC", "PIA", "RUS"]}
score, breakdown = score_pick(["VER", "NOR", "LEC"], actual, {"pole": "NOR", "fastest_lap": "LEC", "top5": ["VER", "NOR", "LEC", "PIA", "RUS"]}, real)
assert score == 9 + 3 + 2 + 5, score
assert breakdown["pole"] == "exact" and breakdown["fastest_lap"] == "exact" and breakdown["top5"] == 5, breakdown

score, breakdown = score_pick(["HAM", "ALO", "PIA"], actual, {"pole": "VER", "fastest_lap": "VER", "top5": ["HAM", "ALO", "PIA", "VER", "SAI"]}, real)
assert score == 0 + 0 + 0 + 2, score  # PIA and VER finished in the top five
assert breakdown["pole"] == "miss" and breakdown["fastest_lap"] == "miss" and breakdown["top5"] == 2, breakdown

# A category whose real answer isn't known (no pole recorded) neither scores nor appears.
score, breakdown = score_pick(["VER", "NOR", "LEC"], actual, {"pole": "VER"}, {})
assert score == 9 and "pole" not in breakdown, breakdown

from compute_group_scores import margin_bucket

assert [margin_bucket(g) for g in (0.4, 1.999, 2.0, 7.3, 10.0, 25)] == ["under_2", "under_2", "2_5", "5_10", "over_10", "over_10"]
score, breakdown = score_pick(["HAM", "ALO", "PIA"], actual, {"safety_car": False, "margin": "2_5"}, {"safety_car": False, "margin": "2_5"})
assert score == 2 + 2 and breakdown["safety_car"] == "exact" and breakdown["margin"] == "exact", breakdown
score, breakdown = score_pick(["HAM", "ALO", "PIA"], actual, {"safety_car": True, "margin": "over_10"}, {"safety_car": False, "margin": "2_5"})
assert score == 0 and breakdown["safety_car"] == "miss" and breakdown["margin"] == "miss", breakdown

print("score_pick: all checks passed")
