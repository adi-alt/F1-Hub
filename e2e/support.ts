import { readFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import { sealData } from "iron-session";

type Seeded = { id: string; email: string; role: string | null };
export type SeedUser = "alex" | "blair" | "casey" | "dana";

/** The routes the audit's acceptance criteria name, with a seeded 2026 race page and a community. */
export const ROUTES = ["/", "/season?year=2026", "/race?year=2026&race=bahrain-grand-prix", "/groups", "/circuits", "/archive", "/profile"];

/** A browser context that is signed in as a seeded user: the app's own iron-session cookie, sealed with
 * this run's SESSION_SECRET. */
export async function signInAs(context: BrowserContext, who: SeedUser) {
  const users = JSON.parse(readFileSync(path.join(__dirname, ".users.json"), "utf8")) as Seeded[];
  const user = users.find((u) => u.email === `seed-${who}@seed.invalid`);
  if (!user) throw new Error(`no seeded user ${who}`);
  const value = await sealData({ uid: user.id, email: user.email, displayName: who, photoURL: null, role: user.role ?? "user" }, { password: process.env.SESSION_SECRET! });
  await context.addCookies([{ name: "f1hub_session", value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
}

/** No test may trigger a model call. */
export async function blockAi(page: Page) {
  await page.route("**/api/ai/**", (route) => route.abort());
}

/** Lets a page settle: network quiet, then a beat for effects. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(800);
}
