import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Section, SectionHeader, sectionHeadingId, type SectionHeaderProps, type SectionProps } from "../Section";

const render = (props: SectionProps) => renderToStaticMarkup(createElement(Section, props));
const renderHeader = (props: SectionHeaderProps) => renderToStaticMarkup(createElement(SectionHeader, props));
const typeSizes = (html: string) => new Set(html.match(/\btext-(caption|body-sm|body|title-md|title-lg|display-md|display-lg)\b/g));

const FULL: SectionProps = {
  id: "results",
  title: "Results",
  level: 2,
  description: "Final classification after penalties.",
  provenance: { source: "Official classification", updated: "17:42" },
  actions: createElement("button", { type: "button" }, "Export"),
  children: createElement("table", null),
};

test("sectionHeadingId derives the heading id from the section id", () => {
  assert.equal(sectionHeadingId("results"), "results-heading");
  assert.equal(sectionHeadingId("race-pace"), "race-pace-heading");
});

test("a level 2 Section is a region labelled by its own h2, Season's eyebrow over a hairline", () => {
  const html = render({ id: "results", title: "Results", level: 2, children: "table" });
  assert.match(html, /^<section id="results" aria-labelledby="results-heading">/);
  assert.match(html, /<h2 id="results-heading" class="min-w-0 text-caption font-semibold uppercase tracking-\[0.16em\] text-tertiary">Results<\/h2>/);
  assert.match(html, /<div aria-hidden="true" class="mt-2 h-px w-full [^"]*"><\/div>/);
  assert.doesNotMatch(html, /<h[13-6]\b/);
});

test("a level 3 Section renders an h3 in title-md", () => {
  const html = render({ id: "qualifying", title: "Qualifying", level: 3, children: "chart" });
  assert.match(html, /^<section id="qualifying" aria-labelledby="qualifying-heading">/);
  assert.match(html, /<h3 id="qualifying-heading" class="text-title-md text-primary">Qualifying<\/h3>/);
  assert.doesNotMatch(html, /<h[124-6]\b/);
});

test("the description is body-sm text-secondary, and the provenance line follows it", () => {
  const html = render(FULL);
  assert.match(html, /<p class="mt-2 text-body-sm text-secondary">Final classification after penalties\.<\/p>/);
  assert.match(html, /<p class="text-caption text-tertiary [^"]*">Official classification · updated 17:42<\/p>/);
  assert.ok(html.indexOf("Final classification after") < html.indexOf("Official classification ·"));
});

test("actions sit beside the eyebrow, on the right, above the hairline", () => {
  const html = render(FULL);
  assert.match(html, /<\/h2><div class="flex min-w-0 max-w-full flex-wrap items-center gap-2"><button type="button">Export<\/button><\/div><\/div><div aria-hidden/);
});

test("the content follows the header", () => {
  const html = render(FULL);
  assert.ok(html.indexOf("<table>") > html.indexOf("Export"));
  assert.match(html, /<table><\/table><\/section>$/);
});

test("optional parts are left out entirely", () => {
  const html = render({ id: "results", title: "Results", level: 2, children: "x" });
  assert.doesNotMatch(html, /<p\b|shrink-0/);
});

test("at most two type sizes in a page section's head: the 12px eyebrow and caption, the body-sm description", () => {
  const html = render(FULL);
  assert.deepEqual(typeSizes(html), new Set(["text-body-sm", "text-caption"]));
});

test("a level 3 heading stays a sentence-case title, never an eyebrow", () => {
  assert.doesNotMatch(renderHeader({ title: "Weather", level: 3 }), /uppercase|tracking-/);
});

test("SectionHeader works on its own, without a section or an id", () => {
  const html = renderHeader({ title: "Weather", level: 3 });
  assert.doesNotMatch(html, /<section|aria-labelledby/);
  assert.match(html, /<h3 class="text-title-md text-primary">Weather<\/h3>/);
});

test("SectionHeader takes a heading id for a region it labels, and className for layout", () => {
  const html = renderHeader({ title: "Weather", level: 2, headingId: "weather-heading", className: "mb-6" });
  assert.match(html, /<h2 id="weather-heading" class="min-w-0 [^"]*uppercase[^"]*">Weather<\/h2>/);
  assert.match(html, /^<div class="mb-6">/);
});

test("Section className is for layout and lands on the section", () => {
  assert.match(render({ id: "s", title: "S", level: 2, className: "lg:col-span-8", children: "x" }), /^<section id="s" aria-labelledby="s-heading" class="lg:col-span-8">/);
});
