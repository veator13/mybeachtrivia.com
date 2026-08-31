import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

/**
 * Smoke tests for mybeachtrivia.com.
 *
 * Target URL:  BT_BASE_URL env var, else the staging preview channel.
 * Auth:        set BT_HOST_EMAIL / BT_HOST_PASSWORD (the burner host account)
 *              and the "auth" setup project logs in once and saves the session
 *              to .auth/host.json; specs that need a login reuse it. Without
 *              those vars the authed specs are skipped and only the public
 *              ones (login page, headers) run.
 */
const BASE_URL =
  process.env.BT_BASE_URL ||
  "https://beach-trivia-website--staging-dhujjmqc.web.app";

const HAVE_CREDS = !!(process.env.BT_HOST_EMAIL && process.env.BT_HOST_PASSWORD);
const STORAGE = ".auth/host.json";

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    ...(HAVE_CREDS
      ? [{ name: "auth", testMatch: /auth\.setup\.js/ }]
      : []),
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(HAVE_CREDS && existsSync(new URL(STORAGE, import.meta.url))
          ? { storageState: STORAGE }
          : {}),
      },
      ...(HAVE_CREDS ? { dependencies: ["auth"] } : {}),
    },
  ],
});
