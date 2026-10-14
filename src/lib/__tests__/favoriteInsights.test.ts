import { it } from "node:test";
import assert from "node:assert/strict";
import { insightFor } from "../favoriteInsights";

const intel = {
  favoriteInsights: [
    { name: "Carlos Sainz", insight: "Sainz needs a clean weekend." },
    { name: "Kimi Antonelli", insight: "Antonelli leads by 102." },
    { name: "Ferrari", insight: "Ferrari have won here before." },
  ],
};

it("puts each insight on its own card, by name, then by surname", () => {
  assert.equal(insightFor(intel, "driver", "Carlos Sainz"), "Sainz needs a clean weekend.");
  assert.equal(insightFor(intel, "driver", "Andrea Kimi Antonelli"), "Antonelli leads by 102.");
  assert.equal(insightFor(intel, "team", "Ferrari"), "Ferrari have won here before.");
  assert.equal(insightFor(intel, "driver", "Lando Norris"), null);
});

it("shows an older single insight only on the card it is about", () => {
  const old = { favoriteInsights: [], favoriteDriverInsight: "Russell has shown strong pace in qualifying.", favoriteTeamInsight: "Mercedes bring an update." };
  // The bug: this was shown on the first card (Sainz) by position.
  assert.equal(insightFor(old, "driver", "Carlos Sainz"), null);
  assert.equal(insightFor(old, "driver", "George Russell"), "Russell has shown strong pace in qualifying.");
  assert.equal(insightFor(old, "team", "Mercedes"), "Mercedes bring an update.");
  assert.equal(insightFor(old, "team", "Ferrari"), null);
  assert.equal(insightFor(null, "driver", "George Russell"), null);
});
