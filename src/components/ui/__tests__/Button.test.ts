import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArrowRight, Plus, Settings } from "lucide-react";
import { Button, buttonState, type ButtonProps } from "../Button";

const VARIANTS = ["primary", "secondary", "ghost", "danger"] as const;
const SIZES = ["sm", "md", "lg"] as const;
const FOCUS_RING = ["focus-visible:outline-2", "focus-visible:outline-offset-2", "focus-visible:outline-focus-ring"];

const render = (props: ButtonProps) => renderToStaticMarkup(createElement(Button, props));

/** The outermost element's tag, attribute text and classes. */
function root(markup: string) {
  const open = markup.match(/^<([a-z]+)([^>]*)>/);
  assert.ok(open, `no element in: ${markup}`);
  return { tag: open[1], attrs: open[2], classes: open[2].match(/ class="([^"]*)"/)?.[1].split(" ") ?? [] };
}

/** The visible text: the markup with every tag removed. */
const text = (markup: string) => markup.replace(/<[^>]+>/g, "");

test("renders a native button, type=button unless told otherwise", () => {
  const button = root(render({ variant: "primary", size: "md", children: "Join" }));
  assert.equal(button.tag, "button");
  assert.match(button.attrs, / type="button"/);
  assert.match(root(render({ variant: "primary", size: "md", type: "submit", children: "Post" })).attrs, / type="submit"/);
});

test("passes native button props through", () => {
  const { attrs } = root(render({ variant: "secondary", size: "md", id: "save", name: "intent", value: "save", form: "settings", "aria-describedby": "save-hint", children: "Save" }));
  for (const attr of [' id="save"', ' name="intent"', ' value="save"', ' form="settings"', ' aria-describedby="save-hint"']) assert.ok(attrs.includes(attr), attr);
});

test("each variant is drawn from its own tokens", () => {
  const expected: Record<(typeof VARIANTS)[number], string[]> = {
    primary: ["bg-brand", "text-white", "hover:bg-brand-hover"],
    secondary: ["bg-surface-2", "border", "border-strong", "text-primary"],
    ghost: ["text-secondary", "hover:text-primary", "hover:bg-surface-2"],
    danger: ["bg-danger-fill", "text-white"],
  };
  for (const variant of VARIANTS) {
    const { classes } = root(render({ variant, size: "md", children: "Go" }));
    for (const cls of expected[variant]) assert.ok(classes.includes(cls), `${variant} has ${cls}`);
  }
  // Ghost has no fill until it is hovered.
  assert.ok(!root(render({ variant: "ghost", size: "md", children: "Cancel" })).classes.some((cls) => cls.startsWith("bg-")));
});

test("heights are 32, 40 and 48; sm takes the control radius, md and lg the card radius", () => {
  const expected = { sm: ["h-8", "rounded-control"], md: ["h-10", "rounded-card"], lg: ["h-12", "rounded-card"] };
  for (const size of SIZES) {
    const { classes } = root(render({ variant: "primary", size, children: "Join" }));
    for (const cls of expected[size]) assert.ok(classes.includes(cls), `${size} has ${cls}`);
  }
});

test("every variant and size has the focus ring, a fast tone shift, and a press scale only when motion is allowed", () => {
  for (const variant of VARIANTS) {
    for (const size of SIZES) {
      const { classes } = root(render({ variant, size, children: "Go" }));
      for (const cls of [...FOCUS_RING, "duration-fast", "ease-standard", "motion-safe:active:scale-98"]) assert.ok(classes.includes(cls), `${variant}/${size} has ${cls}`);
      assert.ok(!classes.includes("outline-none"));
    }
  }
});

test("uses at most three type sizes", () => {
  const typeSizes = new Set(
    SIZES.flatMap((size) => root(render({ variant: "primary", size, children: "Go" })).classes.filter((cls) => /^text-(caption|body-sm|body|title-md|title-lg|display-md|display-lg)$/.test(cls))),
  );
  assert.ok(typeSizes.size <= 3, [...typeSizes].join(", "));
});

