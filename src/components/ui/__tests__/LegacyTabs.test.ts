import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Tabs, tabIdFor } from "../LegacyTabs";
import { attr } from "./rawMarkup";

const ITEMS = [
  { key: "overview", label: "Overview" },
  { key: "form", label: "Form" },
];
const noop = () => {};
const tabs = (html: string) => [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);

describe("LegacyTabs ARIA wiring (audit UI-31)", () => {
  it("names each tab from the panel id and points every tab at that panel", () => {
    const html = renderToStaticMarkup(createElement(Tabs, { items: ITEMS, activeKey: "form", onChange: noop, layoutId: "t", panelId: "your-f1-panel" }));
    const [overview, form] = tabs(html);
    assert.equal(attr(overview, "id"), "your-f1-panel-tab-overview");
    assert.equal(attr(form, "id"), tabIdFor("your-f1-panel", "form"));
    assert.equal(attr(overview, "aria-controls"), "your-f1-panel");
    assert.equal(attr(form, "aria-controls"), "your-f1-panel");
    assert.equal(attr(form, "aria-selected"), "true");
    assert.equal(attr(overview, "tabindex"), "-1");
  });

  it("points at nothing, rather than at a missing id, without a panel", () => {
    const html = renderToStaticMarkup(createElement(Tabs, { items: ITEMS, activeKey: "overview", onChange: noop, layoutId: "t" }));
    for (const tab of tabs(html)) {
      assert.equal(attr(tab, "aria-controls"), undefined);
      assert.equal(attr(tab, "id"), undefined);
    }
  });
});
