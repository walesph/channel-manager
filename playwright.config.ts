import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression suite. Tests live in `e2e/` (kept separate from `tests/`
 * which holds Vitest unit/integration suites).
 *
 * `webServer` boots `next dev` on port 3000; the `reuseExistingServer` flag
 * lets a manually-started preview also satisfy the test runner so iterating
 * locally doesn't kill your dev preview between runs.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e-results",
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Force a stable viewport so screenshots are deterministic across machines.
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
  expect: {
    // Allow up to 0.5% pixel diff to absorb anti-aliasing across machines/CI.
    toHaveScreenshot: { maxDiffPixelRatio: 0.005 },
  },
});
