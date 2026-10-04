// A season's race list merges in calendar placeholders (rounds `races` has no row for yet). The calendar
// sync busts the "calendar" tag, so every cached read that merges them must carry that tag too (audit R-19):
// otherwise a rescheduled round kept showing its old date until the next results write busted "races".

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("cached reads that include calendar placeholders", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/supabase/races.ts"), "utf8");

  for (const key of ["get-races-by-year", "get-next-upcoming-race"]) {
    it(`${key} expires on both "races" and "calendar"`, () => {
      const block = source.slice(source.indexOf(`["${key}"]`));
      const tags = block.slice(0, block.indexOf("),")).match(/tags: (\[[^\]]*\])/)?.[1];
      assert.equal(tags, '["races", "calendar"]');
    });
  }
});
