import { it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SignInGate } from "../SignInGate";

it("is the page's h1, since every caller renders it in place of the whole page (audit UI-32)", () => {
  const html = renderToStaticMarkup(createElement(SignInGate, { label: "season standings" }));
  // Exactly one h1, naming what's behind the gate; the "sign in to see" line sits just above it.
  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /<h1[^>]*>The championship, round by round<\/h1>/);
  assert.match(html, /Sign in to see season standings/);
  assert.match(html, /<button type="button"[^>]*>Create a free account<\/button>/);
  assert.match(html, /<button type="button"[^>]*>I have an account · Sign in<\/button>/);
});

it("says what's behind each gate, and falls back to a general line for anything else", () => {
  const archive = renderToStaticMarkup(createElement(SignInGate, { label: "the historical archive" }));
  assert.match(archive, /<h1[^>]*>Every Formula 1 race since 1950<\/h1>/);
  const other = renderToStaticMarkup(createElement(SignInGate, { label: "your profile" }));
  assert.match(other, /<h1[^>]*>Sign in to see your profile<\/h1>/);
});

it("NotAuthorized is the page's h1 too", async () => {
  const { NotAuthorized } = await import("../../NotAuthorized");
  assert.match(renderToStaticMarkup(createElement(NotAuthorized, { what: "user management" })), /<h1[^>]*>Not authorized<\/h1>/);
});
