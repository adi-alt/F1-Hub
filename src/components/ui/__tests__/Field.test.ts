import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Field, fieldControlClass, Select, TextInput, type FieldControlProps } from "../Field";
import { classesOf, classesWithoutCss, tags, withChildren, type Tag } from "./markup";

const control = ({ id, describedBy, invalid }: FieldControlProps) =>
  createElement("textarea", { id, "aria-describedby": describedBy, "aria-invalid": invalid, className: fieldControlClass(invalid) });

const find = (html: string, name: string) => tags(html).find((tag) => tag.name === name);
const has = (tag: Tag | undefined, ...classes: string[]) => classes.every((cls) => classesOf(tag).includes(cls));
const idsIn = (html: string) => new Set(tags(html).map((tag) => tag.attrs.id));

test("the label points at the control, and the control is described by the hint and the error", () => {
  const html = renderToStaticMarkup(withChildren(Field, { label: "Bio", hint: "Shown on your profile", error: "Keep it under 160 characters" }, control));
  const label = find(html, "label");
  const textarea = find(html, "textarea");
  assert.ok(textarea?.attrs.id);
  assert.equal(label?.attrs.for, textarea.attrs.id);
  const described = textarea.attrs["aria-describedby"].split(" ");
  assert.deepEqual(described, [`${textarea.attrs.id}-hint`, `${textarea.attrs.id}-error`]);
  for (const id of described) assert.ok(idsIn(html).has(id), `aria-describedby names missing id ${id}`);
  assert.equal(textarea.attrs["aria-invalid"], "true");
});

test("an error is danger text with an AlertCircle icon, never colour alone", () => {
  const html = renderToStaticMarkup(withChildren(Field, { label: "Bio", error: "Too long" }, control));
  const error = tags(html).find((tag) => tag.attrs.id?.endsWith("-error"));
  assert.equal(error?.name, "p");
  assert.ok(has(error, "text-danger"));
  const errorMarkup = html.slice(html.indexOf('-error"'));
  assert.match(errorMarkup, /<svg[^>]*class="lucide lucide-circle-alert[^"]*"[^>]*aria-hidden="true"/);
  assert.match(errorMarkup, /width="16"[^>]*stroke-width="1.75"/);
  assert.match(errorMarkup, /<span class="sr-only">Error: <\/span>Too long/);
});

test("with no hint or error the control is valid and described by nothing", () => {
  const html = renderToStaticMarkup(withChildren(Field, { label: "Bio" }, control));
  const textarea = find(html, "textarea");
  assert.equal(textarea?.attrs["aria-describedby"], undefined);
  assert.equal(textarea?.attrs["aria-invalid"], "false");
  assert.doesNotMatch(html, /text-danger|<svg/);
});

test("a hint alone describes the control without marking it invalid", () => {
  const html = renderToStaticMarkup(withChildren(Field, { label: "Bio", hint: "Optional" }, control));
  const textarea = find(html, "textarea");
  assert.equal(textarea?.attrs["aria-describedby"], `${textarea?.attrs.id}-hint`);
  assert.equal(textarea?.attrs["aria-invalid"], "false");
  assert.ok(has(tags(html).find((tag) => tag.attrs.id?.endsWith("-hint")), "text-secondary"));
});

test("a given id replaces the generated one, and the hint and error ids follow it", () => {
  const html = renderToStaticMarkup(withChildren(Field, { label: "Email", id: "signup-email", hint: "h", error: "e" }, control));
  assert.equal(find(html, "label")?.attrs.for, "signup-email");
  assert.equal(find(html, "textarea")?.attrs["aria-describedby"], "signup-email-hint signup-email-error");
});

test("two fields on one page never share an id", () => {
  const html = renderToStaticMarkup(createElement("form", null, createElement(TextInput, { label: "First", hint: "h" }), createElement(TextInput, { label: "Last", hint: "h" })));
  const ids = tags(html)
    .map((tag) => tag.attrs.id)
    .filter(Boolean);
  assert.equal(ids.length, 4);
  assert.equal(new Set(ids).size, 4);
});

test("fieldControlClass: 40px, border-strong boundary (danger when invalid), surface-2 fill, the focus ring", () => {
  const valid = fieldControlClass(false).split(" ");
  const invalid = fieldControlClass(true).split(" ");
  for (const classes of [valid, invalid]) {
    for (const cls of ["min-h-10", "rounded-control", "border", "bg-surface-2", "text-body", "focus-visible:border-secondary", "focus-visible:bg-surface-3"]) {
      assert.ok(classes.includes(cls), cls);
    }
  }
  assert.ok(valid.includes("border-strong") && !valid.includes("border-danger"));
  assert.ok(invalid.includes("border-danger") && !invalid.includes("border-strong"));
});

test("TextInput passes native props through and wires the field up", () => {
  const html = renderToStaticMarkup(createElement(TextInput, { label: "Email", type: "email", name: "email", placeholder: "you@example.com", required: true, error: "Enter an email address" }));
  const input = find(html, "input");
  assert.equal(input?.attrs.type, "email");
  assert.equal(input?.attrs.name, "email");
  assert.equal(input?.attrs.placeholder, "you@example.com");
  assert.ok(input && "required" in input.attrs);
  assert.equal(input?.attrs["aria-invalid"], "true");
  assert.equal(input?.attrs["aria-describedby"], `${input?.attrs.id}-error`);
  assert.equal(find(html, "label")?.attrs.for, input?.attrs.id);
  assert.ok(has(input, "border-danger", "min-h-10"));
});

test("TextInput defaults to type=text and leaves aria-invalid off while valid", () => {
  const input = find(renderToStaticMarkup(createElement(TextInput, { label: "Name" })), "input");
  assert.equal(input?.attrs.type, "text");
  assert.equal(input?.attrs["aria-invalid"], undefined);
  assert.ok(has(input, "border-strong"));
});

test("Select renders its options in a styled native select with a decorative chevron", () => {
  const html = renderToStaticMarkup(
    withChildren(
      Select,
      { label: "Team", hint: "Pick one", name: "team" },
      createElement("option", { key: "mcl", value: "mcl" }, "McLaren"),
      createElement("option", { key: "fer", value: "fer" }, "Ferrari"),
    ),
  );
  const select = find(html, "select");
  assert.equal(select?.attrs.name, "team");
  assert.equal(find(html, "label")?.attrs.for, select?.attrs.id);
  assert.equal(select?.attrs["aria-describedby"], `${select?.attrs.id}-hint`);
  assert.ok(has(select, "appearance-none", "border-strong", "min-h-10"));
  assert.equal(tags(html).filter((tag) => tag.name === "option").length, 2);
  assert.match(html, /<svg[^>]*class="lucide lucide-chevron-down[^"]*pointer-events-none[^"]*"[^>]*aria-hidden="true"/);
});

test("every class Field renders is a real Tailwind utility", async () => {
  const html = [
    renderToStaticMarkup(withChildren(Field, { label: "Bio", hint: "h", error: "e" }, control)),
    renderToStaticMarkup(createElement(TextInput, { label: "Name" })),
    renderToStaticMarkup(withChildren(Select, { label: "Team", error: "Pick one" }, createElement("option", null, "McLaren"))),
  ].join("");
  assert.deepEqual(await classesWithoutCss(html), []);
});
