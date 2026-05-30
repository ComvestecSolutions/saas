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
 *   - /desk/tenants, /desk/audit, /desk/config, /desk/flag,
 *     /desk/access, /desk/billing, /desk/branding,
 *     /desk/retention, /desk/webhook, /desk/runs, /desk/vendors,
 *     /desk/notify, /desk/support
 *   - /admin/profile, /admin/members, /admin/workspaces,
 *     /admin/tokens, /admin/audit
 */
const visualRoutes = [
  "/desk",
  "/desk/tenants",
  "/desk/audit",
  "/desk/config",
  "/desk/flag",
  "/desk/access",
  "/desk/billing",
  "/desk/branding",
  "/desk/retention",
  "/desk/webhook",
  "/desk/runs",
  "/desk/vendors",
  "/desk/notify",
  "/desk/support",
  "/admin/profile",
  "/admin/members",
  "/admin/workspaces",
  "/admin/tokens",
  "/admin/audit",
] as const;
const supportVisualNow = Date.parse("2026-05-25T09:00:00.000Z");
const shellVisualMaskSelectors = [
  "[data-pattern='pulse-ribbon']",
  "[data-pattern='edge-rail']",
  "[data-testid='context-spine-actor-card']",
  "[data-testid='context-spine-route-card']",
  "[data-testid='context-spine-capability-posture-card']",
  "[data-testid='context-spine-saved-views']",
] as const;

const resolveVisualMaskSelectors = (route: (typeof visualRoutes)[number]) => {
  if (route === "/desk") {
    return [
      ...shellVisualMaskSelectors,
      ".ops-mission-signal-band",
      ".ops-mission-digest-grid",
      ".ops-mission-grid",
      ".ops-mission-kpis",
      ".ops-alert-list",
      ".ops-activity-list",
      ".ops-vendor-grid",
      ".ops-card-head__count",
      "[aria-label='Posture status']",
      "[data-testid='desk-center-cache-pill']",
      "[data-testid='desk-center-partial-failures']",
    ] as const;
  }

  if (route === "/desk/audit") {
    return [
      ...shellVisualMaskSelectors,
      "[data-testid='audit-log-v2-posture']",
      "section[aria-label='Focused investigation'] [data-pane-body]",
      "[data-testid='audit-log-v2-correlation-clusters']",
      "[data-testid='audit-log-v2-rows']",
    ] as const;
  }

  if (route === "/desk/access") {
    return [
      ...shellVisualMaskSelectors,
      "[data-testid='access-control-list-ready'] > .ops-bento",
      "[data-testid='access-control-list-ready'] .ops-summary-grid",
      "[data-testid='access-control-operators-table'] tbody",
      "[data-testid='access-control-tuples-table'] tbody",
      "[data-testid='access-control-profiles-table'] tbody",
      "[data-testid='access-control-scopes-table'] tbody",
      "[data-testid='access-control-list-ready'] .ops-card-head__count",
    ] as const;
  }

  if (route === "/desk/billing") {
    return [
      ...shellVisualMaskSelectors,
      "[data-testid='billing-list-posture']",
      "[data-testid='billing-list-target-set']",
      "[data-testid='billing-list-table'] tbody",
      "[data-testid='billing-list-ready'] .ops-card-head__count",
    ] as const;
  }

  if (route === "/desk/branding") {
    return [
      ...shellVisualMaskSelectors,
      "[data-testid='branding-list-posture']",
      "[data-testid='branding-list-target-set']",
      "[data-testid='branding-list-table'] tbody",
      "[data-testid='branding-list-ready'] .ops-card-head__count",
    ] as const;
  }

  if (route === "/desk/retention") {
    return [
      ...shellVisualMaskSelectors,
      "[data-testid='retention-list-posture']",
      "[data-testid='retention-list-policies-table'] tbody",
      "[data-testid='retention-list-holds-table'] tbody",
      "[data-testid='retention-list-ready'] .ops-card-head__count",
    ] as const;
  }

  if (route === "/desk/webhook") {
    return [
      ...shellVisualMaskSelectors,
      "[data-testid='webhook-list-posture']",
      "[data-testid='webhook-list-endpoints-table'] tbody",
      "[data-testid='webhook-list-deliveries-table'] tbody",
      "[data-testid='webhook-list-ready'] .ops-card-head__count",
    ] as const;
  }

  if (route === "/desk/runs") {
    return [
      ...shellVisualMaskSelectors,
      "[data-testid='workflow-runs-list-posture']",
      "[data-testid='workflow-runs-list-entries-table'] tbody",
      "[data-testid='workflow-runs-list-partial-failures']",
      "[data-testid='workflow-runs-list-ready'] .ops-card-head__count",
    ] as const;
  }

  if (route === "/desk/support") {
    return [
      ...shellVisualMaskSelectors,
      "[data-testid='support-cases-posture']",
      "section:has-text('Attention queue')",
      "section:has-text('Focused incident')",
      "[data-testid='support-cases-ready'] tbody",
    ] as const;
  }

  if (route === "/admin/audit") {
    return [
      ...shellVisualMaskSelectors,
      "[data-testid='admin-audit-kpis']",
      "[data-testid='admin-audit-focus']",
      "[data-testid='admin-audit-table'] tbody",
      "[data-testid='admin-audit-ready'] .ops-card-head__count",
    ] as const;
  }

  if (route === "/admin/tokens") {
    return [
      ...shellVisualMaskSelectors,
      "[data-testid='admin-tokens-kpis']",
      "[data-testid='admin-tokens-table'] tbody",
      "[data-testid='admin-tokens-ready'] .ops-card-head__count",
    ] as const;
  }

  return shellVisualMaskSelectors;
};

for (const route of visualRoutes) {
  test(`visual baseline: ${route}`, async ({
    signedInPage: page,
    trustedSession,
  }) => {
    if (route === "/desk/support") {
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
    const fullPage = route !== "/desk";
    await expect(page).toHaveScreenshot(`${route.replaceAll("/", "_")}.png`, {
      fullPage,
      mask,
    });
  });
}
