/**
 * Visual regression suite — captures full-page screenshots of the key routes
 * and diffs them against committed baselines under `e2e/visual.spec.ts-snapshots/`.
 *
 * Updating baselines (intentional UI changes):
 *   npx playwright test --update-snapshots
 *
 * Each test masks the live timestamp areas so clock drift doesn't cause
 * spurious diffs (the dashboard / automations pages render `Xm ago` strings).
 */

import { test, expect } from "@playwright/test";

// Hide elements whose content depends on wall clock so snapshots stay stable.
const TIME_SENSITIVE_SELECTORS = [
  "[data-testid='ago']",
  ".pg-info", // pagination shows totals which can drift if seed grows
];

async function maskTimeSensitive(page: Awaited<ReturnType<typeof test.step>> | any) {
  for (const sel of TIME_SENSITIVE_SELECTORS) {
    const handle = page.locator?.(sel);
    if (handle) {
      // Force opacity 0 so layout stays the same but content doesn't differ
      await page.addStyleTag({ content: `${sel} { opacity: 0 !important; }` });
    }
  }
}

test.describe("visual regression — key routes", () => {
  test("dashboard /", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await maskTimeSensitive(page);
    await expect(page).toHaveScreenshot("dashboard.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("bookings /bookings", async ({ page }) => {
    await page.goto("/bookings");
    await page.waitForLoadState("networkidle");
    await maskTimeSensitive(page);
    await expect(page).toHaveScreenshot("bookings.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  // Skipped: the revenue page is a large time-series chart over a window that
  // ends "today", so its bars/axis re-bucket every day — a baseline drifts
  // ~11% within 24h, far above the 0.5% tolerance, and the change isn't
  // maskable (it's the SVG chart itself, not timestamp text). Re-enabling this
  // would require freezing the app's clock for visual tests (deterministic
  // "now" + date-anchored seed). The other four routes give stable coverage.
  test.skip("revenue /revenue?range=6M", async ({ page }) => {
    await page.goto("/revenue?range=6M");
    await page.waitForLoadState("networkidle");
    await maskTimeSensitive(page);
    await expect(page).toHaveScreenshot("revenue.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("automations /automations", async ({ page }) => {
    await page.goto("/automations");
    await page.waitForLoadState("networkidle");
    await maskTimeSensitive(page);
    await expect(page).toHaveScreenshot("automations.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("settings /settings", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await maskTimeSensitive(page);
    await expect(page).toHaveScreenshot("settings.png", {
      fullPage: true,
      animations: "disabled",
    });
  });
});
