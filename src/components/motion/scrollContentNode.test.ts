import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveScrollContent, type ScrollNode } from "./scrollContentNode";

type Fake = ScrollNode & { name: string };
const el = (name: string, children: Fake[] = []): Fake => ({ name, children });

test("a lone child is the content wrapper", () => {
  const only = el("wrapper");
  assert.equal(resolveScrollContent(el("region", [only])), only);
});

test("several children measure the container, never just the first", () => {
  // The Communities centre column: a mobile-only selector (display:none at lg, so height 0)
  // followed by the feed. Measuring the first child caps the scroll limit at zero and the feed
  // can never be scrolled to its end.
  const hiddenSelector = el("mobile-selector");
  const feed = el("feed");
  const region = el("region", [hiddenSelector, feed]);
  assert.equal(resolveScrollContent(region), region);
  assert.notEqual(resolveScrollContent(region), hiddenSelector);
});

test("an empty region falls back to itself rather than undefined", () => {
  const region = el("region", []);
  assert.equal(resolveScrollContent(region), region);
});
