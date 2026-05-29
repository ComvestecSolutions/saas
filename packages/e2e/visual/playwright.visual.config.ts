import { defineConfig, devices } from "@playwright/test";
import {
  resolveAdminE2EBaseUrl,
  shouldUseLocalAdminWebServer,
} from "../admin-e2e-environment";

/**
 * Visual regression configuration (admin-app spec §11 Phase 8c +
 * §10 layer 5). Three viewport profiles per route. Baselines live
 * under `packages/e2e/visual/__screenshots__/` and are CI-stable
 * when the platform target is pinned via `ADMIN_E2E_BASE_URL`.
 *
 * Remote/staging baselines stay pinned to the configured target. When
 * the resolved target stays on localhost/127.0.0.1, the config reuses
 * or starts the repo-owned admin dev server so the local wrapper stays
 * rerunnable without separate manual startup.
 */
const repositoryRootDirectory = decodeURIComponent(
  new URL("../../../", import.meta.url).pathname.replace(
    /^\/([A-Za-z]:)/,
    "$1",
  ),
);

const baseURL = resolveAdminE2EBaseUrl();
const usesLocalAdminTarget = shouldUseLocalAdminWebServer();

export default defineConfig({
  testDir: ".",
  testMatch: ["**/*.spec.ts"],
  snapshotDir: "./__screenshots__",
  fullyParallel: true,
  ...(usesLocalAdminTarget ? { timeout: 120_000, workers: 1 } : {}),
  ...(usesLocalAdminTarget
    ? {
        webServer: {
          command: "bun run --cwd apps/admin-app dev -- --host 127.0.0.1",
          cwd: repositoryRootDirectory,
          url: baseURL,
          reuseExistingServer: !process.env["CI"],
          timeout: 120_000,
        },
      }
    : {}),
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
