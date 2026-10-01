import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WifiOff } from "lucide-react";
import { Alert, alertRole, type AlertProps, type AlertTone } from "../Alert";

const TONES: AlertTone[] = ["info", "warning", "danger", "success"];
const render = (props: AlertProps) => renderToStaticMarkup(createElement(Alert, props));
const typeSizes = (html: string) => new Set(html.match(/\btext-(caption|body-sm|body|title-md|title-lg|display-md|display-lg)\b/g));

test("alertRole: danger is an alert, every other tone a status", () => {
  assert.equal(alertRole("danger"), "alert");
  for (const tone of ["info", "warning", "success"] as const) assert.equal(alertRole(tone), "status");
});

test("the role lands on the alert itself", () => {
  for (const tone of TONES) assert.match(render({ tone, title: "Heads up" }), new RegExp(`^<div role="${alertRole(tone)}" `));
});

test("each tone has its own decorative icon, so the tone never rests on colour alone", () => {
  const expected: Record<AlertTone, string> = {
    info: "lucide-info",
    warning: "lucide-triangle-alert",
    danger: "lucide-circle-alert",
    success: "lucide-circle-check",
  };
  for (const tone of TONES) {
    const svg = render({ tone, title: "Heads up" }).match(/<svg[^>]*>/)?.[0] ?? "";
    assert.match(svg, new RegExp(`class="lucide ${expected[tone]}\\b`), tone);
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /width="20" height="20"/);
    assert.match(svg, /stroke-width="1.75"/);
  }
});

test("danger is the danger coral on danger-subtle, never brand red", () => {
  const html = render({ tone: "danger", title: "Results couldn't be loaded", action: createElement("button", { type: "button" }, "Retry") });
  assert.match(html, /^<div role="alert" class="[^"]*\bbg-danger-subtle\b/);
  assert.match(html, /<svg[^>]*class="[^"]*\btext-danger\b/);
  assert.doesNotMatch(html, /brand|f1-red/);
});

test("the other tones tint with their own colour", () => {
  for (const tone of ["info", "warning", "success"] as const) {
    const html = render({ tone, title: "Heads up" });
    assert.match(html, new RegExp(`^<div role="status" class="[^"]*\\bbg-${tone}/10\\b`));
    assert.match(html, new RegExp(`<svg[^>]*class="[^"]*\\btext-${tone}\\b`));
  }
});

test("title, body and action", () => {
  const html = render({
    tone: "danger",
    title: "Results couldn't be loaded",
    children: "The timing feed didn't answer.",
    action: createElement("button", { type: "button" }, "Retry"),
  });
  assert.match(html, /<p class="font-medium text-primary">Results couldn&#x27;t be loaded<\/p><div class="mt-1 text-secondary">The timing feed didn&#x27;t answer\.<\/div>/);
  assert.match(html, /<div class="flex shrink-0 flex-wrap items-center gap-2"><button type="button">Retry<\/button><\/div><\/div>$/);
});

test("a body without a title reads in text-primary", () => {
  const html = render({ tone: "warning", children: "Some historical data couldn't be loaded." });
  assert.match(html, /<div class="text-primary">Some historical data couldn&#x27;t be loaded\.<\/div>/);
  assert.doesNotMatch(html, /font-medium/);
});

test("icon replaces the tone's default", () => {
  const html = render({ tone: "warning", icon: WifiOff, title: "Live timing is offline" });
  assert.match(html, /lucide-wifi-off/);
  assert.doesNotMatch(html, /lucide-triangle-alert/);
  assert.match(html, /<svg[^>]*class="[^"]*\btext-warning\b/);
});

test("one type size, and className for layout", () => {
  const html = render({ tone: "info", title: "Heads up", children: "Body", className: "mb-6" });
  assert.deepEqual(typeSizes(html), new Set(["text-body-sm"]));
  assert.match(html, /^<div role="status" class="[^"]* bg-info\/10 mb-6">/);
});