test("disabled: natively disabled, disabled text, no tone left, no pointer events", () => {
  for (const variant of VARIANTS) {
    const { attrs, classes } = root(render({ variant, size: "md", disabled: true, children: "Join" }));
    assert.match(attrs, / disabled=""/);
    assert.doesNotMatch(attrs, /aria-busy/);
    assert.ok(classes.includes("text-disabled") && classes.includes("pointer-events-none"), variant);
    for (const tone of ["bg-brand", "bg-danger-fill", "text-white", "text-primary", "text-secondary"]) assert.ok(!classes.includes(tone), `${variant} drops ${tone}`);
  }
});

test("loading: busy and disabled, with a spinner over a label that keeps its place", () => {
  const markup = render({ variant: "primary", size: "md", loading: true, iconStart: Plus, children: "Post" });
  const { attrs, classes } = root(markup);
  assert.match(attrs, / aria-busy="true"/);
  assert.match(attrs, / disabled=""/);
  assert.ok(classes.includes("pointer-events-none"));
  // Busy, not unavailable: the fill stays.
  assert.ok(classes.includes("bg-brand") && !classes.includes("text-disabled"));
  // The label is still laid out (so the width holds) and still names the button; it is only transparent.
  assert.match(markup, /<span class="[^"]*\bopacity-0\b[^"]*">.*Post<\/span>/);
  assert.equal(text(markup), "Post");
  // The spinner is decorative, and stops spinning when motion is reduced.
  const spinner = markup.match(/<span class="([^"]*)"><svg([^>]*lucide-loader-circle[^>]*)>/);
  assert.ok(spinner, "renders a spinner");
  for (const cls of ["animate-spin", "motion-reduce:animate-none"]) assert.ok(spinner[1].split(" ").includes(cls), cls);
  assert.match(spinner[2], /aria-hidden="true"/);
  // Not loading: no spinner.
  assert.doesNotMatch(render({ variant: "primary", size: "md", children: "Post" }), /lucide-loader-circle|opacity-0/);
});

test("iconOnly: a square button named by its aria-label, its icon hidden from assistive tech", () => {
  const squares = { sm: "size-8", md: "size-10", lg: "size-12" };
  for (const size of SIZES) {
    const markup = render({ variant: "ghost", size, iconOnly: true, iconStart: Settings, "aria-label": "Settings" });
    const { attrs, classes } = root(markup);
    assert.match(attrs, / aria-label="Settings"/);
    assert.ok(classes.includes(squares[size]), `${size} is ${squares[size]}`);
    assert.equal(text(markup), "", "no visible text");
    assert.match(markup, /<svg[^>]*aria-hidden="true"/);
  }
});

test("icons are decorative, stroke 1.75, sized to the button, and sit either side of the label", () => {
  const iconSizes = { sm: 16, md: 16, lg: 20 };
  for (const size of SIZES) {
    const markup = render({ variant: "secondary", size, iconStart: Plus, iconEnd: ArrowRight, children: "Add driver" });
    const icons = markup.match(/<svg[^>]*>/g) ?? [];
    assert.equal(icons.length, 2);
    for (const svg of icons) {
      assert.ok(svg.includes(` width="${iconSizes[size]}"`), `${size} icons are ${iconSizes[size]}px`);
      assert.match(svg, /stroke-width="1.75"/);
      assert.match(svg, /aria-hidden="true"/);
    }
    assert.ok(markup.indexOf("lucide-plus") < markup.indexOf("Add driver") && markup.indexOf("Add driver") < markup.indexOf("lucide-arrow-right"));
  }
});

