import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateSeasonCompareInsight, validateSeasonIntelligence } from "../schemas/seasonIntelligence";
import { canonicalizePair, mirrorCompareInsight } from "../cache";

describe("validateSeasonCompareInsight", () => {
  const expected = {
    aName: "Lewis Hamilton",
    bName: "Kimi Antonelli",
    entityType: "drivers" as const,
    momentum: "B" as const,
    forbiddenNames: ["Nico Hulkenberg", "Carlos Sainz", "George Russell"],
  };
  const good = {
    headline: "Antonelli's consistency is the difference",
    summary: "Antonelli has been the more complete package. Hamilton's season has been sharper in bursts than across a full run.",
    keyAdvantageA: "raw one-lap pace",
    keyAdvantageB: "finishes higher more often",
    momentum: "B" as const,
  };

  it("accepts a response about the two selected competitors", () => {
    const result = validateSeasonCompareInsight(good, expected);
    assert.equal(result.valid, true);
    assert.equal(result.data?.headline, good.headline);
  });

  // This is the exact production failure: the model wrote about a different rivalry entirely.
  // Structurally it can no longer see one, but this is the guard that catches it if it ever does.
  it("rejects a response that drifted onto a different rivalry", () => {
    const drifted = { ...good, summary: "Hulkenberg and Sainz are locked on equal points, a dead heat." };
    const result = validateSeasonCompareInsight(drifted, expected);
    assert.equal(result.valid, false);
    assert.match(String(result.errors), /Hulkenberg/);
  });

  it("checks every field, not just the summary", () => {
    assert.equal(validateSeasonCompareInsight({ ...good, headline: "George Russell closes in" }, expected).valid, false);
    assert.equal(validateSeasonCompareInsight({ ...good, keyAdvantageA: "quicker than Carlos Sainz" }, expected).valid, false);
  });

  // How a model actually writes about a third party: surname only.
  it("catches a bare surname, not just the full name", () => {
    assert.equal(validateSeasonCompareInsight({ ...good, summary: "Russell has been quicker than both." }, expected).valid, false);
    assert.equal(validateSeasonCompareInsight({ ...good, summary: "Hulkenberg and Sainz are level." }, expected).valid, false);
  });

  it("overwrites momentum with the deterministically computed value", () => {
    const result = validateSeasonCompareInsight({ ...good, momentum: "A" }, expected);
    assert.equal(result.valid, true);
    assert.equal(result.data?.momentum, "B", "the model reports momentum, it does not decide it");
  });

  it("does not reject a correct response over a name that overlaps one of the two selected", () => {
    // A season really can field two Hamiltons or two Schumachers; matching a shared surname that
    // is part of a selected competitor's own name would reject perfectly correct copy.
    const withOverlap = validateSeasonCompareInsight(good, { ...expected, forbiddenNames: ["Hamilton", "Antonelli"] });
    assert.equal(withOverlap.valid, true);
  });

  it("rejects output that doesn't match the schema at all", () => {
    assert.equal(validateSeasonCompareInsight({ headline: "x" }, expected).valid, false);
  });

  // Team names split into ordinary nouns, so the surname heuristic must not apply to them.
  it("does not reject team copy for using an ordinary word from another team's name", () => {
    const teams = {
      aName: "Ferrari",
      bName: "Mercedes",
      entityType: "constructors" as const,
      momentum: "EVEN" as const,
      forbiddenNames: ["Haas F1 Team", "Red Bull Racing", "Aston Martin"],
    };
    const ok = {
      headline: "Two different approaches to the same problem",
      summary: "Ferrari has built its season around one-lap pace. Mercedes has been the steadier team across a race distance, which is where the gap has come from.",
      keyAdvantageA: "qualifying pace",
      keyAdvantageB: "race-day consistency",
      momentum: "EVEN" as const,
    };
    assert.equal(validateSeasonCompareInsight(ok, teams).valid, true, '"team" is a normal word, not a reference to Haas');
  });

  it("still rejects team copy that names a third team outright", () => {
    const teams = {
      aName: "Ferrari",
      bName: "Mercedes",
      entityType: "constructors" as const,
      momentum: "EVEN" as const,
      forbiddenNames: ["Red Bull Racing"],
    };
    const drifted = { headline: "h", summary: "Red Bull Racing leads both of them.", keyAdvantageA: "a", keyAdvantageB: "b", momentum: "EVEN" as const };
    assert.equal(validateSeasonCompareInsight(drifted, teams).valid, false);
  });
});

