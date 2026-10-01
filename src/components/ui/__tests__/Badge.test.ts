import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Ban, Check, Clock, Lock, Trophy } from "lucide-react";
import { Badge, STATE_BADGES, StateLabel, type BadgeProps, type BadgeTone, type DomainState, type StateLabelProps } from "../Badge";

const badge = (props: BadgeProps) => renderToStaticMarkup(createElement(Badge, props));
const stateLabel = (props: StateLabelProps) => renderToStaticMarkup(createElement(StateLabel, props));

/** The outermost element's tag, attribute text and classes. */
function root(markup: string) {
  const open = markup.match(/^<([a-z]+)([^>]*)>/);
  assert.ok(open, `no element in: ${markup}`);
  return { tag: open[1], attrs: open[2], classes: open[2].match(/ class="([^"]*)"/)?.[1].split(" ") ?? [] };
}

/** The visible text: the markup with every tag removed. */
const text = (markup: string) => markup.replace(/<[^>]+>/g, "");

const TONE_CLASSES: Record<BadgeTone, string[]> = {
  neutral: ["bg-surface-2", "text-secondary"],
  info: ["bg-info/12", "text-info"],
  success: ["bg-success/12", "text-success"],
  warning: ["bg-warning/12", "text-warning"],
  danger: ["bg-danger/12", "text-danger"],
  live: ["bg-brand/12", "text-brand-text"],
};

test("every tone: caption type, control radius, its own tint and text, sentence case, static text", () => {
  for (const [tone, toneClasses] of Object.entries(TONE_CLASSES) as [BadgeTone, string[]][]) {
    const markup = badge({ tone, children: "Closing soon" });
    const { tag, attrs, classes } = root(markup);
    assert.equal(tag, "span");
    for (const cls of ["text-caption", "rounded-control", ...toneClasses]) assert.ok(classes.includes(cls), `${tone} has ${cls}`);
    assert.ok(!classes.includes("uppercase"), "sentence case");
    assert.doesNotMatch(attrs, / role=/, "a badge is plain text, not a live region");
    assert.equal(text(markup), "Closing soon");
  }
});

test("live: a red dot that pulses only when motion is allowed, beside the label", () => {
  const markup = badge({ tone: "live", children: "Live" });
  const dot = markup.match(/<span aria-hidden="true" class="([^"]*)"><\/span>/);
  assert.ok(dot, "renders a decorative dot");
  for (const cls of ["bg-brand", "rounded-full", "animate-pulse", "motion-reduce:animate-none"]) assert.ok(dot[1].split(" ").includes(cls), cls);
  assert.equal(text(markup), "Live");
  // Only the live tone has a dot.
  assert.doesNotMatch(badge({ tone: "warning", children: "Locked" }), /animate-pulse/);
});

test("an icon is decorative and 16px; the words carry the meaning", () => {
  const markup = badge({ tone: "success", icon: Trophy, children: "Winner" });
  assert.match(markup, /<svg[^>]* width="16"[^>]*aria-hidden="true"/);
  assert.equal(text(markup), "Winner");
});

test("STATE_BADGES maps each domain state to one badge, or to none", () => {
  assert.deepEqual(STATE_BADGES, {
    open: null,
    locked: { tone: "warning", icon: Lock, label: "Locked" },
    resolved: { tone: "neutral", icon: Check, label: "Resolved" },
    void: { tone: "neutral", icon: Ban, label: "Void" },
    upcoming: null,
    live: { tone: "live", label: "Live" },
    preliminary: { tone: "warning", label: "Preliminary" },
    final: null,
    pending: { tone: "neutral", icon: Clock, label: "Pending" },
  });
});

test("StateLabel renders nothing for the default states, and for upcoming (its date is shown instead)", () => {
  for (const state of ["open", "final", "upcoming"] as const) assert.equal(stateLabel({ state }), "", state);
});

test("StateLabel shows every other state in words, with its tone and its icon", () => {
  for (const [state, badge] of Object.entries(STATE_BADGES) as [DomainState, (typeof STATE_BADGES)[DomainState]][]) {
    if (!badge) continue;
    const markup = stateLabel({ state });
    assert.equal(text(markup), badge.label, state);
    for (const cls of TONE_CLASSES[badge.tone]) assert.ok(root(markup).classes.includes(cls), `${state} has ${cls}`);
    assert.equal((markup.match(/<svg/g) ?? []).length, badge.icon ? 1 : 0, `${state} icon`);
  }
  assert.match(stateLabel({ state: "locked" }), /lucide-lock/);
  assert.match(stateLabel({ state: "live" }), /animate-pulse/);
});

test("StateLabel passes a layout class through", () => {
  assert.ok(root(stateLabel({ state: "pending", className: "ml-2" })).classes.includes("ml-2"));
});