test("asChild renders the child element (such as a Next <Link>) as the button", () => {
  const link = createElement("a", { href: "/races/monza", className: "w-full" }, "Enter prediction");
  const markup = render({ variant: "primary", size: "md", asChild: true, iconEnd: ArrowRight, children: link });
  const { tag, attrs, classes } = root(markup);
  assert.equal(tag, "a");
  assert.match(attrs, / href="\/races\/monza"/);
  assert.doesNotMatch(attrs, / type=/, "a link gets no button type");
  for (const cls of ["bg-brand", "h-10", ...FOCUS_RING]) assert.ok(classes.includes(cls), cls);
  assert.ok(classes.includes("w-full"), "keeps the child's own layout class");
  assert.equal(text(markup), "Enter prediction");
  assert.ok(markup.includes("lucide-arrow-right"));
  assert.doesNotMatch(attrs, /aria-disabled|tabindex|aria-busy/, "an enabled link gets nothing extra");
});

test("asChild that is disabled or loading: aria-disabled, out of the tab order, no pointer events", () => {
  const link = () => createElement("a", { href: "/join" }, "Join");
  const disabled = root(render({ variant: "primary", size: "md", asChild: true, disabled: true, children: link() }));
  assert.match(disabled.attrs, / aria-disabled="true"/);
  assert.match(disabled.attrs, / tabindex="-1"/);
  assert.ok(disabled.classes.includes("pointer-events-none") && disabled.classes.includes("text-disabled"));
  const loading = root(render({ variant: "primary", size: "md", asChild: true, loading: true, children: link() }));
  assert.match(loading.attrs, / aria-busy="true"/);
  assert.match(loading.attrs, / aria-disabled="true"/);
  assert.match(loading.attrs, / tabindex="-1"/);
});

test("asChild with iconOnly puts the accessible name on the child", () => {
  const markup = render({ variant: "ghost", size: "md", asChild: true, iconOnly: true, iconStart: Settings, "aria-label": "Settings", children: createElement("a", { href: "/settings" }) });
  const { tag, attrs } = root(markup);
  assert.equal(tag, "a");
  assert.match(attrs, / aria-label="Settings"/);
  assert.equal(text(markup), "");
});

test("asChild needs exactly one element child", () => {
  assert.throws(() => render({ variant: "primary", size: "md", asChild: true, children: "Join" as unknown as ReactElement }), /exactly one element child/);
});

test("buttonState: disabled and loading both make the button inert; only disabled dims it", () => {
  assert.deepEqual(buttonState({}), { inert: false, busy: false, dimmed: false });
  assert.deepEqual(buttonState({ disabled: true }), { inert: true, busy: false, dimmed: true });
  assert.deepEqual(buttonState({ loading: true }), { inert: true, busy: true, dimmed: false });
  // Both at once: the spinner says more than a greyed-out button would.
  assert.deepEqual(buttonState({ disabled: true, loading: true }), { inert: true, busy: true, dimmed: false });
});

test("the types require an aria-label on icon-only buttons and refuse style overrides", () => {
  // Compile-time checks: `tsc --noEmit` fails if any of these lines stops being a type error.
  // @ts-expect-error an icon-only button without an aria-label has no accessible name
  const unnamed: ButtonProps = { variant: "ghost", size: "sm", iconOnly: true, iconStart: Settings };
  // @ts-expect-error an icon-only button has no visible label
  const withLabel: ButtonProps = { variant: "ghost", size: "sm", iconOnly: true, iconStart: Settings, "aria-label": "Settings", children: "Settings" };
  // @ts-expect-error no style overrides: the look comes from variant and size
  const styled: ButtonProps = { variant: "primary", size: "md", style: { color: "red" }, children: "Join" };
  // @ts-expect-error with asChild, onClick belongs on the child element
  const slotClick: ButtonProps = { variant: "primary", size: "md", asChild: true, onClick: () => {}, children: createElement("a", { href: "/" }) };
  const named: ButtonProps = { variant: "ghost", size: "sm", iconOnly: true, iconStart: Settings, "aria-label": "Settings" };
  assert.ok([unnamed, withLabel, styled, slotClick, named].every(Boolean));
});
