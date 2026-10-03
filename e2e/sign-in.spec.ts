import { expect, test } from "@playwright/test";
import { blockAi, settle } from "./support";

// Audit CR-24 / R-34: the sign-in dialog is a real dialog, keyboard-only. Nothing here submits a
// credential or asks for a code: the steps are checked, not completed.
test.describe("the sign-in dialog, by keyboard", () => {
  test.beforeEach(async ({ page }) => {
    await blockAi(page);
    await page.route("**/api/auth/**", (route) => route.abort());
    await page.route("**/auth/v1/**", (route) => route.abort());
  });

  test("the first Tab stop is the skip link, and it moves focus to <main>", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  });

  test("opens with focus in Email, keeps Tab inside, closes on Escape and hands focus back", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const opener = page.getByRole("button", { name: /^sign in$/i }).first();
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Sign in or sign up" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Email")).toBeFocused();

    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
    }
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("Continue stays disabled until there is an email and a 6+ character password", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await page.getByRole("button", { name: /^sign in$/i }).first().click();
    const dialog = page.getByRole("dialog");
    const next = dialog.getByRole("button", { name: "Continue", exact: true });
    await expect(next).toBeDisabled();
    await dialog.getByLabel("Email").fill("someone@seed.invalid");
    await dialog.getByLabel("Password").fill("abc");
    await expect(next).toBeDisabled();
    await dialog.getByLabel("Password").fill("abcdef");
    await expect(next).toBeEnabled();
  });

  test("the panel is frosted, and the code step is exactly as tall as the first step", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await page.getByRole("button", { name: /^sign in$/i }).first().click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    const first = await panel.evaluate((el) => ({ height: Math.round(el.getBoundingClientRect().height), blur: getComputedStyle(el).backdropFilter }));
    expect(first.blur).toMatch(/blur\(/);

    // The code step, opened the way the OAuth return opens it.
    await page.goto("/?authStep=otp");
    await settle(page);
    const second = await page.getByRole("dialog").evaluate((el) => Math.round(el.getBoundingClientRect().height));
    expect(second).toBe(first.height);
  });
});
