import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchScore, rankMatches, seasonResults } from "./search";

describe("search matching", () => {
  it("prefers a prefix, then a word start, then a substring, ignoring accents and case", () => {
    assert.equal(matchScore("ham", "Lewis Hamilton"), 1);
    assert.equal(matchScore("lew", "Lewis Hamilton"), 0);
    assert.equal(matchScore("milt", "Lewis Hamilton"), 2);
    assert.equal(matchScore("perez", "Sergio Pérez"), 1);
    assert.equal(matchScore("xyz", "Lewis Hamilton"), null);
  });

  it("ranks and caps one kind's results", () => {
    const items = ["Monaco", "Monza", "Montreal", "Mexico City", "Imola", "Lusail", "Suzuka"].map((name) => ({ name }));
    const out = rankMatches("mon", items, (i) => [i.name], (i) => ({ kind: "circuit", label: i.name, href: `/${i.name}` }));
    assert.deepEqual(out.map((r) => r.label), ["Monza", "Monaco", "Montreal"]);
  });

  it("turns a year in range into a season link", () => {
    assert.equal(seasonResults("1988", 2026)[0]?.label, "1988 season");
    assert.deepEqual(seasonResults("1900", 2026), []);
    assert.deepEqual(seasonResults("19", 2026), []);
  });
});
