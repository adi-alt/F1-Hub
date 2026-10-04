import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ROUTES, blockAi, settle, signInAs } from "./support";

// Audit R-34 / CR-28: axe reports no serious or critical violations on the key routes, signed in and
// out, at desktop and phone width (the two projects).
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function seriousViolations(page: import("@playwright/test").Page, include?: string) {
  // axe-core/playwright is typed against playwright-core's Page; this is the same object.
  const builder = new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] }).withTags(TAGS);
  if (include) builder.include(include);
  const { violations } = await builder.analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.help}`);
}

test.describe("signed out", () => {
  test("the landing page", async ({ page }) => {
    await blockAi(page);
    await page.goto("/");
    await settle(page);
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("the sign-in dialog", async ({ page }) => {
    await blockAi(page);
    await page.goto("/");
    await settle(page);
    await page.getByRole("button", { name: /^sign in$/i }).first().click();
    await page.waitForTimeout(600);
    expect(await seriousViolations(page, '[role="dialog"]')).toEqual([]);
  });
});

test.describe("signed in", () => {
  for (const route of ROUTES) {
    test(route, async ({ page, context }) => {
      await signInAs(context, "alex");
      await blockAi(page);
      await page.goto(route);
      await settle(page);
      expect(await seriousViolations(page)).toEqual([]);
    });
  }
});
