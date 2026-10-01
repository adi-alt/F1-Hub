import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Dialog, DialogLayer, Sheet } from "../Dialog";
import { assertClasses, attr, classesOf, classesWithoutCss, openingTag } from "./markup";

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

  it("is a surface-3 overlay panel capped at the viewport height less 32px, titled in title-md", () => {
    const html = render();
    assertClasses(panel(html), ["bg-surface-3", "rounded-overlay", "shadow-overlay", "max-h-[calc(100dvh-32px)]", "overflow-hidden", "flex", "flex-col"]);
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
    assertClasses(scrim(html), ["absolute", "inset-0", "bg-surface-0/70"]);
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
      "bg-surface-3",
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
  ].join("");
  assert.deepEqual(await classesWithoutCss(html), []);
});
