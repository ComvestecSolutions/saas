import { defineConfig, devices } from "@playwright/test";
import {
  resolveAdminE2EBaseUrl,
  shouldUseLocalAdminWebServer,
} from "../admin-e2e-environment";

/**
 * axe a11y configuration (admin-app spec §11 Phase 8d + §10 layer 6).
 *
 * One audit per primary route. WCAG 2.1 AA; serious + critical
 * violations fail the gate. The `a11y-ignored` allowlist is owned
 * by the spec under each surface and justified inline in
 * `a11y-allowlist.ts`.
 *
 * Remote/staging audits stay pinned to the configured target. When the
 * resolved target stays on localhost/127.0.0.1, the config reuses or
 * starts the repo-owned admin dev server so the local wrapper remains
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
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
});
