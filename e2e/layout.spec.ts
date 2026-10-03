import { expect, test } from "@playwright/test";
import { ROUTES, blockAi, settle, signInAs } from "./support";

// Audit UX-S2 / CR-17: no horizontal overflow on any key route at 320 and 390px.
for (const width of [320, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    for (const route of ROUTES) {
      test(`${route} does not scroll sideways`, async ({ page, context }) => {
        await signInAs(context, "alex");
        await blockAi(page);
        await page.goto(route);
        await settle(page);
        const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
        expect(overflow.scroll, `scrollWidth ${overflow.scroll} vs clientWidth ${overflow.client}`).toBeLessThanOrEqual(overflow.client);
      });
    }
  });
}

test("the signed-out landing page does not scroll sideways at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await blockAi(page);
  await page.goto("/");
  await settle(page);
  const o = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(o.scroll).toBeLessThanOrEqual(o.client);
});
