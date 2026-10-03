import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Dialog, DialogLayer, Sheet } from "../Dialog";
import { assertClasses, attr, classesOf, classesWithoutCss, openingTag } from "./rawMarkup";

const noop = () => {};
const BODY = "Your pick for this race is removed for good.";

function render(props: Partial<ComponentProps<typeof DialogLayer>> = {}, children: ReactNode = BODY) {
  return renderToStaticMarkup(createElement(DialogLayer, { title: "Delete prediction?", onClose: noop, ...props }, children));
}

const root = (html: string) => openingTag(html, /^<div[^>]*>/);
const scrim = (html: string) => openingTag(html, /<div aria-hidden="true"[^>]*>/);
const panel = (html: string) => openingTag(html, /<div[^>]*role="dialog"[^>]*>/);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("Dialog panel", () => {
  it("is a modal dialog named by its title and described by its description", () => {
    const html = render({ description: "This can be undone until the session starts." });
    const dialog = panel(html);
    assert.equal(attr(dialog, "aria-modal"), "true");
    const labelledBy = attr(dialog, "aria-labelledby");
    const describedBy = attr(dialog, "aria-describedby");
    assert.ok(labelledBy && describedBy && labelledBy !== describedBy);
    assert.match(html, new RegExp(`<h2 id="${escapeRe(labelledBy)}"[^>]*>Delete prediction\\?</h2>`));
    assert.match(html, new RegExp(`<p id="${escapeRe(describedBy)}"[^>]*>This can be undone until the session starts\\.</p>`));
  });

  it("has no aria-describedby without a description", () => {
    assert.equal(attr(panel(render()), "aria-describedby"), undefined);
  });

  it("gives each dialog on the page its own ids", () => {
    const html = renderToStaticMarkup(
      createElement("div", null, createElement(DialogLayer, { title: "One", onClose: noop }), createElement(DialogLayer, { title: "Two", onClose: noop })),
    );
    const ids = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, 2);
  });

  it("is a frosted overlay panel capped at the viewport height less 32px, titled in title-md", () => {
    const html = render();
    assertClasses(panel(html), ["surface-glass", "rounded-overlay", "shadow-overlay", "max-h-[calc(100dvh-32px)]", "overflow-hidden", "flex", "flex-col"]);
    assertClasses(openingTag(html, /<h2[^>]*>/), ["text-title-md", "text-primary"]);
    // The 32px is the root's 16px padding on each side.
    assertClasses(root(html), ["p-4", "items-center", "justify-center"]);
  });

  it("scrolls the body inside the panel while the header and footer stay put", () => {
    const html = render({ footer: createElement("button", { type: "button" }, "Delete") });
    assertClasses(openingTag(html, /<div[^>]*overflow-y-auto[^>]*>/), ["min-h-0", "flex-1"]);
    assert.equal((html.match(/<div class="[^"]*\bshrink-0\b[^"]*"/g) ?? []).length, 2, "header and footer");
    assert.ok(html.includes(`>${BODY}</div>`));
    assert.match(html, /<div class="[^"]*justify-end[^"]*"><button type="button">Delete<\/button><\/div>/);
  });

  it("leaves out the body and the footer when there is nothing to put in them", () => {
    const html = render({ footer: undefined }, null);
    assert.doesNotMatch(html, /overflow-y-auto/);
    assert.equal((html.match(/<div class="[^"]*\bshrink-0\b[^"]*"/g) ?? []).length, 1, "header only");
    assert.doesNotMatch(render({}, false), /overflow-y-auto/);
  });

  it("maps size to a max width, md by default", () => {
    const widths = (size?: "sm" | "md" | "lg") => classesOf(panel(render({ size }))).filter((cls) => cls.includes("max-w-"));
    assert.deepEqual(widths("sm"), ["max-w-sm"]);
    assert.deepEqual(widths(), ["max-w-lg"]);
    assert.deepEqual(widths("md"), ["max-w-lg"]);
    assert.deepEqual(widths("lg"), ["max-w-2xl"]);
  });

  it("has a 32px close button named Close, with the focus ring and a 20px decorative icon", () => {
    const html = render();
    const button = openingTag(html, /<button[^>]*aria-label="Close"[^>]*>/);
    assert.equal(attr(button, "type"), "button");
    assertClasses(button, ["size-8", "focus-visible:outline-2", "focus-visible:outline-offset-2", "focus-visible:outline-focus-ring"]);
    const icon = openingTag(html, /<svg[^>]*lucide-x[^>]*>/);
    assert.equal(attr(icon, "aria-hidden"), "true");
    assert.equal(attr(icon, "width"), "20");
    assert.equal(attr(icon, "stroke-width"), "1.75");
  });

  it("offers no close button when it is not dismissible", () => {
    assert.doesNotMatch(render({ dismissible: false }), /aria-label="Close"/);
  });

  it("sits on z-dialog over an aria-hidden scrim", () => {
    const html = render();
    assertClasses(root(html), ["fixed", "inset-0", "z-dialog"]);
    // Light enough for the page to show through the frosted panel.
    assertClasses(scrim(html), ["absolute", "inset-0", "bg-surface-0/35"]);
    // Scrim first, so the panel paints above it.
    assert.ok(html.indexOf('aria-hidden="true"') < html.indexOf('role="dialog"'));
  });

  it("animates only opacity and transform at duration-slow, and holds still under reduced motion", () => {
    const html = render();
    assertClasses(panel(html), ["transition-[opacity,translate]", "duration-slow", "ease-standard", "motion-reduce:transition-none", "starting:opacity-0", "starting:translate-y-2"]);
    assertClasses(scrim(html), ["transition-opacity", "duration-slow", "ease-standard", "motion-reduce:transition-none", "starting:opacity-0"]);
  });

  it("closes as an inert layer that ignores the pointer while it transitions out", () => {
    const html = render({ open: false });
    assert.match(root(html), /\sinert=""/);
    assertClasses(root(html), ["pointer-events-none"]);
    assertClasses(scrim(html), ["opacity-0"]);
    assertClasses(panel(html), ["opacity-0", "translate-y-2"]);

    const open = render();
    assert.doesNotMatch(root(open), /\sinert/);
    assert.ok(!classesOf(root(open)).includes("pointer-events-none"));
    assert.ok(!classesOf(panel(open)).includes("opacity-0"));
  });
});

