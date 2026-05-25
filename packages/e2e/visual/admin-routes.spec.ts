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
const supportVisualNow = Date.parse("2026-05-25T09:00:00.000Z");

const resolveVisualMaskSelectors = (route: (typeof visualRoutes)[number]) => {
  if (route === "/admin/audit") {
    return [
      "[data-testid='admin-audit-kpis']",
      "[data-testid='admin-audit-focus']",
      "[data-testid='admin-audit-table'] tbody",
      "[data-testid='admin-audit-ready'] .ops-card-head__count",
    ] as const;
  }

  if (route === "/admin/tokens") {
    return [
      "[data-testid='admin-tokens-kpis']",
      "[data-testid='admin-tokens-table'] tbody",
      "[data-testid='admin-tokens-ready'] .ops-card-head__count",
    ] as const;
  }

  return [];
};

for (const route of visualRoutes) {
  test(`visual baseline: ${route}`, async ({
    signedInPage: page,
    trustedSession,
  }) => {
    if (route === "/r/support") {
      await page.addInitScript(
        ({ now }) => {
          Date.now = () => now;
        },
        { now: supportVisualNow },
      );
    }
    await page.goto(`${trustedSession.baseURL}${route}`);
    const mask = resolveVisualMaskSelectors(route).map((selector) =>
      page.locator(selector),
    );
    await expect(page).toHaveScreenshot(`${route.replaceAll("/", "_")}.png`, {
      fullPage: true,
      mask,
    });
  });
}
