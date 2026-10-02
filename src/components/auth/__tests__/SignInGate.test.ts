import { it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SignInGate } from "../SignInGate";

it("is the page's h1, since every caller renders it in place of the whole page (audit UI-32)", () => {
  const html = renderToStaticMarkup(createElement(SignInGate, { label: "season standings" }));
  assert.match(html, /<h1[^>]*>Sign in to view season standings<\/h1>/);
  assert.match(html, /<button type="button"[^>]*>Sign in<\/button>/);
});
