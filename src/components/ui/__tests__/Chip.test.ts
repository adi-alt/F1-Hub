import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Chip, type ChipProps } from "../Chip";

const FOCUS_RING = ["focus-visible:outline-2", "focus-visible:outline-offset-2", "focus-visible:outline-focus-ring"];
const noop = () => {};

const render = (props: ChipProps) => renderToStaticMarkup(createElement(Chip, props));

/** The outermost element's tag, attribute text and classes. */
function root(markup: string) {
  const open = markup.match(/^<([a-z]+)([^>]*)>/);
  assert.ok(open, `no element in: ${markup}`);
  return { tag: open[1], attrs: open[2], classes: open[2].match(/ class="([^"]*)"/)?.[1].split(" ") ?? [] };
}

/** The visible text: the markup with every tag removed. */
const text = (markup: string) => markup.replace(/<[^>]+>/g, "");

/** Each <button>'s attribute text, in order. */
const buttons = (markup: string) => [...markup.matchAll(/<button([^>]*)>/g)].map((match) => match[1]);

test("a plain tag: outlined, fully rounded, body-sm, and nothing to press", () => {
  const markup = render({ children: "Strategy" });
  const { tag, classes } = root(markup);
  assert.equal(tag, "span");
  for (const cls of ["border", "border-strong", "rounded-full", "text-body-sm", "text-secondary"]) assert.ok(classes.includes(cls), cls);
  assert.equal(buttons(markup).length, 0);
  assert.doesNotMatch(markup, /aria-pressed/);
  assert.equal(text(markup), "Strategy");
});

test("with onClick it is a toggle button: aria-pressed false, then true when selected", () => {
  const [off] = buttons(render({ onClick: noop, children: "Ferrari" }));
  assert.match(off, / type="button"/);
  assert.match(off, / aria-pressed="false"/);
  const [on] = buttons(render({ onClick: noop, selected: true, children: "Ferrari" }));
  assert.match(on, / aria-pressed="true"/);
});

test("selected: surface-2 fill, primary text and a check mark, so the state is not colour alone", () => {
  const on = render({ onClick: noop, selected: true, children: "Ferrari" });
  const { classes } = root(on);
  assert.ok(classes.includes("bg-surface-2") && classes.includes("text-primary"));
  assert.match(on, /lucide-check[^>]*aria-hidden="true"/);
  assert.equal(text(on), "Ferrari");

  const off = render({ onClick: noop, children: "Ferrari" });
  assert.ok(!root(off).classes.includes("bg-surface-2"));
  assert.ok(root(off).classes.includes("text-secondary"));
  assert.doesNotMatch(off, /lucide-check/);
});

test("onRemove: a separate 24px button named after the chip", () => {
  const markup = render({ onRemove: noop, children: "Strategy" });
  const [remove] = buttons(markup);
  assert.ok(remove, "renders a remove button");
  assert.match(remove, / type="button"/);
  assert.match(remove, / aria-label="Remove Strategy"/);
  assert.match(remove, /\bsize-6\b/, "a 24x24 hit area");
  assert.match(markup, /lucide-x[^>]*aria-hidden="true"/);
  assert.equal(text(markup), "Strategy");
});

test("toggle and remove are sibling buttons, never one inside the other", () => {
  const markup = render({ onClick: noop, onRemove: noop, selected: true, children: "Strategy" });
  assert.deepEqual(markup.match(/<\/?button\b/g), ["<button", "</button", "<button", "</button"]);
  const [toggle, remove] = buttons(markup);
  assert.match(toggle, / aria-pressed="true"/);
  assert.match(remove, / aria-label="Remove Strategy"/);
});

test("every button in a chip has the focus ring", () => {
  const found = buttons(render({ onClick: noop, onRemove: noop, children: "Strategy" }));
  assert.equal(found.length, 2);
  for (const attrs of found) for (const cls of FOCUS_RING) assert.ok(attrs.includes(cls), cls);
});

test("a layout class reaches the chip", () => {
  assert.ok(root(render({ children: "Strategy", className: "mr-2" })).classes.includes("mr-2"));
});

test("selected needs onClick (a compile-time check)", () => {
  // `tsc --noEmit` fails if this line stops being a type error.
  // @ts-expect-error a selected look with nothing to press would be invisible to assistive technology
  const selectedTag: ChipProps = { selected: true, children: "Strategy" };
  const selectedToggle: ChipProps = { selected: true, onClick: noop, children: "Strategy" };
  assert.ok(selectedTag && selectedToggle);
});
