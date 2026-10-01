import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Surface, isValidSurfaceNesting, surfaceNestingWarning, type SurfaceLevel, type SurfaceProps } from "../Surface";

const LEVELS: SurfaceLevel[] = [1, 2, 3];
const surface = (props: SurfaceProps, ...children: ReactNode[]) => createElement(Surface, props, ...children);
const render = (props: SurfaceProps, ...children: ReactNode[]) => renderToStaticMarkup(surface(props, ...children));

/** Renders with console.warn captured and returns only the Surface nesting warnings. */
function nestingWarnings(t: TestContext, tree: ReactElement): string[] {
  const warn = t.mock.method(console, "warn", () => {});
  renderToStaticMarkup(tree);
  return warn.mock.calls.map((call) => String(call.arguments[0])).filter((message) => message.startsWith("Surface:"));
}

test("isValidSurfaceNesting allows any level straight on the page canvas", () => {
  for (const level of LEVELS) assert.equal(isValidSurfaceNesting(undefined, level), true);
});

test("isValidSurfaceNesting allows only a higher level inside a Surface", () => {
  assert.equal(isValidSurfaceNesting(1, 2), true);
  assert.equal(isValidSurfaceNesting(1, 3), true);
  assert.equal(isValidSurfaceNesting(2, 3), true);
  const invalid: [SurfaceLevel, SurfaceLevel][] = [[1, 1], [2, 2], [3, 3], [2, 1], [3, 1], [3, 2]];
  for (const [parent, child] of invalid) assert.equal(isValidSurfaceNesting(parent, child), false, `${child} inside ${parent}`);
});

test("surfaceNestingWarning names both levels, and is null when the nesting is allowed", () => {
  assert.equal(surfaceNestingWarning(undefined, 1), null);
  assert.equal(surfaceNestingWarning(1, 3), null);
  assert.match(surfaceNestingWarning(2, 1) ?? "", /^Surface: a level 1 Surface is nested inside a level 2 Surface\./);
});

test("each level is its own surface tone on the card radius, with no border", () => {
  for (const level of LEVELS) {
    const html = render({ level }, "x");
    assert.match(html, new RegExp(`^<div class="rounded-card bg-surface-${level} p-5">x</div>$`));
    assert.doesNotMatch(html, /\bborder/);
  }
});

test("padding is md (20px) by default, sm is 16px, none adds none", () => {
  assert.match(render({ level: 1 }), /class="[^"]*\bp-5\b/);
  assert.match(render({ level: 1, padding: "sm" }), /class="[^"]*\bp-4\b/);
  assert.doesNotMatch(render({ level: 1, padding: "none" }), /\bp-\d/);
});

test("`as` picks the element, and labels pass through", () => {
  assert.match(render({ level: 1 }), /^<div /);
  assert.match(render({ level: 1, as: "section", "aria-labelledby": "rail-heading" }), /^<section aria-labelledby="rail-heading" /);
  assert.match(render({ level: 2, as: "article", "aria-label": "Prediction" }), /^<article aria-label="Prediction" /);
});

test("className is appended for layout", () => {
  assert.match(render({ level: 1, className: "col-span-2" }), /class="rounded-card bg-surface-1 p-5 col-span-2"/);
});

test("a static Surface has no link and no hover tone", () => {
  const html = render({ level: 1 }, "x");
  assert.doesNotMatch(html, /<a\b|hover:/);
});

test("interactive: the whole card is one stretched link, its first child", () => {
  const html = render(
    { level: 1, interactive: true, href: "/races/2026/bahrain", linkLabel: "Bahrain Grand Prix", as: "article" },
    createElement("h3", null, "Bahrain Grand Prix"),
    createElement("button", { type: "button" }, "Follow"),
  );
  assert.match(html, /^<article class="relative rounded-card [^"]*bg-surface-1 hover:bg-surface-2"><a /);
  assert.equal(html.match(/<a\b/g)?.length, 1, "one link per card");
  const link = html.match(/<a ([^>]*)>(.*?)<\/a>/);
  assert.ok(link, "renders the card link");
  assert.match(link[1], /href="\/races\/2026\/bahrain"/);
  assert.match(link[1], /after:absolute after:inset-0 after:rounded-card/, "its ::after covers the card");
  assert.match(link[1], /focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus-ring/);
  assert.equal(link[2], '<span class="sr-only">Bahrain Grand Prix</span>', "named by linkLabel");
});

test("interactive: nested actions stay outside the link and above it, so they keep their own clicks and focus", () => {
  const html = render({ level: 1, interactive: true, href: "/x", linkLabel: "X" }, createElement("button", { type: "button" }, "Follow"));
  assert.match(html, /<\/a><div class="pointer-events-none relative h-full [^"]*:pointer-events-auto p-5"><button type="button">Follow<\/button><\/div>/);
  assert.match(html, /\[&amp;_:where\(a,button,input,select,textarea,summary,label,\[tabindex\]\)\]:pointer-events-auto/);
});

test("interactive: hover lifts the tone one step, and the transition respects reduced motion", () => {
  assert.match(render({ level: 1, interactive: true, href: "/x", linkLabel: "X" }), /hover:bg-surface-2/);
  assert.match(render({ level: 2, interactive: true, href: "/x", linkLabel: "X" }), /hover:bg-surface-3/);
  assert.match(render({ level: 1, interactive: true, href: "/x", linkLabel: "X" }), /duration-fast ease-standard motion-reduce:transition-none/);
});

test("in development, a nested Surface that isn't higher than its parent warns", (t) => {
  const warnings = nestingWarnings(t, surface({ level: 1 }, surface({ level: 1 }, "x")));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /level 1 Surface is nested inside a level 1 Surface/);
});

test("a higher level inside a lower one is fine, at any depth and for siblings", (t) => {
  const deep = surface({ level: 2 }, surface({ level: 3 }, "x"));
  const sibling = surface({ level: 2 }, "y");
  assert.deepEqual(nestingWarnings(t, surface({ level: 1 }, createElement("div", null, deep), createElement("div", null, sibling))), []);
});

test("the nearest Surface is the parent that counts", (t) => {
  // 1 > 2 > 2: the innermost breaks the rule against its own parent, not against the outer 1.
  const warnings = nestingWarnings(t, surface({ level: 1 }, surface({ level: 2 }, surface({ level: 2 }, "x"))));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /level 2 Surface is nested inside a level 2 Surface/);
});

test("the nesting warning is development-only", (t) => {
  const env = process.env as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    assert.deepEqual(nestingWarnings(t, surface({ level: 2 }, surface({ level: 1 }, "x"))), []);
  } finally {
    if (previous === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous;
  }
});
