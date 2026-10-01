import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Inbox } from "lucide-react";
import { EmptyState, type EmptyStateProps } from "../EmptyState";
import { Surface } from "../Surface";

const render = (props: EmptyStateProps) => renderToStaticMarkup(createElement(EmptyState, props));
const MESSAGE = "No results yet: the race starts Sun 17:00.";

test("unboxed by default: icon, one sentence and the action, with no card around them", () => {
  const html = render({ icon: Inbox, message: MESSAGE, action: createElement("button", { type: "button" }, "Set a reminder") });
  assert.match(html, /^<div class="flex flex-col items-center gap-3 text-center px-4 py-8">/);
  assert.doesNotMatch(html, /bg-surface|rounded-card|\bborder/);
  assert.match(html, /<p class="max-w-md text-body-sm text-secondary">No results yet: the race starts Sun 17:00\.<\/p>/);
  assert.ok(html.indexOf("Set a reminder") > html.indexOf(MESSAGE), "the action comes after the sentence");
});

test("the icon is decorative and optional", () => {
  const svg = render({ icon: Inbox, message: MESSAGE }).match(/<svg[^>]*>/)?.[0] ?? "";
  assert.match(svg, /aria-hidden="true"/);
  assert.match(svg, /width="24" height="24"/);
  assert.match(svg, /stroke-width="1.75"/);
  assert.match(svg, /text-tertiary/);
  assert.doesNotMatch(render({ message: MESSAGE }), /<svg/);
});

test("no action, no action row", () => {
  assert.equal(render({ message: MESSAGE }), `<div class="flex flex-col items-center gap-3 text-center px-4 py-8"><p class="max-w-md text-body-sm text-secondary">${MESSAGE}</p></div>`);
});

test("boxed is a level 1 surface card, for a page that is empty as a whole", () => {
  const html = render({ boxed: true, message: "You haven't joined a community yet." });
  assert.match(html, /^<div class="rounded-card bg-surface-1"><div class="flex flex-col items-center gap-3 text-center px-6 py-12">/);
  assert.match(html, /<p class="max-w-md text-body text-secondary">/);
});

test("className is for layout and lands on the outermost element", () => {
  assert.match(render({ message: MESSAGE, className: "min-h-80" }), /^<div class="[^"]*py-8 min-h-80">/);
  assert.match(render({ boxed: true, message: MESSAGE, className: "mt-12" }), /^<div class="rounded-card bg-surface-1 mt-12"><div class="[^"]*py-12">/);
});

test("boxed inside another Surface trips the nesting warning; unboxed doesn't", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const nestingWarnings = () => warn.mock.calls.filter((call) => String(call.arguments[0]).startsWith("Surface:")).length;

  renderToStaticMarkup(createElement(Surface, { level: 1 }, createElement(EmptyState, { message: MESSAGE })));
  assert.equal(nestingWarnings(), 0);
  renderToStaticMarkup(createElement(Surface, { level: 1 }, createElement(EmptyState, { boxed: true, message: MESSAGE })));
  assert.equal(nestingWarnings(), 1);
});
