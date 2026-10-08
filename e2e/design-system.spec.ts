import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { blockAi, settle } from "./support";

// Audit R-32 and the M2 exit criterion: every design-system primitive is live with a visual-regression
// snapshot and an axe gate. They are taken from /dev/ui, the page that lists every primitive and state
// (served to this production build by UI_PREVIEW=1, see e2e.yml). One test per section, at both projects'
// widths, so a change to one primitive fails only its own snapshot.
//
// Baselines are per platform. CI writes any that are missing (updateSnapshots: "missing" in
// playwright.config.ts) and uploads them as the visual-baselines artifact, so the first run of a new section
// records it and later runs compare against the committed file.
const SECTIONS = [
  "buttons",
  "badges",
  "chips",
  "session-schedule",
  "driver-identity",
  "probability-meter",
  "ai-summary",
  "icons",
  "surfaces",
  "sections",
  "tabs",
  "tables",
  "fields",
  "overlays",
  "toasts",
  "skeletons",
  "alerts",
  "empty-states",
];

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

test.describe("design system primitives", () => {
  test.beforeEach(async ({ page }) => {
    await blockAi(page);
    await page.goto("/dev/ui");
    // The snapshots are of the primitives, not the page: hide the page's background glow (body::before in
    // globals.css), which shows through transparent sections and would make every snapshot depend on it.
    await page.addStyleTag({ content: "body::before { display: none !important; }" });
    await settle(page);
  });

  test("the preview lists every section this spec covers", async ({ page }) => {
    const ids = await page.locator("main section[id]").evaluateAll((els) => els.map((el) => el.id));
    for (const id of SECTIONS) expect(ids, `#${id} is missing from /dev/ui`).toContain(id);
  });

  for (const id of SECTIONS) {
    test(`${id}: no serious accessibility issue`, async ({ page }) => {
      const builder = new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] }).withTags(TAGS).include(`#${id}`);
      const { violations } = await builder.analyze();
      const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.help}`);
      expect(serious).toEqual([]);
    });

    test(`${id}: looks the same as its baseline`, async ({ page }) => {
      const section = page.locator(`#${id}`);
      await section.scrollIntoViewIfNeeded();
      await expect(section).toHaveScreenshot(`${id}.png`, { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.01 });
    });
  }
});
