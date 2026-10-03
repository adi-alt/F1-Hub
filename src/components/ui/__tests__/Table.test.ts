import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compareRows, isFromNestedControl, isRowActivationKey, nextSort, sortRows, Table, type TableColumn, type TableProps } from "../Table";
import { classesOf, classesWithoutCss, tags, type Tag } from "./markup";

type Driver = { code: string; name: string; team: string; wins: number; points: number | null };

const DRIVERS: readonly Driver[] = [
  { code: "NOR", name: "Lando Norris", team: "McLaren", wins: 4, points: 279 },
  { code: "VER", name: "Max Verstappen", team: "Red Bull", wins: 9, points: 331 },
  { code: "PIA", name: "Oscar Piastri", team: "McLaren", wins: 2, points: null },
];

const COLUMNS: readonly TableColumn<Driver>[] = [
  { key: "name", header: "Driver", sortable: true },
  { key: "team", header: "Team" },
  { key: "wins", header: "Wins", numeric: true, sortable: true },
  { key: "points", header: "Pts", numeric: true, sortable: true },
];

function render(props: Partial<TableProps<Driver>> = {}) {
  return renderToStaticMarkup(createElement(Table<Driver>, { columns: COLUMNS, rows: DRIVERS, getRowKey: (row) => row.code, ...props }));
}

const byName = (html: string, name: string) => tags(html).filter((tag) => tag.name === name);
const has = (tag: Tag | undefined, ...classes: string[]) => classes.every((cls) => classesOf(tag).includes(cls));
/** Row headers (driver names) in the order the body renders them. */
const order = (html: string) => [...html.matchAll(/<th scope="row"[^>]*>([^<]*)</g)].map((match) => match[1]);
const sortedBy = (key: keyof Driver, direction: "ascending" | "descending") => sortRows(DRIVERS, COLUMNS, { key, direction }).map((row) => row.code);

test("nextSort: a new column starts at its first direction, the same column flips", () => {
  assert.deepEqual(nextSort(null, "name"), { key: "name", direction: "ascending" });
  assert.deepEqual(nextSort(null, "points", "descending"), { key: "points", direction: "descending" });
  assert.deepEqual(nextSort({ key: "points", direction: "descending" }, "points", "descending"), { key: "points", direction: "ascending" });
  assert.deepEqual(nextSort({ key: "points", direction: "ascending" }, "points"), { key: "points", direction: "descending" });
  assert.deepEqual(nextSort({ key: "points", direction: "ascending" }, "wins", "descending"), { key: "wins", direction: "descending" });
});

test("sortRows orders numbers and text, keeping empty values last in both directions", () => {
  assert.deepEqual(sortedBy("points", "descending"), ["VER", "NOR", "PIA"]);
  assert.deepEqual(sortedBy("points", "ascending"), ["NOR", "VER", "PIA"]);
  assert.deepEqual(sortedBy("name", "ascending"), ["NOR", "VER", "PIA"]);
  assert.deepEqual(sortedBy("name", "descending"), ["PIA", "VER", "NOR"]);
});

test("sortRows leaves rows alone without a sort, or for a column that isn't sortable", () => {
  assert.equal(sortRows(DRIVERS, COLUMNS, null), DRIVERS);
  assert.equal(sortRows(DRIVERS, COLUMNS, { key: "team", direction: "ascending" }), DRIVERS);
  assert.equal(sortRows(DRIVERS, COLUMNS, { key: "nope", direction: "ascending" }), DRIVERS);
});

test("sortRows is stable, so ties keep the order they came in", () => {
  const byTeam: TableColumn<Driver> = { key: "team", header: "Team", sortable: true };
  assert.deepEqual(
    sortRows(DRIVERS, [byTeam], { key: "team", direction: "ascending" }).map((row) => row.code),
    ["NOR", "PIA", "VER"],
  );
});

test("compareRows: numeric collation for text, real dates, and sortValue for derived orders", () => {
  type Car = { label: string; at: Date; status: "finished" | "dnf" | "dsq" };
  const label: TableColumn<Car> = { key: "label", header: "Car" };
  const car = (text: string, day: number, status: Car["status"] = "finished"): Car => ({ label: text, at: new Date(2026, 0, day), status });
  assert.ok(compareRows(car("Car 2", 1), car("Car 10", 1), label, "ascending") < 0, "Car 2 before Car 10");
  assert.ok(compareRows(car("pérez", 1), car("Piastri", 1), label, "ascending") < 0, "accents and case don't break alphabetical order");
  const at: TableColumn<Car> = { key: "at", header: "Date" };
  assert.ok(compareRows(car("a", 1), car("b", 2), at, "ascending") < 0);
  assert.ok(compareRows(car("a", 1), car("b", 2), at, "descending") > 0);
  const severity = { finished: 0, dnf: 1, dsq: 2 };
  const status: TableColumn<Car> = { key: "status", header: "Status", sortValue: (row) => severity[row.status] };
  assert.ok(compareRows(car("a", 1, "dsq"), car("b", 1, "dnf"), status, "ascending") > 0, "ranked by severity, not by spelling");
});

