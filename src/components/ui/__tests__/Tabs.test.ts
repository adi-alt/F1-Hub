import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { nextTabIndex, TabList, TabPanel, TabPanels, Tabs, tabId, tabPanelId, type TabItem, type TabsVariant } from "../Tabs";
import { byRole, classesOf, classesWithoutCss, tags, withChildren } from "./markup";

const ITEMS: readonly TabItem[] = [
  { value: "drivers", label: "Drivers", count: 20 },
  { value: "constructors", label: "Constructors", count: 10 },
  { value: "free practice 1", label: "FP1" },
];

function tabSet(value: string, variant: TabsVariant = "underline", items: readonly TabItem[] = ITEMS) {
  return withChildren(
    Tabs<string>,
    { variant, value, onValueChange: () => {}, items },
    createElement(TabList, { "aria-label": "Standings" }),
    ...items.map((item) => withChildren(TabPanel, { key: item.value, value: item.value }, `${item.label} content`)),
  );
}

const render = (value: string, variant?: TabsVariant) => renderToStaticMarkup(tabSet(value, variant));

test("nextTabIndex: Left/Right wrap around, Home/End jump to the ends", () => {
  assert.equal(nextTabIndex("ArrowRight", 0, 3), 1);
  assert.equal(nextTabIndex("ArrowRight", 2, 3), 0);
  assert.equal(nextTabIndex("ArrowLeft", 1, 3), 0);
  assert.equal(nextTabIndex("ArrowLeft", 0, 3), 2);
  assert.equal(nextTabIndex("Home", 2, 3), 0);
  assert.equal(nextTabIndex("End", 0, 3), 2);
  assert.equal(nextTabIndex("ArrowRight", 0, 1), 0);
});

test("nextTabIndex leaves every other key alone, and an empty list too", () => {
  for (const key of ["ArrowUp", "ArrowDown", "Enter", " ", "Tab", "a"]) assert.equal(nextTabIndex(key, 1, 3), null, key);
  assert.equal(nextTabIndex("ArrowRight", 0, 0), null);
});

test("every tab's aria-controls names a rendered tabpanel, and that panel is labelled by the tab", () => {
  const html = render("constructors");
  const tabs = byRole(html, "tab");
  const panels = byRole(html, "tabpanel");
  assert.equal(tabs.length, 3);
  assert.equal(panels.length, 3);
  for (const tab of tabs) {
    const panel = panels.find((p) => p.attrs.id === tab.attrs["aria-controls"]);
    assert.ok(panel, `aria-controls="${tab.attrs["aria-controls"]}" names no panel`);
    assert.equal(panel.attrs["aria-labelledby"], tab.attrs.id);
    assert.equal(panel.attrs.tabindex, "0");
  }
  for (const panel of panels) assert.ok(tabs.some((tab) => tab.attrs.id === panel.attrs["aria-labelledby"]));
});

test("roving tabindex: only the selected tab is selected and in the Tab order", () => {
  const tabs = byRole(render("constructors"), "tab");
  assert.deepEqual(
    tabs.map((tab) => tab.attrs["aria-selected"]),
    ["false", "true", "false"],
  );
  assert.deepEqual(
    tabs.map((tab) => tab.attrs.tabindex),
    ["-1", "0", "-1"],
  );
  for (const tab of tabs) assert.equal(tab.name, "button");
  for (const tab of tabs) assert.equal(tab.attrs.type, "button");
});

test("only the selected panel is shown, and only it renders its content", () => {
  const html = render("constructors");
  assert.deepEqual(
    byRole(html, "tabpanel").map((panel) => "hidden" in panel.attrs),
    [true, false, true],
  );
  assert.match(html, /Constructors content/);
  assert.doesNotMatch(html, /Drivers content|FP1 content/);
});

test("the tablist carries its accessible name", () => {
  const [list] = byRole(render("drivers"), "tablist");
  assert.equal(list.attrs["aria-label"], "Standings");
});

test("a value that matches no tab keeps the first tab in the Tab order", () => {
  const tabs = byRole(render("qualifying"), "tab");
  assert.deepEqual(
    tabs.map((tab) => tab.attrs.tabindex),
    ["0", "-1", "-1"],
  );
  assert.ok(tabs.every((tab) => tab.attrs["aria-selected"] === "false"));
});

test("ids stay whitespace-free and distinct for values with spaces or punctuation", () => {
  const fp1 = byRole(render("drivers"), "tab")[2];
  assert.doesNotMatch(fp1.attrs.id, /\s/);
  assert.doesNotMatch(fp1.attrs["aria-controls"], /\s/);
  assert.equal(tabId("t", "free practice 1"), "t-tab-free%20practice%201");
  assert.equal(tabPanelId("t", "free practice 1"), "t-panel-free%20practice%201");
  assert.notEqual(tabId("t", "a b"), tabId("t", "a-b"));
  assert.notEqual(tabId("t", "a b"), tabId("t", "a%20b"));
});