describe("validateSeasonIntelligence", () => {
  const base = {
    seasonStory: { headline: "h", summary: "s", themes: ["a"] },
    battleInsight: { headline: "h", summary: "s", highlightedBattleId: "drivers:ANT-vs-HAM" },
    progressionInsight: { headline: "h", summary: "s", highlightedEntities: ["ANT", "Mercedes"] },
    recordInsight: { headline: "h", summary: "s", highlightedRecordIds: ["most-wins"] },
    whatChangedInsight: { summary: "s", highlights: ["x"] },
  };
  const validIds = ["ANT", "HAM", "Mercedes", "drivers:ANT-vs-HAM", "most-wins"];

  it("keeps references that exist in the season's real data", () => {
    const result = validateSeasonIntelligence(base, validIds);
    assert.equal(result.valid, true);
    assert.equal(result.data?.battleInsight.highlightedBattleId, "drivers:ANT-vs-HAM");
    assert.deepEqual(result.data?.progressionInsight.highlightedEntities, ["ANT", "Mercedes"]);
  });

  // Observed live: the model copies ids straight out of the context INCLUDING the brackets the
  // context uses to mark them. Every one of those was previously discarded as unknown.
  it("normalizes ids the model copied with their surrounding brackets", () => {
    const bracketed = {
      ...base,
      battleInsight: { ...base.battleInsight, highlightedBattleId: "[drivers:ANT-vs-HAM]" },
      progressionInsight: { ...base.progressionInsight, highlightedEntities: ["[ANT]", "[Mercedes]"] },
      recordInsight: { ...base.recordInsight, highlightedRecordIds: ["[most-wins]"] },
    };
    const result = validateSeasonIntelligence(bracketed, validIds);
    assert.equal(result.data?.battleInsight.highlightedBattleId, "drivers:ANT-vs-HAM");
    assert.deepEqual(result.data?.progressionInsight.highlightedEntities, ["ANT", "Mercedes"]);
    assert.deepEqual(result.data?.recordInsight.highlightedRecordIds, ["most-wins"]);
  });

  it("strips a hallucinated reference without discarding the surrounding editorial text", () => {
    const bad = {
      ...base,
      battleInsight: { ...base.battleInsight, highlightedBattleId: "drivers:NOBODY-vs-NOONE" },
      progressionInsight: { ...base.progressionInsight, highlightedEntities: ["ANT", "GHOST"] },
    };
    const result = validateSeasonIntelligence(bad, validIds);
    assert.equal(result.valid, true, "one bad pointer must not throw away four working sections");
    assert.equal(result.data?.battleInsight.highlightedBattleId, undefined);
    assert.deepEqual(result.data?.progressionInsight.highlightedEntities, ["ANT"]);
    assert.equal(result.data?.seasonStory.headline, "h");
  });

  it("accepts null for every optional field, which is what the model actually emits", () => {
    const withNulls = {
      ...base,
      battleInsight: { headline: "h", summary: "s", highlightedBattleId: null },
      progressionInsight: { headline: "h", summary: "s", highlightedEntities: null },
      recordInsight: { headline: "h", summary: "s", highlightedRecordIds: null },
    };
    const result = validateSeasonIntelligence(withNulls, validIds);
    assert.equal(result.valid, true);
    assert.deepEqual(result.data?.progressionInsight.highlightedEntities, []);
  });
});

describe("compare pair canonicalization", () => {
  it("maps both selection orders onto one cache entry", () => {
    const forward = canonicalizePair("HAM", "ANT");
    const reverse = canonicalizePair("ANT", "HAM");
    assert.equal(forward.canonicalA, reverse.canonicalA);
    assert.equal(forward.canonicalB, reverse.canonicalB);
  });

  it("reports which selection order matches the stored one", () => {
    assert.equal(canonicalizePair("ANT", "HAM").canonicalOrderMatches, true);
    assert.equal(canonicalizePair("HAM", "ANT").canonicalOrderMatches, false);
  });

  // Sharing one entry between both orders is only safe because the value is mirrored on the way
  // out. Sorting the key WITHOUT this is what served a cached answer with the sides swapped.
  it("mirrors every directional field together when the order is reversed", () => {
    const stored = { headline: "h", summary: "s", keyAdvantageA: "A's edge", keyAdvantageB: "B's edge", momentum: "A" as const };
    const mirrored = mirrorCompareInsight(stored);
    assert.equal(mirrored.keyAdvantageA, "B's edge");
    assert.equal(mirrored.keyAdvantageB, "A's edge");
    assert.equal(mirrored.momentum, "B");
  });

  it("leaves a level momentum level in both directions", () => {
    assert.equal(mirrorCompareInsight({ headline: "h", summary: "s", keyAdvantageA: "a", keyAdvantageB: "b", momentum: "EVEN" }).momentum, "EVEN");
  });

  it("round-trips back to the original", () => {
    const stored = { headline: "h", summary: "s", keyAdvantageA: "A's edge", keyAdvantageB: "B's edge", momentum: "A" as const };
    assert.deepEqual(mirrorCompareInsight(mirrorCompareInsight(stored)), stored);
  });
});
