// RegionBoundary (spec §9.3, audit FEAT-06): a failed region shows an inline danger Alert with Try
// again, and says so once it has failed three times. Next's catchError needs the router, so it is
// replaced here by a pass-through and the fallback is rendered directly.
//
// Run with --experimental-test-module-mocks (see the `test` script).

import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mockModule } from "../../../lib/__tests__/support/mockModule";

mockModule("next/error", { catchError: (fallback: unknown) => fallback });

let region: typeof import("../RegionBoundary");
before(async () => {
  region = await import("../RegionBoundary");
});

const render = (label: string, error: unknown) => renderToStaticMarkup(region.RegionErrorFallback({ label }, { error, retry: () => {} }) as ReactElement);

describe("RegionErrorFallback", () => {
  test("names the region, says the rest of the page works, and offers Try again", () => {
    const html = render("the standings", new Error("boom"));
    assert.match(html, /role="alert"/);
    assert.match(html, /Couldn(?:'|&#x27;)t load the standings/);
    assert.match(html, /The rest of the page still works\./);
    assert.match(html, /<button[^>]*type="button"[^>]*>[\s\S]*Try again/);
    assert.doesNotMatch(html, /boom/, "the raw error message is never shown");
  });

  test("after three distinct failures it says the region keeps failing", () => {
    for (let i = 0; i < 2; i++) assert.match(render("the calendar", new Error(`fail ${i}`)), /The rest of the page still works/);
    assert.match(render("the calendar", new Error("fail 2")), /This keeps failing/);
  });

  test("the same error re-rendering counts once, and regions count separately", () => {
    const again = new Error("same");
    assert.equal(region.recordRegionFailure("the feed", again), 1);
    assert.equal(region.recordRegionFailure("the feed", again), 1);
    assert.equal(region.recordRegionFailure("the feed", new Error("next")), 2);
    assert.equal(region.recordRegionFailure("the rail", new Error("other")), 1);
    assert.equal(region.recordRegionFailure("the rail", "a thrown string"), 2);
    assert.equal(region.recordRegionFailure("the rail", "a thrown string"), 2);
  });
});
