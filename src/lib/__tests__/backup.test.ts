// The backup tooling's safety properties (audit R-27): a new table can't be missed, the file is only
// readable with the private key, and the nightly job can only reach production from main.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const load = (file: string) => import(pathToFileURL(path.join(ROOT, file)).href) as Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("table classification", () => {
  it("names every table in the schema of record, in exactly one list", async () => {
    const lists = await load("scripts/lib/backup-tables.mjs");
    const all = [...lists.IRREPLACEABLE, ...lists.REBUILDABLE, ...lists.EPHEMERAL] as string[];
    assert.equal(new Set(all).size, all.length, "a table is in two lists");
    const schema = fs.readFileSync(path.join(ROOT, "supabase/schema.sql"), "utf8");
    const created = [...schema.matchAll(/^create table (?:if not exists )?(\w+)/gim)].map((m) => m[1]);
    assert.deepEqual(lists.unclassified(created), [], "schema.sql creates a table the backup doesn't know about");
  });

  it("the migrations' new tables are classified too", async () => {
    const lists = await load("scripts/lib/backup-tables.mjs");
    const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
    const created = migrations.flatMap((f) => [...fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8").matchAll(/^create table (?:if not exists )?(?:public\.)?(\w+)/gim)].map((m) => m[1]));
    assert.deepEqual(lists.unclassified(created), []);
  });

  it("reports an unknown table, and the one-time codes are never backed up", async () => {
    const lists = await load("scripts/lib/backup-tables.mjs");
    assert.deepEqual(lists.unclassified(["profiles", "brand_new_table", "calendar"]), ["brand_new_table"]);
    assert.ok(lists.EPHEMERAL.includes("otp_codes") && !lists.IRREPLACEABLE.includes("otp_codes"));
    assert.ok(lists.IRREPLACEABLE.includes("races"), "the frozen predictions live in races");
  });
});

describe("the encrypted file", () => {
  it("opens only with the matching private key, and holds no readable data", async () => {
    const backup = await load("scripts/lib/backup.mjs");
    const age = await import("age-encryption");
    const mine = await age.generateIdentity();
    const theirs = await age.generateIdentity();
    const data = { version: 1, createdAt: "2026-10-04T00:00:00Z", tables: { profiles: [{ id: "u1", email: "private@example.com" }] }, auth: { users: [], identities: [] }, manifest: {} };
    const sealed = await backup.seal(data, await age.identityToRecipient(mine));
    assert.equal(Buffer.from(sealed).toString("latin1").includes("private@example.com"), false);
    assert.deepEqual(await backup.open(sealed, mine), data);
    await assert.rejects(backup.open(sealed, theirs));
  });

  it("restores only into a drill_ scratch schema, never public", async () => {
    const backup = await load("scripts/lib/backup.mjs");
    for (const bad of ["public", "auth", "drill", "Drill_x", "drill_x; drop schema public"]) {
      await assert.rejects(backup.restoreToScratch({ query: async () => ({ rows: [] }) }, { tables: {}, manifest: {} }, bad), /scratch schema must be named drill_/, bad);
    }
  });

  it("the repository holds the public key and never a private one", () => {
    const recipient = fs.readFileSync(path.join(ROOT, "supabase/backup-recipient.txt"), "utf8").trim();
    assert.match(recipient, /^age1[a-z0-9]{50,}$/);
    assert.ok(!recipient.startsWith("AGE-SECRET-KEY"));
  });
});

describe("backup.yml", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/backup.yml"), "utf8");
  const backup = yml.slice(yml.indexOf("\n  backup:"));
  const drill = yml.slice(yml.indexOf("\n  drill:"), yml.indexOf("\n  backup:"));

  it("the production backup runs only on a schedule or a manual run, and only from main", () => {
    assert.match(backup, /\(github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'\) && github\.ref == 'refs\/heads\/main'/);
    assert.match(backup, /EXPECTED_PROJECT_REF: opnfquuowxkabtqxxraa/);
  });

  it("the drill touches staging only, and never for a fork", () => {
    assert.match(drill, /environment: staging/);
    assert.match(drill, /EXPECTED_PROJECT_REF: wmdgbmlpvszyapewygvs/);
    assert.match(drill, /head\.repo\.full_name == github\.repository/);
  });

  it("keeps the artifact for 30 days and has a read-only token", () => {
    assert.match(yml, /retention-days: 30/);
    assert.match(yml, /permissions:\n {2}contents: read/);
  });
});
