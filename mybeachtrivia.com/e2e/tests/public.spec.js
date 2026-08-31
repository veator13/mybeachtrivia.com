import { test, expect } from "@playwright/test";

/** Checks that need no login. */

test("login page renders its form", async ({ page }) => {
  await page.goto("/login.html");
  await expect(page.locator("#loginForm")).toBeVisible();
  await expect(page.locator("#username")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
  await expect(page.locator("#loginButton")).toBeVisible();
});

test("bt-head.js is served no-cache and injects the nav tags", async ({ request }) => {
  const res = await request.get("/beachTriviaPages/js/bt-head.js");
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["cache-control"]).toContain("no-cache");
  const body = await res.text();
  expect(body).toContain("bt-nav.css?v=");
  expect(body).toContain("bt-nav.js?v=");
});

test("every dashboard page uses the shared bt-head.js include", async ({ request }) => {
  const pages = [
    "/beachTriviaPages/dashboards/host/",
    "/beachTriviaPages/dashboards/host/employee-calendar/",
    "/beachTriviaPages/dashboards/host/time-off/",
    "/beachTriviaPages/dashboards/host/scoresheet/",
    "/beachTriviaPages/dashboards/admin/calendar/",
    "/beachTriviaPages/dashboards/admin/requests/",
    "/beachTriviaPages/dashboards/admin/index.html",
  ];
  for (const p of pages) {
    const html = await (await request.get(p)).text();
    const noComments = html.replace(/<!--[\s\S]*?-->/g, "");
    expect(html, `${p} includes bt-head.js`).toContain("/beachTriviaPages/js/bt-head.js");
    expect(noComments, `${p} has no hand-written bt-nav tag`).not.toMatch(/bt-nav\.(css|js)"/);
  }
});
