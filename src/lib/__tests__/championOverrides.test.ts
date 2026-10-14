import { test } from "node:test";
import assert from "node:assert/strict";
import { constructorChampionOverride, isVerifiedChampionYear } from "../eras";

test("2007: McLaren scored the most constructors' points but was excluded - Ferrari is the champion", () => {
  assert.equal(constructorChampionOverride(2007), "Ferrari");
  assert.equal(constructorChampionOverride(2008), null, "every other year: the points leader is the champion");
  assert.equal(isVerifiedChampionYear(2007), true);
  assert.equal(isVerifiedChampionYear(1988), false, "before 1991 the points sum isn't the title rule");
});