describe("Dialog aside", () => {
  const ART = createElement("div", { className: "h-full" }, "Every race.");
  const withAside = (props: Partial<ComponentProps<typeof DialogLayer>> = {}) => render({ aside: ART, ...props });
  const asideTag = (html: string) => openingTag(html, /<div aria-hidden="true" class="[^"]*md:block[^"]*">/);

  it("sits beside the content from md up, hidden on phones and from assistive tech", () => {
    const html = withAside();
    assertClasses(asideTag(html), ["hidden", "md:block", "md:w-1/2", "md:shrink-0"]);
    assert.ok(html.indexOf("Every race.") < html.indexOf("<h2"), "the artwork comes before the content column");
    // The panel is a row from md up, and the content column takes over the padding and the gap.
    assertClasses(panel(html), ["flex", "flex-col", "md:flex-row", "md:gap-0", "md:py-0", "overflow-hidden", "max-h-[calc(100dvh-32px)]"]);
    assertClasses(openingTag(html, /<div class="[^"]*md:py-6[^"]*">/), ["flex", "min-h-0", "min-w-0", "flex-1", "flex-col", "gap-4"]);
  });

  it("keeps the dialog named by its title, with the close button and a scrolling body in the content column", () => {
    const html = withAside({ description: "One account either way." });
    const dialog = panel(html);
    assert.match(html, new RegExp(`<h2 id="${escapeRe(attr(dialog, "aria-labelledby") ?? "-")}"`));
    assert.match(html, new RegExp(`<p id="${escapeRe(attr(dialog, "aria-describedby") ?? "-")}"`));
    assert.match(html, /aria-label="Close"/);
    assertClasses(openingTag(html, /<div[^>]*overflow-y-auto[^>]*>/), ["min-h-0", "flex-1"]);
  });

  it("doubles the md-up width and keeps the size's width on phones", () => {
    const widths = (size?: "sm" | "md" | "lg") => classesOf(panel(withAside({ size }))).filter((cls) => cls.includes("max-w-"));
    assert.deepEqual(widths("sm"), ["max-w-sm", "md:max-w-3xl"]);
    assert.deepEqual(widths(), ["max-w-lg", "md:max-w-4xl"]);
    assert.deepEqual(widths("lg"), ["max-w-2xl", "md:max-w-5xl"]);
  });

  it("changes nothing without an aside, and a sheet ignores one", () => {
    assert.equal(render(), render({ aside: null }));
    const sheet = render({ variant: "sheet", aside: ART });
    assert.doesNotMatch(sheet, /Every race\./);
    assert.ok(!classesOf(panel(sheet)).includes("md:flex-row"));
  });
});

