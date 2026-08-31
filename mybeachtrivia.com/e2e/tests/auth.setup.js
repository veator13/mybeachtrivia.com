import { test as setup, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const STORAGE = ".auth/host.json";

/**
 * Logs in once with the burner host account (BT_HOST_EMAIL / BT_HOST_PASSWORD)
 * and saves the browser session so the smoke specs don't each re-login.
 */
setup("authenticate as host", async ({ page }) => {
  const email = process.env.BT_HOST_EMAIL;
  const password = process.env.BT_HOST_PASSWORD;
  expect(email, "set BT_HOST_EMAIL").toBeTruthy();
  expect(password, "set BT_HOST_PASSWORD").toBeTruthy();

  await page.goto("/login.html");
  await page.selectOption("#roleSelect", "host");
  await page.fill("#username", email);
  await page.fill("#password", password);
  await page.click("#loginButton");

  // Land on some host dashboard page (not back on login).
  await page.waitForURL(/\/dashboards\/host\//, { timeout: 20_000 });
  await expect(page.locator("#bt-nav, .bt-nav")).toBeVisible();

  mkdirSync(".auth", { recursive: true });
  await page.context().storageState({ path: STORAGE });
});
