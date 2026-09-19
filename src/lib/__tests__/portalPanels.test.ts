import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * A portal is not a React element - its `$$typeof` is Symbol(react.portal), not
 * Symbol(react.element) - so `isValidElement` returns false for one. AnimatePresence filters its
 * children through exactly that check, which means a portal nested INSIDE AnimatePresence is
 * silently dropped and the panel never renders at all.
 *
 * This shipped twice (the composer's Apex and Schedule panels) while the emoji and GIF pickers,
 * written the right way round, worked - so the failure is invisible in review and produces no
 * error, no warning and no type complaint. Hence a static guard: createPortal must wrap
 * AnimatePresence, never the other way round.
 */
const POST_DIR = join(process.cwd(), "src/app/groups/components/post");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(dir, f));
}

describe("floating panels", () => {
  it("never nest createPortal inside AnimatePresence", () => {
    const offenders: string[] = [];

    for (const file of tsxFiles(POST_DIR)) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("createPortal") || !src.includes("AnimatePresence")) continue;

      const portalAt = src.indexOf("createPortal(");
      const presenceAt = src.indexOf("<AnimatePresence>");
      // Both present: whichever opens first is the outer one. createPortal must be outermost.
      if (presenceAt !== -1 && portalAt !== -1 && presenceAt < portalAt) offenders.push(file.split("/").pop()!);
    }

    assert.deepEqual(offenders, [], `AnimatePresence wraps createPortal in: ${offenders.join(", ")} - the portal is dropped and the panel never renders`);
  });
});