test("two tab sets on one page never share an id", () => {
  const html = renderToStaticMarkup(createElement("div", null, tabSet("drivers"), tabSet("drivers")));
  const ids = tags(html)
    .map((tag) => tag.attrs.id)
    .filter(Boolean);
  assert.equal(ids.length, 12);
  assert.equal(new Set(ids).size, ids.length);
});

test("underline: body-sm labels, secondary when idle, primary when selected, with a 2px brand underline", () => {
  const html = render("drivers", "underline");
  const tabs = byRole(html, "tab");
  for (const tab of tabs) assert.ok(classesOf(tab).includes("text-body-sm"));
  assert.ok(classesOf(tabs[0]).includes("text-primary"));
  assert.ok(classesOf(tabs[1]).includes("text-secondary") && !classesOf(tabs[1]).includes("text-primary"));
  const bars = tags(html).filter((tag) => classesOf(tag).includes("bg-brand"));
  assert.equal(bars.length, 3);
  assert.deepEqual(
    bars.map((bar) => classesOf(bar).includes("scale-x-100")),
    [true, false, false],
  );
  for (const bar of bars) {
    assert.equal(bar.attrs["aria-hidden"], "true");
    for (const cls of ["h-0.5", "duration-base", "ease-standard", "motion-reduce:transition-none"]) assert.ok(classesOf(bar).includes(cls), cls);
  }
});

test("segmented: a rounded-control group on surface-1, the selected segment on surface-2 in primary text", () => {
  const html = render("constructors", "segmented");
  const [list] = byRole(html, "tablist");
  for (const cls of ["rounded-control", "bg-surface-1"]) assert.ok(classesOf(list).includes(cls), cls);
  const tabs = byRole(html, "tab");
  assert.deepEqual(
    tabs.map((tab) => classesOf(tab).includes("bg-surface-2")),
    [false, true, false],
  );
  // The selected segment also gets a border-strong edge, so tone isn't its only cue.
  for (const cls of ["text-primary", "ring-strong"]) assert.ok(classesOf(tabs[1]).includes(cls), cls);
  assert.ok(classesOf(tabs[0]).includes("text-secondary"));
  assert.doesNotMatch(html, /bg-brand/);
});

test("a count renders after the label as a small tabular tertiary number", () => {
  const html = render("drivers");
  const counts = tags(html).filter((tag) => classesOf(tag).includes("tabular"));
  assert.equal(counts.length, 2);
  for (const count of counts) for (const cls of ["text-caption", "text-tertiary"]) assert.ok(classesOf(count).includes(cls), cls);
  assert.match(html, />Drivers<span class="[^"]*tabular[^"]*">20<\/span>/);
});

test("every tab and panel gets the focus ring", () => {
  for (const variant of ["underline", "segmented"] as const) {
    const html = render("drivers", variant);
    for (const tag of [...byRole(html, "tab"), ...byRole(html, "tabpanel")]) {
      for (const cls of ["focus-visible:outline-2", "focus-visible:outline-offset-2", "focus-visible:outline-focus-ring"]) assert.ok(classesOf(tag).includes(cls), `${variant} ${cls}`);
    }
  }
});

test("TabPanels gives every tab a real panel and shows its children in the selected one only", () => {
  const html = renderToStaticMarkup(
    withChildren(
      Tabs<string>,
      { variant: "segmented", value: "constructors", onValueChange: () => {}, items: ITEMS },
      createElement(TabList, { "aria-label": "Standings" }),
      withChildren(TabPanels, { className: "mt-4" }, "The one table"),
    ),
  );
  const tabs = byRole(html, "tab");
  const panels = byRole(html, "tabpanel");
  assert.equal(panels.length, 3);
  for (const tab of tabs) assert.ok(panels.some((panel) => panel.attrs.id === tab.attrs["aria-controls"]), tab.attrs["aria-controls"]);
  assert.deepEqual(
    panels.map((panel) => "hidden" in panel.attrs),
    [true, false, true],
  );
  assert.equal(html.match(/The one table/g)?.length, 1);
  for (const panel of panels) assert.ok(classesOf(panel).includes("mt-4"));
});

test("TabList, TabPanel and TabPanels refuse to render outside Tabs", () => {
  assert.throws(() => renderToStaticMarkup(createElement(TabList, { "aria-label": "Orphan" })), /inside <Tabs>/);
  assert.throws(() => renderToStaticMarkup(withChildren(TabPanel, { value: "x" }, "orphan")), /inside <Tabs>/);
  assert.throws(() => renderToStaticMarkup(withChildren(TabPanels, {}, "orphan")), /inside <Tabs>/);
});

test("every class Tabs renders is a real Tailwind utility", async () => {
  const html = render("drivers", "underline") + render("constructors", "segmented");
  assert.deepEqual(await classesWithoutCss(html), []);
});
