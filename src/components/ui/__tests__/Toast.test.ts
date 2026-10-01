import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MAX_TOASTS, TOAST_DURATION_MS, ToastProvider, ToastRegion, toastDuration, toastReducer, useToast, type Toast } from "../Toast";
import { assertClasses, attr, classesWithoutCss, openingTag } from "./markup";

const noop = () => {};
const toast = (id: string, extra: Partial<Toast> = {}): Toast => ({ id, tone: "info", message: `Toast ${id}`, ...extra });
const show = (toasts: Toast[], next: Toast) => toastReducer(toasts, { type: "show", toast: next });
const ids = (toasts: Toast[]) => toasts.map((t) => t.id);
const undo = createElement("button", { type: "button" }, "Undo");

describe("toastDuration", () => {
  it("auto-dismisses info, success and warning toasts after 5 s", () => {
    assert.equal(TOAST_DURATION_MS, 5000);
    for (const tone of ["info", "success", "warning"] as const) assert.equal(toastDuration({ tone }), 5000, tone);
  });

  it("keeps errors until they are dismissed", () => {
    assert.equal(toastDuration({ tone: "danger" }), null);
  });

  it("keeps a toast with an action until it is dismissed, so the action can't expire unreached", () => {
    assert.equal(toastDuration({ tone: "success", action: undo }), null);
    // `canUndo && <Button />` with canUndo false is no action at all.
    assert.equal(toastDuration({ tone: "success", action: false }), 5000);
  });
});

describe("toastReducer", () => {
  it("shows toasts in the order they arrive", () => {
    assert.deepEqual(ids(show(show([], toast("a")), toast("b"))), ["a", "b"]);
  });

  it("replaces a toast with the same id where it stands", () => {
    const before = [toast("a"), toast("save", { message: "Saving…" }), toast("b")];
    const after = show(before, toast("save", { tone: "success", message: "Saved" }));
    assert.deepEqual(ids(after), ["a", "save", "b"]);
    assert.equal(after[1].message, "Saved");
    assert.equal(after[1].tone, "success");
  });

  it("dismisses by id", () => {
    assert.deepEqual(ids(toastReducer([toast("a"), toast("b"), toast("c")], { type: "dismiss", id: "b" })), ["a", "c"]);
  });

  it("returns the same array when there is nothing to dismiss, so nothing re-renders", () => {
    const toasts = [toast("a")];
    assert.equal(toastReducer(toasts, { type: "dismiss", id: "gone" }), toasts);
  });

  it("never holds more than MAX_TOASTS, dropping the oldest toast that would time out anyway", () => {
    assert.equal(MAX_TOASTS, 3);
    let toasts = [toast("error", { tone: "danger" }), toast("a"), toast("b")];
    toasts = show(toasts, toast("c"));
    assert.deepEqual(ids(toasts), ["error", "b", "c"]);
  });

  it("drops a persistent toast only when every older one is persistent, and never the new one", () => {
    const errors = [toast("e1", { tone: "danger" }), toast("e2", { tone: "danger" }), toast("undo", { action: undo })];
    assert.deepEqual(ids(show(errors, toast("saved", { tone: "success" }))), ["e2", "undo", "saved"]);
  });

  it("never mutates the array it is given", () => {
    const toasts = Object.freeze([toast("a"), toast("b"), toast("c")]) as Toast[];
    show(toasts, toast("d"));
    show(toasts, toast("a", { message: "Changed" }));
    toastReducer(toasts, { type: "dismiss", id: "a" });
    assert.deepEqual(ids(toasts), ["a", "b", "c"]);
  });
});

describe("ToastProvider", () => {
  it("renders the page and an empty polite live region, so the first toast is announced", () => {
    const html = renderToStaticMarkup(createElement(ToastProvider, null, createElement("main", null, "Page")));
    assert.match(html, /^<main>Page<\/main><section/);
    const region = openingTag(html, /<section[^>]*>/);
    assert.equal(attr(region, "aria-live"), "polite");
    assert.equal(attr(region, "aria-label"), "Notifications");
    assert.doesNotMatch(html, /<li/);
  });

  it("puts the region bottom-centre on phones and bottom-right from md up, on z-toast, without blocking the page", () => {
    const region = openingTag(renderToStaticMarkup(createElement(ToastRegion, { toasts: [], onDismiss: noop })), /<section[^>]*>/);
    assertClasses(region, ["fixed", "inset-x-0", "bottom-0", "justify-center", "md:justify-end", "z-toast", "pointer-events-none"]);
  });
});