test("isRowActivationKey: Enter and Space only", () => {
  assert.equal(isRowActivationKey("Enter"), true);
  assert.equal(isRowActivationKey(" "), true);
  for (const key of ["Tab", "Escape", "ArrowDown", "a", "Spacebar"]) assert.equal(isRowActivationKey(key), false, key);
});

test("isFromNestedControl: a click on a control inside the row is the control's, not the row's", () => {
  const button = { id: "button" };
  const row = { closest: () => row, contains: (node: unknown) => node === button || node === row };
  const asRow = row as unknown as Element;
  const target = (hit: unknown) => ({ closest: () => hit }) as unknown as EventTarget;
  assert.equal(isFromNestedControl(target(button), asRow), true, "click on a nested button");
  assert.equal(isFromNestedControl(target(row), asRow), false, "click on plain cell text resolves to the row itself");
  assert.equal(isFromNestedControl(target(null), asRow), false, "nothing interactive under the pointer");
  assert.equal(isFromNestedControl(null, asRow), false);
});

test("column headers: th scope=col in the caption uppercase tier, secondary text", () => {
  const headers = byName(render(), "th").filter((th) => th.attrs.scope === "col");
  assert.equal(headers.length, 4);
  for (const th of headers) assert.ok(has(th, "text-caption", "uppercase", "tracking-[0.04em]", "text-secondary", "border-b", "border-subtle"), classesOf(th).join(" "));
});

test("sortable headers are buttons; aria-sort and the icon are on the sorted column only", () => {
  const html = render({ sort: { key: "points", direction: "descending" } });
  const headers = byName(html, "th").filter((th) => th.attrs.scope === "col");
  assert.deepEqual(
    headers.map((th) => th.attrs["aria-sort"]),
    [undefined, undefined, undefined, "descending"],
  );
  const cells = [...html.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((match) => match[1]);
  assert.deepEqual(
    cells.map((cell) => cell.startsWith("<button")),
    [true, false, true, true],
  );
  assert.deepEqual(
    cells.map((cell) => cell.includes("<svg")),
    [false, false, false, true],
  );
  assert.match(cells[3], /lucide-arrow-down/);
  assert.match(render({ sort: { key: "name", direction: "ascending" } }), /aria-sort="ascending"[\s\S]*?lucide-arrow-up/);
});

test("rows render in sort order, controlled through sort or kept internally from defaultSort", () => {
  assert.deepEqual(order(render()), ["Lando Norris", "Max Verstappen", "Oscar Piastri"]);
  assert.deepEqual(order(render({ sort: { key: "points", direction: "descending" } })), ["Max Verstappen", "Lando Norris", "Oscar Piastri"]);
  assert.deepEqual(order(render({ defaultSort: { key: "wins", direction: "descending" } })), ["Max Verstappen", "Lando Norris", "Oscar Piastri"]);
  assert.deepEqual(order(render({ sort: null, defaultSort: { key: "wins", direction: "descending" } })), ["Lando Norris", "Max Verstappen", "Oscar Piastri"]);
});

test("numeric cells are end-aligned and tabular; text cells start-aligned", () => {
  const firstRow = render().match(/<tbody><tr[^>]*>([\s\S]*?)<\/tr>/)?.[1] ?? "";
  const cells = tags(firstRow).filter((tag) => tag.name === "td" || tag.name === "th");
  assert.equal(cells.length, 4);
  assert.ok(has(cells[0], "text-start") && !has(cells[0], "tabular"));
  assert.ok(has(cells[1], "text-start") && !has(cells[1], "tabular"));
  assert.ok(has(cells[2], "text-end", "tabular"));
  assert.ok(has(cells[3], "text-end", "tabular"));
  assert.match(firstRow, />279</);
});

test("rows are 44px by default and 36px compact, with hairlines and no zebra striping", () => {
  for (const [density, height] of [
    ["default", "h-11"],
    ["compact", "h-9"],
  ] as const) {
    const html = render({ density });
    const body = html.slice(html.indexOf("<tbody>"));
    const cells = tags(body).filter((tag) => tag.name === "td" || tag.name === "th");
    assert.equal(cells.length, 12);
    for (const cell of cells) assert.ok(has(cell, height, "border-b", "border-subtle", "text-start") || has(cell, height, "border-b", "border-subtle", "text-end"));
    assert.doesNotMatch(html, /\b(even|odd):/);
  }
});

test("the first column's cells head their rows (th scope=row), or the column named by rowHeader", () => {
  const rowHeaders = byName(render(), "th").filter((th) => th.attrs.scope === "row");
  assert.equal(rowHeaders.length, 3);
  assert.deepEqual(order(render({ rowHeader: "team" })), ["McLaren", "Red Bull", "McLaren"]);
});

test("onRowActivate makes each row focusable with the focus ring; without it rows aren't focusable", () => {
  const rows = byName(render({ onRowActivate: () => {} }), "tr").slice(1);
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.attrs.tabindex, "0");
    assert.equal(row.attrs.role, undefined, "a native tr keeps its own row role");
    assert.ok(has(row, "cursor-pointer", "hover:bg-surface-2", "focus-visible:outline-2", "focus-visible:outline-focus-ring"));
  }
  for (const row of byName(render(), "tr")) assert.equal(row.attrs.tabindex, undefined);
});

