import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageHeader, type Breadcrumb, type PageHeaderProps } from "../PageHeader";

const render = (props: PageHeaderProps) => renderToStaticMarkup(createElement(PageHeader, props));
const typeSizes = (html: string) => new Set(html.match(/\btext-(caption|body-sm|body|title-md|title-lg|display-md|display-lg)\b/g));
/** The opening tag's attributes of the element whose whole content is `text`. */
const attributesOf = (html: string, text: string) => html.match(new RegExp(`<(a|span)\\b([^>]*)>${text}</\\1>`))?.[2];

const CRUMBS: Breadcrumb[] = [{ label: "Races", href: "/races" }, { label: "2026", href: "/races/2026" }, { label: "Bahrain Grand Prix" }];

const FULL: PageHeaderProps = {
  title: "Bahrain Grand Prix",
  breadcrumbs: CRUMBS,
  eyebrow: "Round 4 · Sakhir",
  meta: "Sun 12 Apr · 17:00 your time",
  badge: createElement("span", { "data-badge": "" }, "Live"),
  actions: createElement("button", { type: "button" }, "Enter prediction"),
};

test("renders the page's one h1, in display-md, and no other heading", () => {
  const html = render(FULL);
  assert.equal(html.match(/<h1\b/g)?.length, 1);
  assert.match(html, /<h1 class="text-display-md text-primary">Bahrain Grand Prix<\/h1>/);
  assert.doesNotMatch(html, /<h[2-6]\b/);
});

test("breadcrumbs are a labelled nav around an ordered list", () => {
  const html = render(FULL);
  assert.match(html, /^<header [^>]*><nav aria-label="Breadcrumb"><ol\b/);
  assert.equal(html.match(/<li\b/g)?.length, CRUMBS.length);
});

test("ancestors are links with the focus ring; the last item is the current page", () => {
  const html = render(FULL);
  for (const crumb of CRUMBS.slice(0, -1)) {
    const attributes = attributesOf(html, crumb.label) ?? "";
    assert.match(attributes, new RegExp(`href="${crumb.href}"`));
    assert.match(attributes, /focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring/);
    assert.doesNotMatch(attributes, /aria-current/);
  }
  assert.equal(html.match(/aria-current="page"/g)?.length, 1);
  assert.match(html, /<span aria-current="page" class="text-primary">Bahrain Grand Prix<\/span><\/li><\/ol><\/nav>/);
});

test("a current-page crumb that has an href stays a link, still marked current", () => {
  const html = render({ title: "Bahrain Grand Prix", breadcrumbs: [{ label: "Races", href: "/races" }, { label: "Bahrain", href: "/races/bahrain" }] });
  const attributes = attributesOf(html, "Bahrain") ?? "";
  assert.match(attributes, /aria-current="page"/);
  assert.match(attributes, /href="\/races\/bahrain"/);
});

test("breadcrumb separators are decorative icons between items", () => {
  const svgs = render(FULL).match(/<svg[^>]*>/g) ?? [];
  assert.equal(svgs.length, CRUMBS.length - 1);
  for (const svg of svgs) {
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /width="16" height="16"/);
    assert.match(svg, /stroke-width="1.75"/);
  }
});

test("no breadcrumbs, no nav", () => {
  assert.doesNotMatch(render({ title: "Races" }), /<nav|<ol/);
});

test("the eyebrow is one caption line in text-secondary, above the h1", () => {
  const html = render(FULL);
  assert.match(html, /<p class="mb-1 text-caption text-secondary">Round 4 · Sakhir<\/p>/);
  assert.ok(html.indexOf("Round 4 · Sakhir") < html.indexOf("<h1"));
  assert.doesNotMatch(render({ title: "Races" }), /text-caption/);
});

test("badge sits beside the title, meta under it, actions after the title block", () => {
  const html = render(FULL);
  assert.match(html, /<\/h1><span data-badge="">Live<\/span><\/div>/);
  assert.match(html, /<div class="mt-2 text-body-sm text-secondary">Sun 12 Apr · 17:00 your time<\/div>/);
  assert.ok(html.indexOf("Enter prediction") > html.indexOf("Sun 12 Apr"));
  assert.match(html, /<div class="flex shrink-0 flex-wrap items-center gap-2"><button type="button">Enter prediction<\/button><\/div>/);
});

test("optional slots are left out entirely", () => {
  const html = render({ title: "Races" });
  assert.equal(html, '<header class="flex flex-col gap-3"><div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-4"><div class="min-w-0 grow basis-80"><div class="flex flex-wrap items-center gap-x-3 gap-y-2"><h1 class="text-display-md text-primary">Races</h1></div></div></div></header>');
});

test("sentence case, at most three type sizes", () => {
  const html = render(FULL);
  assert.doesNotMatch(html, /uppercase|tracking-/);
  assert.deepEqual(typeSizes(html), new Set(["text-body-sm", "text-caption", "text-display-md"]));
});

test("className is for layout and lands on the header", () => {
  assert.match(render({ title: "Races", className: "mb-12" }), /^<header class="flex flex-col gap-3 mb-12">/);
});
