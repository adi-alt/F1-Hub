import { expect, test } from "@playwright/test";
import { ROUTES, blockAi, settle, signInAs } from "./support";

// Audit R-31 / DS-04: the document scrolls. Not a fixed-height body with a scroll container inside it
// and a smooth-scroll layer on top, which broke Back-button restoration, keyboard scrolling on load,
// find-in-page and the browser's scrollbar.
test.describe("native document scroll", () => {
  test.beforeEach(async ({ page, context }) => {
    await signInAs(context, "alex");
    await blockAi(page);
  });

  for (const route of ROUTES) {
    test(`${route}: nothing but the document scrolls`, async ({ page }) => {
      await page.goto(route);
      await settle(page);
      const state = await page.evaluate(() => ({
        appScroll: document.querySelector("[data-app-scroll]") !== null,
        bodyOverflow: getComputedStyle(document.body).overflowY,
        htmlOverflow: getComputedStyle(document.documentElement).overflowY,
        scrolls: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      }));
      expect(state.appScroll, "no inner scroll container").toBe(false);
      expect(state.bodyOverflow).not.toBe("hidden");
      expect(state.htmlOverflow).not.toBe("hidden");
      expect(state.scrolls, "the page is taller than the window, so the document scrolls").toBe(true);
    });
  }

  test("PageDown scrolls straight away, without clicking the page first", async ({ page }) => {
    await page.goto("/race?year=2026&race=bahrain-grand-prix");
    await settle(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.keyboard.press("PageDown");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  });

  test("the header stays in view while the page scrolls", async ({ page }) => {
    await page.goto("/season?year=2026");
    await settle(page);
    await page.evaluate(() => window.scrollTo(0, 900));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    const top = await page.locator("header").first().evaluate((el) => Math.round(el.getBoundingClientRect().top));
    expect(top).toBe(0);
  });

  test("Back returns to where you were on the page", async ({ page }) => {
    await page.goto("/season?year=2026");
    await settle(page);
    await page.evaluate(() => window.scrollTo(0, 700));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    const before = await page.evaluate(() => window.scrollY);
    // The logo link is in the header at every width (the main nav is hidden on a phone). It is a client-side
    // navigation, which is the case Back restoration has to handle. Clicked by coordinates: Playwright's own
    // click scrolls a sticky element "into view", which would move the page before the click lands.
    const logo = await page.locator("header").getByRole("link", { name: /F1 HUB/ }).boundingBox();
    if (!logo) throw new Error("the logo link has no box");
    await page.mouse.click(logo.x + logo.width / 2, logo.y + logo.height / 2);
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await settle(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/season/);
    await settle(page);
    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before), `scrolled to ${before}, came back to ${after}`).toBeLessThan(80);
  });

  test("a clicked in-page link keeps the heading below the sticky header", async ({ page }) => {
    await page.goto("/season?year=2026");
    await settle(page);
    const scrollPadding = await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingTop);
    expect(parseFloat(scrollPadding)).toBeGreaterThanOrEqual(64);
  });
});

test.describe("a modal freezes the page behind it and gives it back", () => {
  test("the sign-in dialog locks and releases the document's scroll", async ({ page }) => {
    await blockAi(page);
    await page.route("**/api/auth/**", (route) => route.abort());
    await page.goto("/");
    await settle(page);
    await page.evaluate(() => window.scrollTo(0, 300));
    const opener = page.getByRole("button", { name: /^sign in$/i }).first();
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Sign in or sign up" });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
    // the scrollbar's width stays reserved, so locking does not shift the layout
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter)).toContain("stable");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  });
});
