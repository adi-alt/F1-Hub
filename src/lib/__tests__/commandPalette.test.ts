// The command palette's pure layers: query parsing, typo-tolerant ranking, the action registry, recent searches,
// and the AI intent -> structured search step (with the model stubbed: no real AI call is ever made here).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { editDistance, groupResults, looksLikeQuestion, matchScore, parseQuery, rankMatches, type SearchResult } from "../searchQuery";
import { buildActions, matchActions, parseCompare, type ActionContext } from "../searchActions";
import { filterRaces, interpretSearchIntent, parseIntent, resolveEntities, searchIntentSchema } from "../ai/searchIntent";
import { readRecent, rememberRecent } from "../../components/search/recentSearches";
import type { ArchiveRaceDoc } from "../supabase/archive";

describe("parseQuery", () => {
  it("reads a bare year, a name with a year, and a driver code", () => {
    assert.deepEqual([parseQuery("2021").year, parseQuery("2021").text, parseQuery("2021").mode], [2021, "", "search"]);
    const p = parseQuery("monza 2019");
    assert.equal(p.year, 2019);
    assert.equal(p.text, "monza");
    assert.equal(parseQuery("VER").code, "VER");
    assert.equal(parseQuery("verstappen").code, null);
  });

  it("expands team nicknames", () => {
    assert.equal(parseQuery("RBR").text, "red bull");
    assert.equal(parseQuery("Mercs").text, "mercedes");
  });

  it("treats > as commands and nothing as empty", () => {
    assert.deepEqual([parseQuery(">export").mode, parseQuery(">export").text], ["actions", "export"]);
    assert.equal(parseQuery("").mode, "empty");
    assert.equal(parseQuery("a").mode, "empty");
  });

  it("knows a question from a lookup", () => {
    assert.ok(looksLikeQuestion("who won monza last year"));
    assert.ok(looksLikeQuestion("norris pace?"));
    assert.ok(!looksLikeQuestion("lewis hamilton"));
    assert.ok(!looksLikeQuestion("who"));
    assert.ok(parseQuery("how many wins does max have").question);
  });
});

describe("ranking", () => {
  it("prefers a prefix, then a word start, then a substring, then a typo", () => {
    assert.equal(matchScore("lew", "Lewis Hamilton"), 0);
    assert.equal(matchScore("ham", "Lewis Hamilton"), 1);
    assert.equal(matchScore("milt", "Lewis Hamilton"), 2);
    assert.equal(matchScore("hamiltn", "Lewis Hamilton"), 3);
    assert.equal(matchScore("verstapen", "Max Verstappen"), 3);
    assert.equal(matchScore("xyz", "Lewis Hamilton"), null);
    // Short words get no typo allowance: "max" must not match "may".
    assert.equal(matchScore("max", "Mayländer"), null);
  });

  it("bounds the edit distance", () => {
    assert.equal(editDistance("hamiltn", "hamilton", 2), 1);
    assert.equal(editDistance("monza", "silverstone", 2), 3);
  });

  it("puts typo matches after exact ones", () => {
    const items = ["Monaco", "Monza", "Lusail"].map((name) => ({ name }));
    const out = rankMatches("monzq", items, (i) => [i.name], (i) => ({ kind: "circuit", label: i.name, href: `/${i.name}` }));
    assert.deepEqual(out.map((r) => r.label), ["Monza"]);
  });

  it("groups results in the palette's order", () => {
    const r = (kind: SearchResult["kind"], label: string): SearchResult => ({ kind, label, href: `/${label}` });
    const groups = groupResults([r("section", "Season"), r("driver", "Norris"), r("action", "Export my data"), r("driver", "Piastri")]);
    assert.deepEqual(groups.map((g) => [g.heading, g.items.length]), [["Actions", 1], ["Drivers", 2], ["Go to", 1]]);
  });
});

const ctx: ActionContext = {
  season: 2026,
  nextRace: { name: "Mexico City Grand Prix", href: "/race#pick" },
  communities: [{ id: "g1", name: "Tifosi Club", href: "/g1" }],
  drivers: [
    { code: "VER", name: "Max Verstappen" },
    { code: "NOR", name: "Lando Norris" },
    { code: "PIA", name: "Oscar Piastri" },
  ],
  hrefs: { season: "/s", archive: "/a", circuits: "/c", communities: "/co", profile: "/p", notifications: "/n", predictions: "/pr", account: "/acc", reportProblem: "https://x", compare: (a, b) => `/s?compare=${a}-${b}` },
};

describe("action registry", () => {
  it("offers the next race's picks, each community and the fixed actions", () => {
    const labels = buildActions(ctx).map((a) => a.label);
    assert.equal(labels[0], "Make your picks for the Mexico City Grand Prix");
    for (const l of ["Open Tifosi Club", "Turn on race reminders", "Export my data", "Report a problem", "Go to Archive"]) assert.ok(labels.includes(l), l);
    assert.ok(buildActions(ctx).every((a) => a.kind === "action" && a.href));
    assert.equal(buildActions(ctx).find((a) => a.label === "Report a problem")?.external, true);
    assert.ok(!buildActions({ ...ctx, nextRace: null }).some((a) => a.label.startsWith("Make your picks")));
  });

  it("filters by the typed command", () => {
    assert.equal(matchActions("export", ctx)[0]?.label, "Export my data");
    assert.equal(matchActions("remind", ctx)[0]?.label, "Turn on race reminders");
    assert.equal(matchActions("archive", ctx)[0]?.label, "Go to Archive");
  });

  it("reads '<driver> vs <driver>' into a compare link", () => {
    assert.deepEqual(parseCompare("VER vs NOR", ctx.drivers)?.map((d) => d.code), ["VER", "NOR"]);
    assert.deepEqual(parseCompare("compare norris and piastri", ctx.drivers)?.map((d) => d.code), ["NOR", "PIA"]);
    assert.equal(parseCompare("ver vs ver", ctx.drivers), null);
    assert.equal(parseCompare("ver vs nobody", ctx.drivers), null);
    assert.deepEqual(matchActions("ver vs nor", ctx)[0], { kind: "action", label: "Compare Max Verstappen vs Lando Norris", detail: "The 2026 compare panel", href: "/s?compare=VER-NOR" });
  });
});

