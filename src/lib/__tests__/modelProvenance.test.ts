import { test } from "node:test";
import assert from "node:assert/strict";
import { modelProvenanceLine } from "../modelProvenance";
import { provenanceText } from "../../components/ui/ProvenanceLine";

test("uses the pipeline's provenance stamp, cut-off included", () => {
  const line = modelProvenanceLine(
    { modelVersion: "old", generatedAt: "2026-01-01T00:00:00Z", provenance: { modelVersion: "simulator-v2", dataCutoff: "2026 R13 Dutch Grand Prix", generatedAt: "2026-10-23T09:30:00+00:00" } },
    "10,000 simulated races",
  );
  assert.equal(provenanceText(line), "Apex model simulator-v2 · 10,000 simulated races · data to 2026 R13 Dutch Grand Prix · updated 23 Oct");
});

test("older outputs without a stamp fall back to their own version and time", () => {
  assert.equal(provenanceText(modelProvenanceLine({ modelVersion: "pole-v1", generatedAt: "2026-03-05T12:00:00Z" })), "Apex model pole-v1 · updated 5 Mar");
  assert.equal(provenanceText(modelProvenanceLine({ modelVersion: "pole-v1", provenance: { modelVersion: "pole-v1", dataCutoff: null, generatedAt: "bad" } })), "Apex model pole-v1");
});
