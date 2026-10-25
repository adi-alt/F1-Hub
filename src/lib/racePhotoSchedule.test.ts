import { test } from "node:test";
import assert from "node:assert/strict";
import { inScanWindow, nextPhotoScan } from "./racePhotoSchedule";

test("the next scan after a Sunday is Monday 06:00 UTC", () => {
  assert.equal(nextPhotoScan(new Date("2026-10-25T12:00:00Z")).toISOString(), "2026-10-26T06:00:00.000Z");
});

test("on a Saturday before 22:00 the next scan is that night", () => {
  assert.equal(nextPhotoScan(new Date("2026-10-24T21:59:00Z")).toISOString(), "2026-10-24T22:00:00.000Z");
});

test("a scan time that has just passed rolls to the next one", () => {
  assert.equal(nextPhotoScan(new Date("2026-10-29T06:00:00Z")).toISOString(), "2026-10-31T22:00:00.000Z");
});

test("the scan window covers this weekend's race and the last five weeks", () => {
  const sat = new Date("2026-10-24T22:00:00Z");
  assert.equal(inScanWindow("2026-10-25", sat), true);
  assert.equal(inScanWindow("2026-09-19", sat), true);
  assert.equal(inScanWindow("2026-09-18", sat), false);
  assert.equal(inScanWindow("2026-11-01", sat), false);
});
