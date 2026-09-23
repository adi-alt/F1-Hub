import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeRole, parseInviteCsv, parseInviteFile, parseInviteJson, splitCsvLine } from "./parseBulkInvites";

describe("splitCsvLine", () => {
  it("splits a plain line", () => {
    assert.deepEqual(splitCsvLine("a,b,c"), ["a", "b", "c"]);
  });

  it("keeps a comma that lives inside a quoted field", () => {
    // The whole reason this isn't line.split(",") — a quoted display name with a comma in it
    // would otherwise shift every column after it by one.
    assert.deepEqual(splitCsvLine('"Doe, John",john@example.com'), ["Doe, John", "john@example.com"]);
  });

  it("unescapes a doubled quote inside a quoted field", () => {
    assert.deepEqual(splitCsvLine('"She said ""hi""",x@example.com'), ['She said "hi"', "x@example.com"]);
  });

  it("preserves empty trailing fields", () => {
    assert.deepEqual(splitCsvLine("a,,"), ["a", "", ""]);
  });
});

describe("normalizeRole", () => {
  it("maps the member spellings to null, which is how this codebase spells that tier", () => {
    for (const spelling of ["", "member", "User", " none "]) {
      const result = normalizeRole(spelling);
      assert.equal(result.ok, true);
      assert.equal(result.ok && result.role, null);
    }
  });

  it("maps admin and moderator aliases case-insensitively", () => {
    assert.deepEqual(normalizeRole("ADMIN"), { ok: true, role: "admin" });
    assert.deepEqual(normalizeRole("Mod"), { ok: true, role: "moderator" });
    assert.deepEqual(normalizeRole("moderators"), { ok: true, role: "moderator" });
  });

  it("rejects anything it doesn't recognise rather than guessing a tier", () => {
    assert.equal(normalizeRole("superuser").ok, false);
  });
});

describe("parseInviteCsv", () => {
  it("reads email and role columns regardless of header case or order", () => {
    const { rows, errors } = parseInviteCsv("Role,Email\nadmin,a@example.com\nmoderator,b@example.com");
    assert.deepEqual(errors, []);
    assert.deepEqual(rows, [
      { email: "a@example.com", role: "admin" },
      { email: "b@example.com", role: "moderator" },
    ]);
  });

  it("accepts `type` as the role column, which is what the reference platform exports", () => {
    const { rows } = parseInviteCsv("email,type\na@example.com,admin");
    assert.deepEqual(rows, [{ email: "a@example.com", role: "admin" }]);
  });

  it("treats a missing role column as inviting everyone as a member", () => {
    const { rows, errors } = parseInviteCsv("email\na@example.com\nb@example.com");
    assert.deepEqual(errors, []);
    assert.deepEqual(rows, [
      { email: "a@example.com", role: null },
      { email: "b@example.com", role: null },
    ]);
  });

  it("reports bad rows by line number and still keeps the good ones", () => {
    const { rows, errors } = parseInviteCsv("email,role\ngood@example.com,admin\nnot-an-email,admin\nalso@example.com,wizard");
    assert.deepEqual(rows, [{ email: "good@example.com", role: "admin" }]);
    assert.equal(errors.length, 2);
    assert.equal(errors[0].line, 3);
    assert.match(errors[0].reason, /not a valid email/);
    assert.equal(errors[1].line, 4);
    assert.match(errors[1].reason, /Unknown role/);
  });

  it("fails with a useful message when there is no email column at all", () => {
    const { rows, errors } = parseInviteCsv("name,role\nJohn,admin");
    assert.deepEqual(rows, []);
    assert.match(errors[0].reason, /No "email" column/);
  });

  it("skips blank lines rather than reporting them as broken rows", () => {
    const { rows, errors } = parseInviteCsv("email,role\n\na@example.com,admin\n\n");
    assert.deepEqual(errors, []);
    assert.equal(rows.length, 1);
  });

  it("lowercases addresses so the same mailbox can't be invited twice by casing", () => {
    const { rows } = parseInviteCsv("email\nMixed@Example.COM");
    assert.equal(rows[0].email, "mixed@example.com");
  });
});

describe("parseInviteJson", () => {
  it("reads an array of objects, accepting role or type", () => {
    const { rows, errors } = parseInviteJson('[{"email":"a@example.com","role":"admin"},{"email":"b@example.com","type":"mod"}]');
    assert.deepEqual(errors, []);
    assert.deepEqual(rows, [
      { email: "a@example.com", role: "admin" },
      { email: "b@example.com", role: "moderator" },
    ]);
  });

  it("reports malformed JSON instead of throwing at the caller", () => {
    const { rows, errors } = parseInviteJson("{not json");
    assert.deepEqual(rows, []);
    assert.match(errors[0].reason, /Not valid JSON/);
  });

  it("rejects a bare object — the format is an array", () => {
    assert.match(parseInviteJson('{"email":"a@example.com"}').errors[0].reason, /array/);
  });
});

describe("parseInviteFile", () => {
  it("rejects a file type it can't read", () => {
    assert.match(parseInviteFile("people.txt", "anything").errors[0].reason, /Unsupported file type/);
  });

  it("dedupes repeated addresses, last entry winning, matching what the server does", () => {
    const { rows } = parseInviteFile("x.csv", "email,role\na@example.com,moderator\na@example.com,admin");
    assert.deepEqual(rows, [{ email: "a@example.com", role: "admin" }]);
  });

  it("round-trips a file in the shape this page's own JSON export produces", () => {
    const exported = JSON.stringify([{ email: "a@example.com", role: "Admin" }]);
    assert.deepEqual(parseInviteFile("users.json", exported).rows, [{ email: "a@example.com", role: "admin" }]);
  });
});
