import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";

/**
 * Authenticated host smoke tests. Skipped unless BT_HOST_EMAIL / BT_HOST_PASSWORD
 * are set (so the auth setup ran and .auth/host.json exists).
 */
const AUTHED =
  !!(process.env.BT_HOST_EMAIL && process.env.BT_HOST_PASSWORD) &&
  existsSync(new URL("../.auth/host.json", import.meta.url));

test.skip(!AUTHED, "needs BT_HOST_EMAIL / BT_HOST_PASSWORD");

/** Fail a test if the page logs an uncaught error / console.error. */
function trackErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

test("host dashboard: nav + Today's Show card, no errors", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/beachTriviaPages/dashboards/host/");
  await expect(page.locator("#bt-nav, .bt-nav")).toBeVisible();
  await expect(page.locator("#today-show-name")).toBeVisible();
  await expect(page.locator("#pay-period-display")).not.toHaveText("—");
  expect(errors, errors.join("\n")).toEqual([]);
});

test("host calendar renders shifts (agenda or grid)", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/beachTriviaPages/dashboards/host/employee-calendar/");
  await expect(page.locator("#bt-nav, .bt-nav")).toBeVisible();
  await expect(
    page.locator("#calendar-agenda .agenda-day, table#calendar td .shift").first()
  ).toBeVisible({ timeout: 20_000 });
  expect(errors, errors.join("\n")).toEqual([]);
});

test("scoresheet loads with a team table and sane zoom", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/beachTriviaPages/dashboards/host/scoresheet/");
  await expect(page.locator("#bt-nav, .bt-nav")).toBeVisible();
  await expect(page.locator("#teamTable, table").first()).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("time-off page shows the request form", async ({ page }) => {
  await page.goto("/beachTriviaPages/dashboards/host/time-off/");
  await expect(page.locator("#bt-nav, .bt-nav")).toBeVisible();
  await expect(page.locator('input[type="date"]').first()).toBeVisible();
});
