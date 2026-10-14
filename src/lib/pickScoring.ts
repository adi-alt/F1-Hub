// A race pick's points, the same rules pipeline/compute_group_scores.py scores community leaderboards with: the
// podium 3 per exact place and 1 for a podium driver in the wrong place, pole 3, fastest lap 2, top five 1 per driver
// in the real top five (any order), safety car 2, winning margin 2. Pure, so the prediction window, the home page
// and the tests all use one copy; __tests__/pickScoring.test.ts holds cases checked against the Python.
import type { MarginBucket, RaceDoc, UserPick } from "./types/race";

export const PICK_POINTS = { podiumExact: 3, podiumPlace: 1, pole: 3, fastestLap: 2, top5Each: 1, safetyCar: 2, margin: 2 } as const;

export type PickCategory = "podium" | "pole" | "fastestLap" | "top5" | "safetyCar" | "margin";

/** Each category's most points: the podium all exact, all five of the top five. */
export const CATEGORY_MAX: Record<PickCategory, number> = {
  podium: 3 * PICK_POINTS.podiumExact,
  pole: PICK_POINTS.pole,
  fastestLap: PICK_POINTS.fastestLap,
  top5: 5 * PICK_POINTS.top5Each,
  safetyCar: PICK_POINTS.safetyCar,
  margin: PICK_POINTS.margin,
};
export const MAX_PICK_POINTS = Object.values(CATEGORY_MAX).reduce((a, b) => a + b, 0);

/** P2's gap to the winner -> the bucket a pick names (compute_group_scores.margin_bucket). */
export function marginBucket(gapSec: number): MarginBucket {
  if (gapSec < 2) return "under_2";
  if (gapSec < 5) return "2_5";
  if (gapSec < 10) return "5_10";
  return "over_10";
}

/** The real answers, as compute_all reads them: null where the race doesn't know yet (or can't: an incomplete
 * classification has no top five). */
export function actualAnswers(race: RaceDoc) {
  const results = race.results ?? [];
  const top3 = new Map(results.filter((r) => r.finishPosition <= 3).map((r) => [r.finishPosition, r.driver]));
  const top5 = results.filter((r) => r.finishPosition <= 5 && r.status !== "dnf").map((r) => r.driver);
  const p2 = results.find((r) => r.finishPosition === 2);
  const fastest = results.filter((r) => r.fastestLapSec != null).sort((a, b) => (a.fastestLapSec as number) - (b.fastestLapSec as number))[0];
  return {
    top3: top3.size ? top3 : null,
    pole: race.poleSitter ?? null,
    fastestLap: fastest?.driver ?? null,
    top5: top5.length >= 5 ? top5 : null,
    safetyCar: race.safetyCarPeriods != null ? race.safetyCarPeriods > 0 : null,
    margin: p2 && p2.status === "finished" && p2.finishGapSec != null ? marginBucket(p2.finishGapSec) : null,
  };
}

export type CategoryScore = {
  category: PickCategory;
  /** Points this pick can still earn here (its maximum, if it's right). 0 when it wasn't picked. */
  possible: number;
  /** Points earned, once the answer is known; null before. */
  earned: number | null;
  /** "exact" / "partial" / "miss" once scored; "pending" before the answer is in; "unpicked" if left empty. */
  outcome: "exact" | "partial" | "miss" | "pending" | "unpicked";
  /** A short line for the outcome: "P1 and P3 exact, P2 on the podium", "3 of 5". */
  detail: string | null;
};

export type PickScore = { categories: CategoryScore[]; earned: number; possible: number; scored: boolean };

/** Scores a pick against its race. Before the result, every category is pending and `possible` is what the pick
 * could earn; after it, `earned` is what it did, exactly as compute_group_scores.score_pick would. */
export function scorePick(pick: Partial<UserPick> & { predictedPodium?: readonly string[] }, race: RaceDoc | null): PickScore {
  const actual = race && race.status === "completed" ? actualAnswers(race) : null;
  const cats: CategoryScore[] = [];
  const single = (category: PickCategory, picked: unknown, truth: unknown, points: number) => {
    if (picked == null || picked === "") return cats.push({ category, possible: 0, earned: null, outcome: "unpicked", detail: null });
    if (truth == null) return cats.push({ category, possible: points, earned: null, outcome: "pending", detail: null });
    const hit = picked === truth;
    cats.push({ category, possible: points, earned: hit ? points : 0, outcome: hit ? "exact" : "miss", detail: null });
  };

  // Podium: 3 per exact place, 1 for a podium driver in the wrong place.
  const podium = pick.predictedPodium?.filter(Boolean) ?? [];
  if (podium.length < 3) cats.push({ category: "podium", possible: 0, earned: null, outcome: "unpicked", detail: null });
  else if (!actual?.top3) cats.push({ category: "podium", possible: CATEGORY_MAX.podium, earned: null, outcome: "pending", detail: null });
  else {
    const real = [...actual.top3.values()];
    let earned = 0;
    const exact: number[] = [];
    const onPodium: number[] = [];
    pick.predictedPodium!.forEach((code, i) => {
      if (actual.top3!.get(i + 1) === code) {
        earned += PICK_POINTS.podiumExact;
        exact.push(i + 1);
      } else if (real.includes(code)) {
        earned += PICK_POINTS.podiumPlace;
        onPodium.push(i + 1);
      }
    });
    const parts = [exact.length ? `${exact.map((p) => `P${p}`).join(" and ")} exact` : null, onPodium.length ? `${onPodium.map((p) => `P${p}`).join(" and ")} on the podium` : null].filter(Boolean);
    cats.push({ category: "podium", possible: CATEGORY_MAX.podium, earned, outcome: earned === CATEGORY_MAX.podium ? "exact" : earned ? "partial" : "miss", detail: parts.join(", ") || "none on the podium" });
  }

  single("pole", pick.predictedPole, actual?.pole, PICK_POINTS.pole);
  single("fastestLap", pick.predictedFastestLap, actual?.fastestLap, PICK_POINTS.fastestLap);

  // Top five: 1 per picked driver in the real top five, any order.
  const top5 = pick.predictedTop5?.filter(Boolean) ?? [];
  if (top5.length < 5) cats.push({ category: "top5", possible: 0, earned: null, outcome: "unpicked", detail: null });
  else if (!actual?.top5) cats.push({ category: "top5", possible: CATEGORY_MAX.top5, earned: null, outcome: "pending", detail: null });
  else {
    const hits = new Set(top5.filter((c) => actual.top5!.includes(c))).size;
    cats.push({ category: "top5", possible: CATEGORY_MAX.top5, earned: hits * PICK_POINTS.top5Each, outcome: hits === 5 ? "exact" : hits ? "partial" : "miss", detail: `${hits} of 5` });
  }

  single("safetyCar", pick.predictedSafetyCar, actual?.safetyCar, PICK_POINTS.safetyCar);
  single("margin", pick.predictedMargin, actual?.margin, PICK_POINTS.margin);

  const scoredCats = cats.filter((c) => c.earned !== null);
  return {
    categories: cats,
    earned: scoredCats.reduce((s, c) => s + (c.earned ?? 0), 0),
    possible: cats.reduce((s, c) => s + c.possible, 0),
    scored: scoredCats.length > 0,
  };
}
