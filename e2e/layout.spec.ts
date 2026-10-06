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

// The same check with a much wider fallback font forced on. CI's machine has different fonts from a
// laptop, and a page that only just fits at 320px with one font overflows with another; the document used
// to clip that (the old fixed-height body), so it went unnoticed until the page itself scrolled.
test.describe("at 320px with a wide font", () => {
  test.use({ viewport: { width: 320, height: 800 } });

  for (const route of ROUTES) {
    test(`${route} does not scroll sideways`, async ({ page, context }) => {
      await signInAs(context, "alex");
      await blockAi(page);
      await page.goto(route);
      await settle(page);
      await page.addStyleTag({ content: `*, *::before, *::after { font-family: Verdana, "DejaVu Sans", sans-serif !important; }` });
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(overflow.scroll, `scrollWidth ${overflow.scroll} vs clientWidth ${overflow.client}`).toBeLessThanOrEqual(overflow.client);
    });
  }
});
