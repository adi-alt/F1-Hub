// The home's AGREE/DISAGREE verdict is computed, never model-written (roadmap R-44, AI-09).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { applyPredictionVerdict, generateDeterministicFallback, predictionVerdict } from "../fallback";
const emptyHomepageIntelligence = () => ({ ...generateDeterministicFallback({}).data, predictionChallenge: null });

describe("predictionVerdict", () => {
  it("compares codes: same driver agrees, a different one disagrees", () => {
    assert.equal(predictionVerdict({ userWinnerCode: "VER", submitted: true, modelPickCode: "VER" }), "AGREE");
    assert.equal(predictionVerdict({ userWinnerCode: "NOR", submitted: true, modelPickCode: "VER" }), "DISAGREE");
  });
  it("no submitted pick is NO_PICK; a pick with no model pick has no verdict", () => {
    assert.equal(predictionVerdict({ userWinnerCode: "VER", submitted: false, modelPickCode: "VER" }), "NO_PICK");
    assert.equal(predictionVerdict({ userWinnerCode: null, submitted: true, modelPickCode: "VER" }), "NO_PICK");
    assert.equal(predictionVerdict({ userWinnerCode: "VER", submitted: true, modelPickCode: null }), null);
  });
});

describe("applyPredictionVerdict", () => {
  const ctx = { verdict: { userWinnerCode: "NOR", submitted: true, modelPickCode: "VER", modelPickName: "Max Verstappen", userPickName: "Lando Norris" } };
  const written = (status: "AGREE" | "DISAGREE") => ({ ...emptyHomepageIntelligence(), predictionChallenge: { status, explanation: "model text", strongestEvidenceForUser: "a", strongestEvidenceAgainstUser: "b" } });

  it("keeps the model's explanation when it argues the computed verdict", () => {
    const out = applyPredictionVerdict(written("DISAGREE"), ctx);
    assert.equal(out.predictionChallenge?.status, "DISAGREE");
    assert.equal(out.predictionChallenge?.explanation, "model text");
  });
  it("overrides a model that decided the verdict wrongly, text included", () => {
    const out = applyPredictionVerdict(written("AGREE"), ctx);
    assert.equal(out.predictionChallenge?.status, "DISAGREE");
    assert.match(out.predictionChallenge!.explanation, /Lando Norris.*Max Verstappen/);
  });
  it("fills a missing challenge, and the fallback uses the same verdict", () => {
    assert.equal(applyPredictionVerdict(emptyHomepageIntelligence(), ctx).predictionChallenge?.status, "DISAGREE");
    assert.equal(generateDeterministicFallback(ctx).data.predictionChallenge?.status, "DISAGREE");
  });
});

describe("homepage-intelligence route", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/ai/homepage-intelligence/route.ts"), "utf8");
  it("applies the computed verdict to cached and fresh responses", () => {
    assert.match(source, /data: withVerdict\(data\)/);
    assert.match(source, /data: withVerdict\(output\.data\)/);
  });
  it("never stamps the visit itself (the beacon does, when a visit ends)", () => {
    assert.ok(!/touchHomepageVisit/.test(source));
  });
});
