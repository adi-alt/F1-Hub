// The shared email layout (lib/email/layout) and the one-click unsubscribe tokens (lib/email/unsubscribe).

import { before, describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET = "email-test-secret-0123456789abcdef";
delete process.env.APP_BASE_URL;

let layout: typeof import("../email/layout");
let tokens: typeof import("../email/unsubscribe");
before(async () => {
  layout = await import("../email/layout");
  tokens = await import("../email/unsubscribe");
});
const renderEmail = (...a: Parameters<typeof layout.renderEmail>) => layout.renderEmail(...a);
const emailOrigin = () => layout.emailOrigin();
const unsubscribeToken = (...a: Parameters<typeof tokens.unsubscribeToken>) => tokens.unsubscribeToken(...a);
const unsubscribeUrl = (...a: Parameters<typeof tokens.unsubscribeUrl>) => tokens.unsubscribeUrl(...a);
const readUnsubscribeToken = (...a: Parameters<typeof tokens.readUnsubscribeToken>) => tokens.readUnsubscribeToken(...a);

describe("renderEmail", () => {
  const base = { subject: "Hi", preheader: "pre", title: "Title", reason: "Because" };

  test("everything a person wrote is escaped, and the subject can't carry a header", () => {
    const mail = renderEmail({ ...base, subject: "A\r\nBcc: x@y.z", title: "<script>x</script>", quote: `"><img src=x onerror=1>`, who: { name: "<b>Bob</b>" } });
    assert.ok(!mail.html.includes("<script>x"));
    assert.ok(!mail.html.includes("<img src=x"));
    assert.ok(!mail.html.includes("<b>Bob</b>"));
    assert.ok(!/[\r\n]/.test(mail.subject));
  });

  test("there is always a plain-text twin carrying the content and the button's link", () => {
    const mail = renderEmail({ ...base, rows: [{ label: "Your pick", value: "VER" }], cta: { label: "See the round", href: "/?section=communities" } });
    assert.match(mail.text, /Title/);
    assert.match(mail.text, /Your pick: VER/);
    assert.match(mail.text, new RegExp(`See the round: ${emailOrigin().replace(/\./g, "\\.")}/\\?section=communities`));
  });

  test("links go to the www address (the bare domain redirects), and site paths become full links", () => {
    assert.equal(emailOrigin(), "https://www.apexf1hub.com");
    assert.match(renderEmail({ ...base, cta: { label: "Go", href: "/x" } }).html, /href="https:\/\/www\.apexf1hub\.com\/x"/);
  });

  test("an unsubscribe link becomes the one-click headers and a footer link", () => {
    const mail = renderEmail({ ...base, unsubscribeUrl: "https://www.apexf1hub.com/api/notifications/unsubscribe?t=abc" });
    assert.deepEqual(mail.headers, { "List-Unsubscribe": "<https://www.apexf1hub.com/api/notifications/unsubscribe?t=abc>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    assert.match(mail.html, /Stop emails like this/);
    assert.deepEqual(renderEmail(base).headers, {});
  });

  test("it draws on the page's gradient, with a solid fallback for clients that drop it", () => {
    const { html } = renderEmail(base);
    assert.match(html, /bgcolor="#09090b"/);
    assert.match(html, /background-image:linear-gradient\(118deg/);
    assert.match(html, /<meta name="color-scheme" content="dark">/);
  });
});

describe("unsubscribe tokens", () => {
  const uid = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

  test("a token names its person and kind", () => {
    assert.deepEqual(readUnsubscribeToken(unsubscribeToken(uid, "reply")), { userId: uid, kind: "reply" });
    assert.match(unsubscribeUrl(uid, "reply"), /^https:\/\/www\.apexf1hub\.com\/api\/notifications\/unsubscribe\?t=/);
  });

  test("an altered, forged or malformed token is refused", () => {
    const token = unsubscribeToken(uid, "reply");
    const [, , sig] = token.split(".");
    assert.equal(readUnsubscribeToken(`${uid}.join_request.${sig}`), null, "another kind with the same signature");
    assert.equal(readUnsubscribeToken(`00000000-0000-0000-0000-000000000000.reply.${sig}`), null, "another person");
    assert.equal(readUnsubscribeToken(`${uid}.not_a_kind.${sig}`), null);
    assert.equal(readUnsubscribeToken("garbage"), null);
    assert.equal(readUnsubscribeToken(null), null);
  });
});
