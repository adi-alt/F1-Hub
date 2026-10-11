// Which archive circuit a live race's history comes from. The 2026 Bahrain Grand Prix ran at Sepang, so its
// row reads "Kuala Lumpur, Bahrain" while the archive files Sepang under Malaysia: the old exact
// locality-and-country match found nothing, and the race page's history showed none of 1999-2017.

import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ArchiveCircuit } from "../supabase/archive";

let find: typeof import("../supabase/archive").findArchiveCircuitByLocation;
before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://placeholder.supabase.co";
  process.env.SUPABASE_SECRET_KEY ??= "placeholder";
  ({ findArchiveCircuitByLocation: find } = await import("../supabase/archive"));
});

const circuit = (circuitId: string, locality: string, country: string) => ({ circuitId, locality, country }) as unknown as ArchiveCircuit;
const circuits = [
  circuit("sepang", "Kuala Lumpur", "Malaysia"),
  circuit("bahrain", "Sakhir", "Bahrain"),
  circuit("catalunya", "Barcelona", "Spain"),
  circuit("pedralbes", "Barcelona", "Spain"),
  circuit("montjuic", "Barcelona", "Spain"),
];

describe("findArchiveCircuitByLocation", () => {
  it("matches locality and country when both agree", () => {
    assert.equal(find(circuits, "Sakhir", "Bahrain")?.circuitId, "bahrain");
  });

  it("finds Sepang for the 2026 Bahrain GP, whose country is the event's, not the venue's", () => {
    assert.equal(find(circuits, "Kuala Lumpur", "Bahrain")?.circuitId, "sepang");
  });

  it("does not guess when several circuits share the locality and the country doesn't settle it", () => {
    assert.equal(find(circuits, "Barcelona", "Catalonia"), null);
  });

  it("finds nothing for a locality the archive doesn't have", () => {
    assert.equal(find(circuits, "Las Vegas", "United States"), null);
  });
});
