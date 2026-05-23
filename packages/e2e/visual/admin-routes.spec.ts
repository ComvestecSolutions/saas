import { adminTest as test, expect } from "../tests/fixtures/trusted-session";

/**
 * Visual regression baselines (admin-app spec §11 Phase 8c).
 *
 * One screenshot per primary route per device class (desktop /
 * tablet / mobile, projects configured in playwright.visual.config.ts).
 * Baselines live under `__screenshots__/`. The trusted-session
 * fixture skips when env values are absent, so this file does not
 * synthesize a credential and CI fails loudly only when a real
 * baseline diverges against a real platform target.
 *
 * Route coverage matches the admin-app router under §8 of the spec:
 *   - /desk
 *   - /r/tenants, /r/audit, /r/config, /r/flag, /r/access,
 *     /r/billing, /r/branding, /r/retention, /r/webhook, /r/runs,
 *     /r/vendors, /r/notify, /r/support
 *   - /admin/profile, /admin/members, /admin/workspaces,
 *     /admin/tokens, /admin/audit
 */
const visualRoutes = [
  "/desk",
  "/r/tenants",
  "/r/audit",
  "/r/config",
  "/r/flag",
  "/r/access",
  "/r/billing",
  "/r/branding",
  "/r/retention",
  "/r/webhook",
  "/r/runs",
  "/r/vendors",
  "/r/notify",
  "/r/support",
  "/admin/profile",
  "/admin/members",
  "/admin/workspaces",
  "/admin/tokens",
  "/admin/audit",
] as const;

for (const route of visualRoutes) {
  test(`visual baseline: ${route}`, async ({
    signedInPage: page,
    trustedSession,
  }) => {
    await page.goto(`${trustedSession.baseURL}${route}`);
    await expect(page).toHaveScreenshot(`${route.replaceAll("/", "_")}.png`, {
      fullPage: true,
    });
  });
}
