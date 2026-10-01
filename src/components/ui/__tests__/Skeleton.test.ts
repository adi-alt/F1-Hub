import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Skeleton, SkeletonGroup, type SkeletonShape } from "../Skeleton";
import { assertClasses, classesOf, classesWithoutCss, cssFor } from "./rawMarkup";

const SHAPES: SkeletonShape[] = ["text", "block", "circle", "row"];
const render = (shape?: SkeletonShape, className?: string) => renderToStaticMarkup(createElement(Skeleton, { shape, className }));

describe("Skeleton", () => {
  it("is hidden from assistive tech in every shape", () => {
    for (const shape of SHAPES) assert.match(render(shape), /^<span aria-hidden="true" class="[^"]*"><\/span>$/, shape);
  });

  it("is one line of text by default", () => {
    assert.equal(render(), render("text"));
  });

  it("text fills one body-sm line box (20px) and draws the bar shorter, so stacked lines stay apart", () => {
    assertClasses(render("text"), ["block", "h-5", "scale-y-60"]);
  });

  it("row is one table row tall", () => {
    assertClasses(render("row"), ["block", "h-11"]);
  });

  it("circle is round and block is card-rounded, both sized by their layout classes alone", () => {
    assertClasses(render("circle", "size-10"), ["rounded-full", "size-10"]);
    assertClasses(render("block", "h-40 w-full"), ["rounded-card", "h-40", "w-full"]);
    for (const shape of ["block", "circle"] as const) {
      assert.ok(!classesOf(render(shape)).some((cls) => /^(h|w|size)-/.test(cls)), `${shape} brings no size of its own to fight the layout`);
    }
  });

  it("adds layout classes after its own", () => {
    assert.match(render("text", "w-2/3"), /class="[^"]*rounded-control w-2\/3"/);
    assert.doesNotMatch(render("text"), /undefined/);
  });

  it("pulses opacity on a 1.6 s cycle and holds still under reduced motion", async () => {
    for (const shape of SHAPES) assertClasses(render(shape), ["animate-[pulse_1.6s_ease-in-out_infinite]", "motion-reduce:animate-none"]);
    const css = await cssFor(["animate-[pulse_1.6s_ease-in-out_infinite]", "motion-reduce:animate-none"]);
    assert.match(css, /animation: pulse 1\.6s ease-in-out infinite;/);
    // Tailwind only emits the keyframes when something uses them, and they touch opacity alone.
    assert.match(css, /@keyframes pulse \{\s*50% \{\s*opacity: 0\.5;\s*\}\s*\}/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.motion-reduce\\:animate-none \{\s*animation: none;/);
  });
});

describe("SkeletonGroup", () => {
  it("announces loading once for the whole group", () => {
    const html = renderToStaticMarkup(
      createElement(SkeletonGroup, { className: "flex flex-col gap-2" }, createElement(Skeleton), createElement(Skeleton), createElement(Skeleton, { shape: "row" })),
    );
    assert.match(html, /^<div role="status" class="flex flex-col gap-2"><span class="sr-only">Loading…<\/span>/);
    assert.equal(html.match(/Loading…/g)?.length, 1);
    assert.equal(html.match(/<span aria-hidden="true"/g)?.length, 3);
  });

  it("can say what is loading", () => {
    const html = renderToStaticMarkup(createElement(SkeletonGroup, { label: "Loading standings…" }, createElement(Skeleton, { shape: "row" })));
    assert.match(html, /<span class="sr-only">Loading standings…<\/span>/);
    assert.doesNotMatch(html, /class=""/);
  });
});

it("uses only classes Tailwind generates", async () => {
  const html = SHAPES.map((shape) => render(shape, "w-1/2")).join("") + renderToStaticMarkup(createElement(SkeletonGroup, null, createElement(Skeleton)));
  assert.deepEqual(await classesWithoutCss(html), []);
});
