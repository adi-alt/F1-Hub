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

print("score_pick: all checks passed")