test("expandable rows: a disclosure button whose aria-controls names a real, hidden details row", () => {
  const html = render({ expandable: true, renderExpanded: (row) => `Details of ${row.code}` });
  const ids = new Set(tags(html).map((tag) => tag.attrs.id));
  const toggles = byName(html, "button").filter((button) => "aria-expanded" in button.attrs);
  assert.equal(toggles.length, 3);
  for (const toggle of toggles) {
    assert.equal(toggle.attrs["aria-expanded"], "false");
    const details = tags(html).find((tag) => tag.attrs.id === toggle.attrs["aria-controls"]);
    assert.equal(details?.name, "tr");
    assert.ok(details && "hidden" in details.attrs);
    // Named by its own "Details" text plus the row header: "Details Lando Norris".
    for (const id of toggle.attrs["aria-labelledby"].split(" ")) assert.ok(ids.has(id), `aria-labelledby names missing id ${id}`);
    assert.ok(toggle.attrs["aria-labelledby"].startsWith(`${toggle.attrs.id} `));
  }
  assert.doesNotMatch(html, /Details of/, "collapsed rows render no details");
});

test("expanded rows show their details and say so; per-row expandable leaves other rows without a button", () => {
  const html = render({
    expandable: (row) => row.code !== "PIA",
    renderExpanded: (row) => `Details of ${row.code}`,
    expandedKeys: ["VER"],
  });
  const toggles = byName(html, "button").filter((button) => "aria-expanded" in button.attrs);
  assert.deepEqual(
    toggles.map((toggle) => toggle.attrs["aria-expanded"]),
    ["false", "true"],
  );
  const open = tags(html).find((tag) => tag.attrs.id === toggles[1].attrs["aria-controls"]);
  assert.ok(open && !("hidden" in open.attrs));
  assert.match(html, /Details of VER/);
  assert.doesNotMatch(html, /Details of NOR|Details of PIA/);
  for (const toggle of toggles) assert.ok(has(toggle, "size-7", "focus-visible:outline-offset-2", "focus-visible:outline-focus-ring"), "24px+ target with the focus ring");
});

test("expandable without renderExpanded adds nothing", () => {
  assert.doesNotMatch(render({ expandable: true }), /aria-expanded/);
});

test("stickyFirstColumn freezes only the first column, below md, on surface-1", () => {
  const html = render({ stickyFirstColumn: true });
  const firstCells = [...html.matchAll(/<tr[^>]*>(<t[hd][^>]*>)/g)].map((match) => tags(match[1])[0]);
  assert.equal(firstCells.length, 4);
  for (const cell of firstCells) assert.ok(has(cell, "max-md:sticky", "max-md:left-0", "max-md:bg-surface-1"), classesOf(cell).join(" "));
  const stickyCells = tags(html).filter((tag) => classesOf(tag).includes("max-md:sticky"));
  assert.equal(stickyCells.length, 4);
  assert.doesNotMatch(render(), /sticky/);
});

test("the table scrolls sideways in its own surface-1 container, with the scrollbar left visible", () => {
  const [container] = tags(render());
  assert.equal(container.name, "div");
  assert.ok(has(container, "overflow-x-auto", "bg-surface-1"));
  assert.doesNotMatch(render(), /scrollbar-hide/);
  assert.equal(container.attrs.tabindex, undefined);
});

test("a caption names the table and makes its scroll area a focusable region", () => {
  const html = render({ caption: "Drivers' championship" });
  const [container] = tags(html);
  assert.equal(container.attrs.role, "region");
  assert.equal(container.attrs["aria-label"], "Drivers&#x27; championship");
  assert.equal(container.attrs.tabindex, "0");
  assert.ok(has(container, "focus-visible:outline-2", "focus-visible:outline-offset-2", "focus-visible:outline-focus-ring"));
  assert.match(html, /<caption class="sr-only">Drivers&#x27; championship<\/caption>/);
});

test("empty renders one full-width row", () => {
  const html = render({ rows: [], empty: "No results yet", expandable: true, renderExpanded: () => "x" });
  assert.match(html, /<td colSpan="5"[^>]*>No results yet<\/td>/);
});

test("every class Table renders is a real Tailwind utility", async () => {
  const html = [
    render({ stickyFirstColumn: true, onRowActivate: () => {}, sort: { key: "points", direction: "ascending" }, caption: "Standings" }),
    render({ density: "compact", expandable: true, renderExpanded: (row) => row.name, expandedKeys: ["NOR"] }),
    render({ rows: [], empty: "Nothing" }),
  ].join("");
  assert.deepEqual(await classesWithoutCss(html), []);
});
