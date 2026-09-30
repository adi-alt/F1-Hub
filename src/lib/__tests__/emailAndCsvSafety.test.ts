// Regression tests for audit SEC-11 (HTML/header injection in invite emails) and SEC-26 (CSV
// formula injection in the Users export).

import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, singleLine, trustedOrigin } from "../html";
import { neutralizeFormula, rowsToCSV } from "../export";

describe("escapeHtml / singleLine (invite email templates)", () => {
  test("a community named like an anchor tag cannot inject markup", () => {
    const evil = `<a href="https://evil.example">Claim your prize</a>`;
    const html = `<strong>${escapeHtml(evil)}</strong>`;
    assert.ok(!html.includes("<a "), html);
    assert.equal(html, "<strong>&lt;a href=&quot;https://evil.example&quot;&gt;Claim your prize&lt;/a&gt;</strong>");
  });

  test("quotes and ampersands are escaped so attributes cannot be broken out of", () => {
    assert.equal(escapeHtml(`" onmouseover='x' & <b>`), "&quot; onmouseover=&#39;x&#39; &amp; &lt;b&gt;");
  });

  test("subject lines cannot carry CR/LF header injection and are length-capped", () => {
    assert.equal(singleLine("Club\r\nBcc: victim@example.com"), "Club Bcc: victim@example.com");
    assert.ok(singleLine("x".repeat(500)).length <= 80);
  });
});

describe("trustedOrigin", () => {
  const original = process.env.APP_BASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = original;
  });

  test("uses APP_BASE_URL over the request's own origin when configured", () => {
    process.env.APP_BASE_URL = "https://apexf1hub.com/some/path";
    assert.equal(trustedOrigin("https://attacker.example"), "https://apexf1hub.com");
  });

  test("falls back to the request origin when unset or not http(s)", () => {
    delete process.env.APP_BASE_URL;
    assert.equal(trustedOrigin("https://preview.vercel.app"), "https://preview.vercel.app");
    process.env.APP_BASE_URL = "javascript:alert(1)";
    assert.equal(trustedOrigin("https://preview.vercel.app"), "https://preview.vercel.app");
  });
});

describe("rowsToCSV formula neutralisation", () => {
  test("formula-shaped text is made inert", () => {
    for (const payload of [`=HYPERLINK("http://evil","x")`, "+cmd|' /C calc'!A0", "-2+3+cmd|' /C calc'!A0", "@SUM(1+1)", "\t=1+1"]) {
      assert.ok(neutralizeFormula(payload).startsWith("'"), payload);
    }
  });

  test("ordinary names and genuine numbers are untouched", () => {
    for (const ok of ["Lewis Hamilton", "O'Brien", "-5", "+12", "3.1", "0", ""]) assert.equal(neutralizeFormula(ok), ok);
  });

  test("a hostile first name in a CSV row is prefixed and still correctly quoted", () => {
    const csv = rowsToCSV(["Name", "Points"], [[`=1+1,"x"`, 25], ["Normal", -3]]);
    assert.equal(csv, `Name,Points\n"'=1+1,""x""",25\nNormal,-3`);
  });
});
