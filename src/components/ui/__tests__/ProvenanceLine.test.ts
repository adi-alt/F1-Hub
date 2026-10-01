import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProvenanceLine, formatProvenanceTime, provenanceText, type ProvenanceLineProps } from "../ProvenanceLine";

const render = (props: ProvenanceLineProps) => renderToStaticMarkup(createElement(ProvenanceLine, props));
const LIGHTS_OUT_PLUS = new Date("2026-10-04T16:42:00Z");

test("provenanceText joins source, status and time with ' · '", () => {
  assert.equal(provenanceText({ source: "Official classification", updated: "17:42" }), "Official classification · updated 17:42");
  assert.equal(provenanceText({ source: "OpenF1", status: "preliminary", updated: "17:42" }), "OpenF1 · preliminary · updated 17:42");
  assert.equal(provenanceText({ source: "Apex model v2", status: "frozen before qualifying" }), "Apex model v2 · frozen before qualifying");
  assert.equal(provenanceText({ source: "OpenF1" }), "OpenF1");
});

test("provenanceText never leaves a dangling separator", () => {
  assert.equal(provenanceText({ source: "OpenF1", status: "", updated: "" }), "OpenF1");
  assert.equal(provenanceText({ source: "OpenF1", updated: "3 min ago" }), "OpenF1 · updated 3 min ago");
});

test("formatProvenanceTime prints a zero-padded 24-hour time in the given zone", () => {
  assert.equal(formatProvenanceTime(LIGHTS_OUT_PLUS, "UTC"), "16:42");
  assert.equal(formatProvenanceTime(LIGHTS_OUT_PLUS, "Europe/London"), "17:42");
  assert.equal(formatProvenanceTime(LIGHTS_OUT_PLUS, "Asia/Bahrain"), "19:42");
  assert.equal(formatProvenanceTime(new Date("2026-10-04T08:05:00Z"), "UTC"), "08:05");
});

test("formatProvenanceTime runs a 23-hour clock: just after midnight is 00:05, never 24:05", () => {
  assert.equal(formatProvenanceTime(new Date("2026-10-04T23:05:00Z"), "Europe/London"), "00:05");
});

test("formatProvenanceTime gives nothing for an invalid date", () => {
  assert.equal(formatProvenanceTime(new Date("not a date"), "UTC"), undefined);
});

test("renders one caption line in text-tertiary with tabular figures, worded exactly as provenanceText", () => {
  for (const props of [
    { source: "Official classification", updated: "17:42" },
    { source: "OpenF1", status: "preliminary", updated: "3 min ago" },
    { source: "Apex model v2", status: "frozen before qualifying" },
  ]) {
    assert.equal(render(props), `<p class="text-caption text-tertiary tabular">${provenanceText(props)}</p>`);
  }
  assert.equal(provenanceText({ source: "Official classification", updated: "17:42" }), "Official classification · updated 17:42");
});

test("a Date renders in a time element carrying its exact instant", () => {
  const html = render({ source: "OpenF1", status: "preliminary", updatedAt: LIGHTS_OUT_PLUS, timeZone: "Europe/London" });
  assert.equal(html, '<p class="text-caption text-tertiary tabular">OpenF1 · preliminary · updated <time dateTime="2026-10-04T16:42:00.000Z">17:42</time></p>');
});

test("an invalid Date drops the time instead of printing Invalid Date", () => {
  const html = render({ source: "OpenF1", updatedAt: new Date("nope"), timeZone: "UTC" });
  assert.equal(html, '<p class="text-caption text-tertiary tabular">OpenF1</p>');
});

test("source alone, and className for layout", () => {
  assert.equal(render({ source: "Met Office", className: "mt-2" }), '<p class="text-caption text-tertiary tabular mt-2">Met Office</p>');
});