describe("recent searches", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it("keeps the latest five per user, newest first, without duplicates", () => {
    const store = memory();
    for (const n of [1, 2, 3, 4, 5, 6, 3]) rememberRecent("u1", { kind: "driver", label: `D${n}`, href: `/d${n}`, image: "x" }, store);
    assert.deepEqual(readRecent("u1", store).map((r) => r.label), ["D3", "D6", "D5", "D4", "D2"]);
    assert.equal(readRecent("u1", store)[0].image, undefined);
    assert.deepEqual(readRecent("u2", store), []);
  });

  it("survives storage that throws or holds junk", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    assert.deepEqual(readRecent("u1", broken), []);
    assert.doesNotThrow(() => rememberRecent("u1", { kind: "race", label: "x", href: "/x" }, broken));
    const junk = memory();
    junk.setItem("apex:recent-searches:u1", "{not json");
    assert.deepEqual(readRecent("u1", junk), []);
  });
});

describe("AI search intent", () => {
  it("accepts a valid reply, even wrapped in prose or fences", async () => {
    const intent = await interpretSearchIntent("races where Norris won from outside the top 5", async () => 'Sure:\n```json\n{"kind":"races","driver":"Norris","team":null,"circuit":null,"yearFrom":null,"yearTo":null,"won":true,"minGrid":6,"podium":false}\n```');
    assert.deepEqual(intent, { kind: "races", driver: "Norris", team: null, circuit: null, yearFrom: null, yearTo: null, won: true, minGrid: 6, podium: false });
  });

  it("rejects bad JSON, the wrong shape, 'none' and a filter that names nothing", () => {
    assert.equal(parseIntent("not json"), null);
    assert.equal(parseIntent('{"kind":"delete_everything"}'), null);
    assert.equal(parseIntent('{"kind":"races","driver":"Norris","minGrid":99}'), null);
    assert.equal(parseIntent('{"kind":"none"}'), null);
    assert.equal(parseIntent('{"kind":"races","won":true}'), null);
    assert.equal(searchIntentSchema.safeParse({ kind: "races", yearFrom: 1066 }).success, false);
  });

  const result = (driverId: string, teamId: string, position: number, grid: number) => ({ position, positionText: String(position), grid, laps: 50, status: "Finished", points: 0, driverId, driverName: driverId, constructor: teamId, teamId });
  const race = (year: number, round: number, circuitId: string, results: ReturnType<typeof result>[]): ArchiveRaceDoc => ({ id: `${year}_${round}`, year, round, raceName: `GP ${year}-${round}`, circuitName: circuitId, locality: null, country: null, raceDate: null, results, circuitId });
  const data = {
    drivers: [{ driverId: "norris", name: "Lando Norris", code: "NOR", firstYear: 2019, lastYear: 2026, raceCount: 150, dateOfBirth: null, wikipediaUrl: null, photoUrl: null }],
    teams: [{ teamId: "ferrari", name: "Ferrari", firstYear: 1950, lastYear: 2026, raceCount: 1100, drivers: [] }],
    circuits: [{ circuitId: "monza", name: "Autodromo Nazionale di Monza", wikipediaUrl: null, trackMap: null, lat: null, long: null, locality: "Monza" }],
  };

  it("resolves names only to things that exist, and filters real races", () => {
    const intent = parseIntent('{"kind":"races","driver":"Norris","won":true,"minGrid":6}')!;
    const entities = resolveEntities(intent, data);
    assert.equal(entities.driver?.driverId, "norris");
    const races = [race(2024, 1, "monza", [result("norris", "mclaren", 1, 7)]), race(2024, 2, "spa", [result("norris", "mclaren", 1, 1)]), race(2023, 3, "monza", [result("norris", "mclaren", 2, 9)])];
    const out = filterRaces(intent, entities, races);
    assert.deepEqual(out.map((r) => r.label), ["2024 GP 2024-1"]);
    assert.equal(out[0].detail, "P1 from P7");
    assert.equal(resolveEntities(parseIntent('{"kind":"races","driver":"Zzyzx"}')!, data).driver, null);
  });

  it("finds a team at a circuit", () => {
    const intent = parseIntent('{"kind":"races","team":"Ferrari","circuit":"Monza"}')!;
    const entities = resolveEntities(intent, data);
    const races = [race(2019, 14, "monza", [result("leclerc", "ferrari", 1, 1)]), race(2019, 13, "spa", [result("leclerc", "ferrari", 1, 1)]), race(2020, 8, "monza", [result("gasly", "alphatauri", 1, 10)])];
    assert.deepEqual(filterRaces(intent, entities, races).map((r) => [r.label, r.detail]), [["2019 GP 2019-14", "leclerc: P1 from P1"]]);
  });
});
