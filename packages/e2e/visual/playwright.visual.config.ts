import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression configuration (admin-app spec §11 Phase 8c +
 * §10 layer 5). Three viewport profiles per route. Baselines live
 * under `packages/e2e/visual/__screenshots__/` and are CI-stable
 * when the platform target is pinned via `ADMIN_E2E_BASE_URL`.
 *
 * The visual project never starts a local dev server — visual
 * baselines require a stable deterministic origin (CI / staging),
 * so when no base URL is provided the suite is left to its
 * fixture-level skip behavior.
 */
const baseURL = process.env["ADMIN_E2E_BASE_URL"] ?? "http://127.0.0.1:3004";
const baseUrlHostname = new URL(baseURL).hostname;
const usesLocalAdminTarget =
  baseUrlHostname === "127.0.0.1" || baseUrlHostname === "localhost";

export default defineConfig({
  testDir: ".",
  testMatch: ["**/*.spec.ts"],
  snapshotDir: "./__screenshots__",
  fullyParallel: true,
  ...(usesLocalAdminTarget ? { timeout: 120_000, workers: 1 } : {}),
  forbidOnly: !!process.env["CI"],
  reporter: process.env["CI"]
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    },
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
      },
    },
  ],
});
