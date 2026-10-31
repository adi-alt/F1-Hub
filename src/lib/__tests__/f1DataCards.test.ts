import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { parseF1DataCard, type StintDataCard, type TelemetryDataCard, type WinProbabilityDataCard } from "@/lib/communities";
import { computePredictorFlairs, getFlairToneClasses } from "@/lib/predictorFlairs";

describe("parseF1DataCard", () => {
  test("returns null for non-object or invalid inputs", () => {
    assert.equal(parseF1DataCard(null), null);
    assert.equal(parseF1DataCard(undefined), null);
    assert.equal(parseF1DataCard("telemetry"), null);
    assert.equal(parseF1DataCard(123), null);
    assert.equal(parseF1DataCard({}), null);
    assert.equal(parseF1DataCard({ kind: "unknown" }), null);
  });

  test("parses a valid telemetry card and trims safe boundaries", () => {
    const raw = {
      kind: "telemetry",
      raceName: "Mexico City Grand Prix",
      session: "Qualifying",
      circuit: "Autódromo Hermanos Rodríguez",
      driver1: { code: "ver", name: "Max Verstappen", team: "Red Bull", lapTime: "1:17.512" },
      driver2: { code: "nor", name: "Lando Norris", team: "McLaren", lapTime: "1:17.654" },
      deltaSeconds: -0.142,
      sectorDeltas: [-0.038, -0.125, 0.021],
      speedTrap: { driver1Speed: 348, driver2Speed: 341 },
    };

    const parsed = parseF1DataCard(raw) as TelemetryDataCard;
    assert.ok(parsed);
    assert.equal(parsed.kind, "telemetry");
    assert.equal(parsed.raceName, "Mexico City Grand Prix");
    assert.equal(parsed.session, "Qualifying");
    assert.equal(parsed.driver1.code, "VER");
    assert.equal(parsed.driver2.code, "NOR");
    assert.equal(parsed.deltaSeconds, -0.142);
    assert.deepEqual(parsed.sectorDeltas, [-0.038, -0.125, 0.021]);
    assert.equal(parsed.speedTrap?.driver1Speed, 348);
  });

  test("parses a valid stint strategy card", () => {
    const raw = {
      kind: "stint",
      raceName: "Mexico City Grand Prix",
      driver: { code: "lec", name: "Charles Leclerc", team: "Ferrari" },
      totalLaps: 71,
      stints: [
        { compound: "medium", laps: 28, startLap: 1, endLap: 28, isNew: true },
        { compound: "hard", laps: 43, startLap: 29, endLap: 71, isNew: false },
      ],
    };

    const parsed = parseF1DataCard(raw) as StintDataCard;
    assert.ok(parsed);
    assert.equal(parsed.kind, "stint");
    assert.equal(parsed.driver.code, "LEC");
    assert.equal(parsed.totalLaps, 71);
    assert.equal(parsed.stints.length, 2);
    assert.equal(parsed.stints[0].compound, "MEDIUM");
    assert.equal(parsed.stints[1].compound, "HARD");
  });

  test("parses a valid win probability simulation card", () => {
    const raw = {
      kind: "win_probability",
      raceName: "Mexico City Grand Prix",
      simulationsCount: 10000,
      leader: { code: "nor", name: "Lando Norris", team: "McLaren", winProb: 0.44, podiumProb: 0.81 },
      contenders: [
        { code: "ver", name: "Max Verstappen", team: "Red Bull", winProb: 0.31, podiumProb: 0.72 },
      ],
    };

    const parsed = parseF1DataCard(raw) as WinProbabilityDataCard;
    assert.ok(parsed);
    assert.equal(parsed.kind, "win_probability");
    assert.equal(parsed.leader.code, "NOR");
    assert.equal(parsed.leader.winProb, 0.44);
    assert.equal(parsed.contenders[0].code, "VER");
  });
});

describe("computePredictorFlairs", () => {
  test("returns empty array for author with no records", () => {
    const flairs = computePredictorFlairs({ authorRecord: null });
    assert.deepEqual(flairs, []);
  });

  test("awards streak badge for 3+ consecutive correct calls", () => {
    const flairs = computePredictorFlairs({
      authorRecord: { correct: 3, settled: 3 },
      verdicts: [
        { status: "correct", provisional: false },
        { status: "correct", provisional: false },
        { status: "correct", provisional: false },
      ],
    });
    assert.ok(flairs.some((f) => f.id === "streak_3"));
  });

  test("awards high accuracy badge for >= 75% hit rate with min 3 calls", () => {
    const flairs = computePredictorFlairs({
      authorRecord: { correct: 4, settled: 5 },
      verdicts: [
        { status: "correct", provisional: false },
        { status: "correct", provisional: false },
      ],
    });
    assert.ok(flairs.some((f) => f.id === "high_accuracy"));
  });

  test("awards P1 last round when specified", () => {
    const flairs = computePredictorFlairs({
      authorRecord: { correct: 2, settled: 3 },
      isP1LastRound: true,
    });
    assert.ok(flairs.some((f) => f.id === "p1_last_round"));
  });

  test("returns valid CSS styling classes for each tone", () => {
    const amber = getFlairToneClasses("amber");
    assert.ok(amber.text.includes("text-amber"));
    const emerald = getFlairToneClasses("emerald");
    assert.ok(emerald.text.includes("text-emerald"));
    const cyan = getFlairToneClasses("cyan");
    assert.ok(cyan.text.includes("text-cyan"));
  });
});

