import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { channelsFor, cleanPrefsPatch, NOTIFICATION_KINDS } from "../notificationKinds";

describe("notification settings", () => {
  it("falls back channel by channel to the kind's defaults", () => {
    assert.deepEqual(channelsFor({}, "prediction_result"), { site: true, email: true });
    assert.deepEqual(channelsFor({ prediction_result: { email: false } }, "prediction_result"), { site: true, email: false });
    assert.deepEqual(channelsFor(null, "reply"), { site: true, email: false });
    assert.deepEqual(channelsFor({ reply: { site: "yes" } }, "reply"), { site: true, email: false }, "a non-boolean is ignored");
  });
  it("keeps only known kinds, known channels and booleans from a change", () => {
    assert.deepEqual(cleanPrefsPatch({ reply: { email: true, push: true }, unknown: { site: false }, new_round: { site: "no" } }), { reply: { email: true } });
    assert.equal(cleanPrefsPatch({ unknown: { site: true } }), null);
    assert.equal(cleanPrefsPatch("nope"), null);
  });
  it("every kind the database allows is described for settings", () => {
    const sql = fs.readFileSync("supabase/migrations/20261022_notifications.sql", "utf8");
    for (const k of NOTIFICATION_KINDS) assert.match(sql, new RegExp(`'${k.kind}'`));
  });
});
