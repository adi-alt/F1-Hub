import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Lock } from "lucide-react";
import { Icon, type IconProps } from "../Icon";

const render = (props: IconProps) => renderToStaticMarkup(createElement(Icon, props));

/** The <svg>'s classes. */
const classes = (markup: string) => markup.match(/^<svg[^>]* class="([^"]*)"/)?.[1].split(" ") ?? [];

test("decorative by default: hidden from assistive technology, with no role or name", () => {
  const svg = render({ icon: Lock });
  assert.match(svg, /^<svg[^>]* aria-hidden="true"/);
  assert.doesNotMatch(svg, / role=| aria-label=/);
});

test("with a label it is announced as an image of that name", () => {
  const svg = render({ icon: Lock, label: "Locked" });
  assert.match(svg, / role="img"/);
  assert.match(svg, / aria-label="Locked"/);
  assert.doesNotMatch(svg, /aria-hidden/);
});

test("an empty label stays decorative rather than announcing a nameless image", () => {
  const svg = render({ icon: Lock, label: "" });
  assert.match(svg, / aria-hidden="true"/);
  assert.doesNotMatch(svg, / role=/);
});

test("stroke 1.75 at 16, 20 or 24px, and 20 by default", () => {
  assert.match(render({ icon: Lock }), / width="20" height="20"/);
  for (const size of [16, 20, 24] as const) {
    const svg = render({ icon: Lock, size });
    assert.ok(svg.includes(` width="${size}" height="${size}"`), `${size}px`);
    assert.match(svg, / stroke-width="1.75"/);
  }
  // @ts-expect-error only the three sizes exist (a compile-time check: tsc fails if this line type-checks)
  assert.ok(render({ icon: Lock, size: 18 }));
});

test("className adds layout classes beside the default shrink-0", () => {
  const found = classes(render({ icon: Lock, className: "mt-0.5" }));
  assert.ok(found.includes("shrink-0") && found.includes("mt-0.5"));
});
