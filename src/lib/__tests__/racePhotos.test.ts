// Race photos (pipeline/race_photos.py -> /admin/race-photos -> race page): the read-side licence and URL rules,
// the four-photo cap, and how candidates are grouped for review.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_LICENCE, creditLabel, groupCandidates, isPublishable, nextFreeRank, type RacePhotoCandidate } from "@/lib/racePhotos";

const photo = {
  imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/1280px-X.jpg",
  thumbnailUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/500px-X.jpg",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:X.jpg",
  photographer: "Yu Chu Chin",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
};

describe("isPublishable", () => {
  it("accepts an allowed licence with a full credit and Wikimedia URLs", () => {
    assert.equal(isPublishable(photo), true);
    for (const license of ["CC0", "Public domain", "CC BY 4.0", "CC BY-SA 2.0"]) assert.equal(isPublishable({ ...photo, license }), true, license);
  });

  it("refuses non-commercial, no-derivatives and unknown licences", () => {
    for (const license of ["CC BY-NC 4.0", "CC BY-ND 4.0", "CC BY-NC-SA 4.0", "Fair use", "", "CC BY-SA"]) {
      assert.equal(isPublishable({ ...photo, license }), false, license);
      assert.equal(ALLOWED_LICENCE.test(license), false, license);
    }
  });

  it("refuses a missing credit or licence link", () => {
    assert.equal(isPublishable({ ...photo, photographer: "  " }), false);
    assert.equal(isPublishable({ ...photo, licenseUrl: "" }), false);
  });

  it("refuses images hosted anywhere but Wikimedia, including our own Storage", () => {
    assert.equal(isPublishable({ ...photo, imageUrl: "https://x.supabase.co/storage/v1/object/public/media/races/x.jpg" }), false);
    assert.equal(isPublishable({ ...photo, thumbnailUrl: "https://example.com/x.jpg" }), false);
    assert.equal(isPublishable({ ...photo, sourceUrl: "https://example.com/x" }), false);
  });
});

describe("nextFreeRank", () => {
  it("fills the lowest free place and stops at four", () => {
    assert.equal(nextFreeRank([]), 1);
    assert.equal(nextFreeRank([1, 2]), 3);
    assert.equal(nextFreeRank([1, 3, 4]), 2);
    assert.equal(nextFreeRank([1, 2, 3, 4]), null);
  });
});

describe("groupCandidates", () => {
  const cand = (id: number, groupKey: string, score: number, subject: RacePhotoCandidate["subject"] = "podium"): RacePhotoCandidate => ({
    ...photo,
    id,
    raceId: "r",
    providerId: `File:${id}.jpg`,
    altText: "",
    width: 6000,
    height: 4000,
    takenOn: "2026-03-08",
    subject,
    score,
    groupKey,
    status: "pending",
  });

  it("shows one best frame per burst, alternates behind it, groups by their best score", () => {
    const groups = groupCandidates([cand(1, "podium", 14), cand(2, "podium", 14), cand(3, "car", 10, "car"), cand(4, "podium", 12)]);
    assert.deepEqual(
      groups.map((g) => [g.groupKey, g.best.id, g.alternates.map((a) => a.id)]),
      [
        ["podium", 1, [2, 4]],
        ["car", 3, []],
      ],
    );
    assert.equal(groups[1].subject, "car");
  });

  it("has nothing to offer when there are no candidates", () => {
    assert.deepEqual(groupCandidates([]), []);
  });
});

describe("creditLabel", () => {
  it("names the photographer and licence", () => {
    assert.equal(creditLabel(photo), "Photo: Yu Chu Chin, CC BY-SA 4.0");
  });
});