function Probe() {
  const api = useToast();
  return createElement("output", null, `${typeof api.show} ${typeof api.dismiss}`);
}

describe("useToast", () => {
  it("returns show and dismiss below a ToastProvider", () => {
    assert.match(renderToStaticMarkup(createElement(ToastProvider, null, createElement(Probe))), /<output>function function<\/output>/);
  });

  it("throws without one", () => {
    assert.throws(() => renderToStaticMarkup(createElement(Probe)), /ToastProvider/);
  });
});

describe("ToastRegion", () => {
  const toasts: Toast[] = [
    toast("info", { message: "Prediction saved" }),
    toast("success", { tone: "success", message: "Link copied", action: undo }),
    toast("warning", { tone: "warning", message: "Times are provisional", description: "The classification is not final yet." }),
    toast("danger", { tone: "danger", message: "Could not save your prediction" }),
  ];
  const html = renderToStaticMarkup(createElement(ToastRegion, { toasts, onDismiss: noop }));
  const items: string[] = html.match(/<li[^>]*>[\s\S]*?<\/li>/g) ?? [];

  it("renders each toast as a list item in the live region, oldest first", () => {
    assert.equal(items.length, 4);
    assert.ok(html.indexOf("Prediction saved") < html.indexOf("Could not save your prediction"));
    assert.ok(html.indexOf("<ol") > html.indexOf('aria-live="polite"'));
  });

  it("draws each toast as a surface-3 card in body-sm that takes the pointer", () => {
    for (const item of items) assertClasses(openingTag(item, /^<li[^>]*>/), ["bg-surface-3", "rounded-card", "text-body-sm", "pointer-events-auto"]);
  });

  it("gives every tone its own 20px icon in its colour, hidden from assistive tech", () => {
    const expected = [
      ["lucide-info", "text-info"],
      ["lucide-circle-check", "text-success"],
      ["lucide-triangle-alert", "text-warning"],
      ["lucide-circle-alert", "text-danger"],
    ];
    expected.forEach(([icon, colour], i) => {
      const svg = openingTag(items[i], /<svg[^>]*>/);
      assertClasses(svg, [icon, colour]);
      assert.equal(attr(svg, "aria-hidden"), "true");
      assert.equal(attr(svg, "width"), "20");
      assert.equal(attr(svg, "stroke-width"), "1.75");
    });
  });

  it("says in words that a toast is a warning or an error, since the icon is hidden", () => {
    assert.match(items[2], /<span class="sr-only">Warning: <\/span>Times are provisional/);
    assert.match(items[3], /<span class="sr-only">Error: <\/span>Could not save your prediction/);
    assert.doesNotMatch(items[0] + items[1], /sr-only/);
  });

  it("renders the description and the action slot", () => {
    assert.match(items[2], /<p class="[^"]*text-secondary[^"]*">The classification is not final yet\.<\/p>/);
    assert.match(items[1], /<button type="button">Undo<\/button>/);
  });

  it("gives every toast a 32px dismiss button with the focus ring and a 16px icon", () => {
    for (const item of items) {
      const button = openingTag(item, /<button[^>]*aria-label="Dismiss notification"[^>]*>/);
      assert.equal(attr(button, "type"), "button");
      assertClasses(button, ["size-8", "focus-visible:outline-2", "focus-visible:outline-offset-2", "focus-visible:outline-focus-ring"]);
      assert.equal(attr(openingTag(item, /<svg[^>]*lucide-x[^>]*>/), "width"), "16");
    }
  });

  it("enters on opacity and transform at duration-base, and holds still under reduced motion", () => {
    assertClasses(openingTag(items[0], /^<li[^>]*>/), [
      "transition-[opacity,translate]",
      "duration-base",
      "ease-standard",
      "starting:opacity-0",
      "starting:translate-y-2",
      "motion-reduce:transition-none",
    ]);
  });

  it("uses only classes Tailwind generates", async () => {
    assert.deepEqual(await classesWithoutCss(html), []);
  });
});
