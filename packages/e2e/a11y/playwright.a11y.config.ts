import { defineConfig, devices } from "@playwright/test";

/**
 * axe a11y configuration (admin-app spec §11 Phase 8d + §10 layer 6).
 *
 * One audit per primary route. WCAG 2.1 AA; serious + critical
 * violations fail the gate. The `a11y-ignored` allowlist is owned
 * by the spec under each surface and justified inline in
 * `a11y-allowlist.ts`.
 *
 * The audit never starts a local dev server — a11y baselines require
 * the same stable origin the visual baselines pin against.
 */
const baseURL = process.env["ADMIN_E2E_BASE_URL"] ?? "http://127.0.0.1:3004";

export default defineConfig({
  testDir: ".",
  testMatch: ["**/*.spec.ts"],
  fullyParallel: true,
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
