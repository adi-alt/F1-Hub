import { test } from "node:test";
import assert from "node:assert/strict";
import { extractEmails } from "./emailImport";

test("extractEmails reads a CSV export, header row and all", () => {
  const csv = "name,email,role\nAda Lovelace,ada@example.com,admin\nAlan Turing,alan@example.org,member\n";
  assert.deepEqual(extractEmails(csv), ["ada@example.com", "alan@example.org"]);
});

test("extractEmails reads JSON without needing to know its shape", () => {
  const asObjects = JSON.stringify([{ name: "Ada", email: "ada@example.com" }, { name: "Alan", email: "alan@example.org" }]);
  assert.deepEqual(extractEmails(asObjects), ["ada@example.com", "alan@example.org"]);

  // A bare array of strings, and a key literally called "email", both fall out of the same pass -
  // the key isn't an address, so it simply doesn't match.
  assert.deepEqual(extractEmails(JSON.stringify(["ada@example.com"])), ["ada@example.com"]);
});

test("extractEmails strips the punctuation files wrap addresses in", () => {
  // The three real shapes: a display-name column, a quoted CSV cell, and a semicolon-delimited
  // list pasted out of an email client.
  assert.deepEqual(extractEmails("Ada Lovelace <ada@example.com>"), ["ada@example.com"]);
  assert.deepEqual(extractEmails('"ada@example.com","alan@example.org"'), ["ada@example.com", "alan@example.org"]);
  assert.deepEqual(extractEmails("ada@example.com; alan@example.org;"), ["ada@example.com", "alan@example.org"]);
});

test("extractEmails doesn't swallow a sentence's trailing period into the domain", () => {
  assert.deepEqual(extractEmails("Write to ada@example.com."), ["ada@example.com"]);
  assert.deepEqual(extractEmails("(ada@example.com)"), ["ada@example.com"]);
});

test("extractEmails de-duplicates case-insensitively, keeping first-seen order", () => {
  const text = "zoe@example.com\nADA@example.com\nada@EXAMPLE.com\nzoe@example.com";
  assert.deepEqual(extractEmails(text), ["zoe@example.com", "ada@example.com"]);
});

test("extractEmails finds nothing in a file that has nothing", () => {
  assert.deepEqual(extractEmails(""), []);
  assert.deepEqual(extractEmails("name,role\nAda,admin"), []);
  // A bare domain or an @handle is not an address and must not be offered as one.
  assert.deepEqual(extractEmails("example.com @adalovelace"), []);
});