describe("Dialog minHeight (a steady-height, multi-step dialog)", () => {
  const ART = createElement("div", null, "Every race.");
  const closeTag = (html: string) => openingTag(html, /<button[^>]*aria-label="Close"[^>]*>/);
  const bodyTag = (html: string) => openingTag(html, /<div class="[^"]*overflow-y-auto[^"]*">/);

  it("holds the panel at least that tall, capped by the viewport like its max height", () => {
    assert.equal(attr(panel(render({ minHeight: "40.5rem" })), "style"), "min-height:min(40.5rem, calc(100dvh - 32px))");
  });

  it("centres the title and body together, safely, and pins the close button to the corner", () => {
    const html = render({ minHeight: "40.5rem", description: "Two lines of description." });
    assertClasses(panel(html), ["justify-center-safe"]);
    assertClasses(closeTag(html), ["absolute", "right-4", "top-4", "size-8"]);
    assert.ok(html.indexOf('aria-label="Close"') < html.indexOf("<h2"), "the close button comes first, as it did in the header");
    assertClasses(bodyTag(html), ["flex-initial", "min-h-0", "overflow-y-auto"]);
    assert.ok(!classesOf(bodyTag(html)).includes("flex-1"), "a stretching body would stop the centring");
    assertClasses(openingTag(html, /<div class="[^"]*items-start[^"]*">/), ["pe-14"]);
  });

  it("with an aside, centres within the content column", () => {
    const html = render({ minHeight: "40.5rem", aside: ART });
    assertClasses(openingTag(html, /<div class="[^"]*md:py-6[^"]*">/), ["justify-center-safe", "flex-1", "flex-col"]);
    assert.ok(!classesOf(panel(html)).includes("justify-center-safe"));
  });

  it("changes nothing without it, and a sheet ignores it", () => {
    const plain = render();
    assert.equal(attr(panel(plain), "style"), undefined);
    assertClasses(closeTag(plain), ["-mr-2", "-mt-1"]);
    assertClasses(bodyTag(plain), ["flex-1"]);
    const sheet = render({ variant: "sheet", minHeight: "40.5rem" });
    assert.equal(attr(panel(sheet), "style"), undefined);
    assert.ok(!classesOf(panel(sheet)).includes("justify-center-safe"));
  });
});

describe("Sheet panel", () => {
  const sheet = (props: Partial<ComponentProps<typeof DialogLayer>> = {}) => render({ variant: "sheet", ...props });

  it("keeps the dialog semantics", () => {
    const html = sheet({ description: "Narrow the standings." });
    const dialog = panel(html);
    assert.equal(attr(dialog, "aria-modal"), "true");
    assert.match(html, new RegExp(`<h2 id="${escapeRe(attr(dialog, "aria-labelledby") ?? "-")}"`));
    assert.match(html, new RegExp(`<p id="${escapeRe(attr(dialog, "aria-describedby") ?? "-")}"`));
    assert.match(html, /aria-label="Close"/);
    assertClasses(root(html), ["fixed", "inset-0", "z-dialog"]);
  });

  it("is a full-width bottom sheet on phones and a full-height right-hand panel from md up", () => {
    const html = sheet();
    assertClasses(root(html), ["items-end", "md:items-stretch", "md:justify-end"]);
    assertClasses(panel(html), [
      "w-full",
      "surface-glass",
      "shadow-overlay",
      "rounded-t-overlay",
      "max-h-[calc(100dvh-32px)]",
      "md:max-h-none",
      "md:rounded-tr-none",
      "md:rounded-l-overlay",
    ]);
    assert.ok(!classesOf(panel(html)).includes("rounded-overlay"), "only the top corners are rounded on phones");
  });

  it("maps size to its desktop width, md by default", () => {
    const widths = (size?: "sm" | "md" | "lg") => classesOf(panel(sheet({ size }))).filter((cls) => cls.includes("max-w-"));
    assert.deepEqual(widths("sm"), ["md:max-w-xs"]);
    assert.deepEqual(widths(), ["md:max-w-sm"]);
    assert.deepEqual(widths("lg"), ["md:max-w-lg"]);
  });

  it("slides up from the bottom on phones and in from the right on desktop, and back out", () => {
    assertClasses(panel(sheet()), ["starting:translate-y-full", "md:starting:translate-x-full", "md:starting:translate-y-0", "duration-slow", "motion-reduce:transition-none"]);
    assertClasses(panel(sheet({ open: false })), ["translate-y-full", "md:translate-x-full", "md:translate-y-0"]);
  });
});

describe("Dialog and Sheet", () => {
  it("render nothing on the server, even when open: the portal waits for document.body", () => {
    for (const component of [Dialog, Sheet]) {
      assert.equal(renderToStaticMarkup(createElement(component, { open: true, onClose: noop, title: "Filters" }, "Body")), "");
      assert.equal(renderToStaticMarkup(createElement(component, { open: false, onClose: noop, title: "Filters" })), "");
    }
  });
});

it("uses only classes Tailwind generates", async () => {
  const footer = createElement("button", { type: "button" }, "Save");
  const html = [
    render({ description: "Description", footer }),
    render({ open: false, size: "sm" }),
    render({ size: "lg", dismissible: false }),
    render({ variant: "sheet", description: "Description", footer }),
    render({ variant: "sheet", open: false, size: "sm" }),
    render({ variant: "sheet", size: "lg" }),
    render({ aside: createElement("div", null, "Art"), size: "sm" }),
    render({ aside: createElement("div", null, "Art"), size: "md" }),
    render({ aside: createElement("div", null, "Art"), size: "lg" }),
    render({ minHeight: "40.5rem", description: "Description" }),
    render({ minHeight: "40.5rem", aside: createElement("div", null, "Art"), size: "sm" }),
  ].join("");
  assert.deepEqual(await classesWithoutCss(html), []);
});
