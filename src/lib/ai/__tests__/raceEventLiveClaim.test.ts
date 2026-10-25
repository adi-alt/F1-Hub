// "Never call an unstarted session live" for the race window's take, checked on cached takes as well as fresh ones.
import { it } from "node:test";
import assert from "node:assert/strict";
import { claimsLiveWithoutSession } from "../prompts/raceEventPrompt";

const take = (headline: string, summary = "Qualifying set the grid.") => ({ headline, summary });

it("flags a weekend called live while no session is running", () => {
  assert.equal(claimsLiveWithoutSession(take("US Grand Prix live: grid set"), false), true);
  assert.equal(claimsLiveWithoutSession(take("Austin awaits", "The race is under way tomorrow."), false), true);
});

it("allows the word while a session is genuinely running, and a take that never uses it", () => {
  assert.equal(claimsLiveWithoutSession(take("Qualifying live in Austin"), true), false);
  assert.equal(claimsLiveWithoutSession(take("Grid set in Austin"), false), false);
  assert.equal(claimsLiveWithoutSession(take("Oliver delivers in Austin"), false), false);
});
