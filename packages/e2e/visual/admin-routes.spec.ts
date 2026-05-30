import { type Page } from "@playwright/test";
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
 *   - /desk/tenants, /desk/tenant/org_demo?scope=organization,
 *     /desk/audit, /desk/config, /desk/flag,
 *     /desk/access, /desk/billing, /desk/branding,
 *     /desk/retention, /desk/webhook, /desk/runs, /desk/vendors,
 *     /desk/vendor/polar, /desk/notify, /desk/support,
 *     /desk/search?q=operator
 *   - /repair-operations
 *   - /admin/profile, /admin/members, /admin/workspaces,
 *     /admin/tokens, /admin/audit
 */
const visualRoutes = [
  "/desk",
  "/desk/tenants",
  "/desk/tenant/org_demo?scope=organization",
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
  "/desk/vendor/polar",
  "/desk/notify",
  "/desk/support",
  "/desk/search?q=operator",
  "/repair-operations",
  "/admin/profile",
  "/admin/members",
  "/admin/workspaces",
  "/admin/tokens",
  "/admin/audit",
] as const;
const tenantWorkspaceRoute =
  "/desk/tenant/org_demo?scope=organization" as const;
const hydrationMismatchPattern =
  /hydration failed because the server rendered text didn't match the client|hydration mismatch|did not match what was rendered on the server/i;
const shellVisualMaskSelectors = [
  "[data-pattern='pulse-ribbon']",
  "[data-pattern='edge-rail']",
  "[data-testid='context-spine-actor-card']",
  "[data-testid='context-spine-route-card']",
  "[data-testid='context-spine-capability-posture-card']",
  "[data-testid='context-spine-saved-views']",
] as const;
const tenantWorkspaceChromeMaskSelectors = [
  ...shellVisualMaskSelectors,
  "[data-testid='tenant-workspace-v2-snapshot-meta']",
  "[data-testid='tenant-workspace-v2-kpis']",
  "[data-testid='tenant-workspace-v2-posture-signals']",
  "[data-testid='tenant-workspace-v2-posture-meta']",
  "[data-testid='tenant-workspace-v2-focus']",
] as const;
const tenantWorkspaceOverviewMaskSelectors = [
  ...tenantWorkspaceChromeMaskSelectors,
  "[data-testid='tenant-workspace-v2-overview-kpis']",
  "[data-testid='tenant-workspace-v2-overview-meta']",
  "[data-testid='tenant-workspace-v2-usage-grid']",
  "[data-testid='tenant-workspace-v2-overview-approvals'] tbody",
  "[data-testid='tenant-workspace-v2-overview-activity']",
] as const;
const tenantWorkspaceMembersMaskSelectors = [
  ...tenantWorkspaceChromeMaskSelectors,
  "[data-testid='tenant-workspace-v2-members-kpis']",
  "[data-testid='tenant-workspace-v2-members-list-region']",
] as const;
const tenantWorkspaceDangerMaskSelectors = [
  ...tenantWorkspaceChromeMaskSelectors,
  "[data-testid='tenant-workspace-v2-danger-checklist']",
] as const;
const billingPopulatedRoute = `/desk/billing?tenants=${encodeURIComponent(
  JSON.stringify([{ scope: "organization", scopeId: "org_demo" }]),
)}&selectedTenantId=org_demo` as const;
const billingRouteMaskSelectors = [
  ...shellVisualMaskSelectors,
  "[data-testid='billing-list-posture']",
  "[data-testid='billing-list-target-set']",
  "[data-testid='billing-list-table'] tbody",
  "[data-testid='billing-list-ready'] .ops-card-head__count",
] as const;
const billingPopulatedMaskSelectors = [
  ...billingRouteMaskSelectors,
  "[data-testid='billing-list-focus-summary']",
] as const;
const workflowRunsRouteMaskSelectors = [
  ...shellVisualMaskSelectors,
  "[data-testid='workflow-runs-list-posture']",
  "[data-testid='workflow-runs-list-focus-summary'] .ops-cell-stack__title",
  "[data-testid='workflow-runs-list-focus-summary'] .ops-text-muted",
  "[data-testid='workflow-runs-list-focus-summary'] .ops-note",
  "[data-testid='workflow-runs-list-focus-summary'] .ops-detail-grid",
  "[data-testid='workflow-runs-list-review'] .ops-detail-grid",
  "[data-testid='workflow-runs-list-review-items']",
  "[data-testid='workflow-runs-list-partial-failures-empty']",
  "[data-testid='workflow-runs-list-entries-table'] tbody",
  "[data-testid='workflow-runs-list-ready'] .ops-card-head__count",
] as const;
const workflowRunsFocusMaskSelectors = [
  ...shellVisualMaskSelectors,
  "[data-testid='workflow-runs-list-focus-summary'] .ops-cell-stack__title",
  "[data-testid='workflow-runs-list-focus-summary'] .ops-text-muted",
  "[data-testid='workflow-runs-list-focus-summary'] .ops-note",
  "[data-testid='workflow-runs-list-focus-summary'] .ops-detail-grid",
  "[data-testid='workflow-runs-list-review'] .ops-detail-grid",
  "[data-testid='workflow-runs-list-review-items']",
  "[data-testid='workflow-runs-list-partial-failures-empty']",
  "[data-testid='workflow-runs-list-ready'] .ops-card-head__count",
] as const;
const notifyRouteMaskSelectors = [
  ...shellVisualMaskSelectors,
  "[data-testid='notify-list-posture']",
  "[data-testid='notify-list-focus-summary'] .ops-cell-stack__title",
  "[data-testid='notify-list-focus-summary'] .ops-text-muted",
  "[data-testid='notify-list-focus-summary'] .ops-note",
  "[data-testid='notify-list-focus-summary'] .ops-detail-grid",
  "[data-testid='notify-list-review'] .ops-detail-grid",
  "[data-testid='notify-list-review-items']",
  "[data-testid='notify-list-partial-failures-empty']",
  "[data-testid='notify-list-action-success']",
  "[data-testid='notify-list-action-error']",
  "[data-testid='notify-list-entries-table'] tbody",
  "[data-testid='notify-list-ready'] .ops-card-head__count",
] as const;
const notifyFocusMaskSelectors = [
  ...shellVisualMaskSelectors,
  "[data-testid='notify-list-focus-summary'] .ops-cell-stack__title",
  "[data-testid='notify-list-focus-summary'] .ops-text-muted",
  "[data-testid='notify-list-focus-summary'] .ops-note",
  "[data-testid='notify-list-focus-summary'] .ops-detail-grid",
  "[data-testid='notify-list-review'] .ops-detail-grid",
  "[data-testid='notify-list-review-items']",
  "[data-testid='notify-list-partial-failures-empty']",
  "[data-testid='notify-list-ready'] .ops-card-head__count",
] as const;
const adminTokensRouteMaskSelectors = [
  ...shellVisualMaskSelectors,
  "[data-testid='admin-tokens-focus-summary'] .ops-cell-stack__title",
  "[data-testid='admin-tokens-focus-summary'] .ops-text-muted",
  "[data-testid='admin-tokens-focus-summary'] .ops-note",
  "[data-testid='admin-tokens-focus-summary'] .ops-detail-grid",
  "[data-testid='admin-tokens-review'] .ops-detail-grid",
  "[data-testid='admin-tokens-owner-note']",
  "[data-testid='admin-tokens-action-success']",
  "[data-testid='admin-tokens-action-error']",
  "[data-testid='admin-tokens-table'] tbody",
  "[data-testid='admin-tokens-ready'] .ops-card-head__count",
] as const;
const adminTokensFocusMaskSelectors = [
  ...shellVisualMaskSelectors,
  "[data-testid='admin-tokens-focus-summary'] .ops-cell-stack__title",
  "[data-testid='admin-tokens-focus-summary'] .ops-text-muted",
  "[data-testid='admin-tokens-focus-summary'] .ops-note",
  "[data-testid='admin-tokens-focus-summary'] .ops-detail-grid",
  "[data-testid='admin-tokens-review'] .ops-detail-grid",
  "[data-testid='admin-tokens-owner-note']",
  "[data-testid='admin-tokens-ready'] .ops-card-head__count",
] as const;
const auditExplorerMaskSelectors = [
  ...shellVisualMaskSelectors,
  "[data-testid='audit-log-v2-posture']",
  "[data-testid='audit-log-v2-query-posture']",
  "[data-testid='audit-log-v2-focus']",
  "[data-testid='audit-log-v2-correlation-clusters']",
  "[data-testid='audit-log-v2-visible-count']",
  "[data-testid='audit-log-v2-rows']",
] as const;

const deskMenuVisualMaskSelectors = [
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
  "[data-testid='context-spine-actor-card']",
  "[data-testid='context-spine-route-card']",
  "[data-testid='context-spine-capability-posture-card']",
  "[data-testid='context-spine-saved-views']",
] as const;

const expectedDeviceClassByProject = {
  desktop: "desktop",
  tablet: "tablet",
  mobile: "mobile",
} as const;

const waitForShellStability = async (
  page: Page,
  projectName: string,
): Promise<void> => {
  await expect(page.locator("html")).toHaveAttribute(
    "data-admin-shell-hydrated",
    "true",
    {
      timeout: 15_000,
    },
  );
  const expectedDeviceClass =
    expectedDeviceClassByProject[
      projectName as keyof typeof expectedDeviceClassByProject
    ];

  if (expectedDeviceClass !== undefined) {
    await expect(page.locator("[data-pattern='app-desk']")).toHaveAttribute(
      "data-device-class",
      expectedDeviceClass,
      {
        timeout: 15_000,
      },
    );
  }
};

const createHydrationMismatchTracker = (page: Page) => {
  const mismatches: string[] = [];
  const trackMessage = (source: "console" | "pageerror", message: string) => {
    if (hydrationMismatchPattern.test(message)) {
      mismatches.push(`${source}: ${message}`);
    }
  };

  page.on("console", (message) => {
    if (message.type() === "error") {
      trackMessage("console", message.text());
    }
  });
  page.on("pageerror", (error) => {
    trackMessage("pageerror", error.message);
  });

  return mismatches;
};

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
    return auditExplorerMaskSelectors;
  }

  if (route === tenantWorkspaceRoute) {
    return tenantWorkspaceOverviewMaskSelectors;
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
    return billingRouteMaskSelectors;
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
    return workflowRunsRouteMaskSelectors;
  }

  if (route === "/desk/notify") {
    return notifyRouteMaskSelectors;
  }

  if (route === "/admin/tokens") {
    return adminTokensRouteMaskSelectors;
  }

  if (route === "/desk/vendor/polar") {
    return [
      ...shellVisualMaskSelectors,
      "[data-testid='vendor-detail-kpis']",
      "[data-testid='vendor-detail-summary']",
      "[data-testid='vendor-detail-history']",
      "[data-testid='vendor-detail-follow-ups']",
      "[data-testid='vendor-detail-partial-failure']",
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

  if (route === "/repair-operations") {
    return [
      ...shellVisualMaskSelectors,
      "[data-testid='repair-operations-ready'] .ops-card-head__count",
      "[data-testid='repair-operations-table'] tbody",
    ] as const;
  }

  if (route.startsWith("/desk/search")) {
    return [
      ...shellVisualMaskSelectors,
      "[data-testid='admin-search-kpis']",
      "[data-testid='admin-search-results-table'] tbody",
      "[data-testid='admin-search-query-posture']",
      "[data-testid='admin-search-facet-breakdown']",
      "[data-testid='admin-search-health-panel']",
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

  return shellVisualMaskSelectors;
};

const waitForTenantWorkspaceReady = async (
  page: Page,
  projectName: string,
): Promise<void> => {
  await waitForShellStability(page, projectName);
  await expect(
    page.locator("[data-testid='tenant-workspace-v2-ready']"),
  ).toBeVisible();
};

for (const route of visualRoutes) {
  test(`visual baseline: ${route}`, async ({
    signedInPage: page,
    trustedSession,
  }, testInfo) => {
    const hydrationMismatches = createHydrationMismatchTracker(page);
    await page.goto(`${trustedSession.baseURL}${route}`);
    if (route === tenantWorkspaceRoute) {
      await waitForTenantWorkspaceReady(page, testInfo.project.name);
    } else if (route === "/desk/runs") {
      await waitForShellStability(page, testInfo.project.name);
      await expect(
        page.locator("[data-testid='workflow-runs-list-ready']"),
      ).toBeVisible();
    } else if (route === "/desk/notify") {
      await waitForShellStability(page, testInfo.project.name);
      await expect(
        page.locator("[data-testid='notify-list-ready']"),
      ).toBeVisible();
    } else if (route === "/admin/tokens") {
      await waitForShellStability(page, testInfo.project.name);
      await expect(
        page.locator("[data-testid='admin-tokens-ready']"),
      ).toBeVisible();
    } else {
      await waitForShellStability(page, testInfo.project.name);
    }
    const mask = resolveVisualMaskSelectors(route).map((selector) =>
      page.locator(selector),
    );
    const fullPage = route !== "/desk";
    await expect(page).toHaveScreenshot(
      `${route.replace(/[/?=&]+/g, "_")}.png`,
      {
        fullPage,
        mask,
      },
    );
    expect(hydrationMismatches).toEqual([]);
  });
}

test("visual baseline: /desk surfaces menu", async ({
  signedInPage: page,
  trustedSession,
}, testInfo) => {
  const hydrationMismatches = createHydrationMismatchTracker(page);
  await page.goto(`${trustedSession.baseURL}/desk`);
  await waitForShellStability(page, testInfo.project.name);
  await page.getByRole("button", { name: "Open control surfaces" }).click();
  await expect(
    page.locator("[data-testid='desk-shell-navigation-menu']"),
  ).toBeVisible();
  const mask = deskMenuVisualMaskSelectors.map((selector) =>
    page.locator(selector),
  );
  await expect(page).toHaveScreenshot("desk_surfaces_menu.png", {
    fullPage: false,
    mask,
  });
  expect(hydrationMismatches).toEqual([]);
});

test("visual baseline: tenant workspace members tab", async ({
  signedInPage: page,
  trustedSession,
}, testInfo) => {
  const hydrationMismatches = createHydrationMismatchTracker(page);
  await page.goto(`${trustedSession.baseURL}${tenantWorkspaceRoute}`);
  await waitForTenantWorkspaceReady(page, testInfo.project.name);
  const tenantWorkspaceTabs = page.getByRole("tablist", {
    name: "Tenant workspace sections",
  });
  await expect(tenantWorkspaceTabs).toBeVisible();
  await tenantWorkspaceTabs
    .getByRole("tab", { name: /Members & Invitations/ })
    .click();
  await expect(
    page.locator("[data-testid='tenant-workspace-v2-members-pane']"),
  ).toBeVisible();
  const mask = tenantWorkspaceMembersMaskSelectors.map((selector) =>
    page.locator(selector),
  );
  await expect(page).toHaveScreenshot(
    "desk_tenant_org_demo_scope_organization_members.png",
    {
      fullPage: true,
      mask,
    },
  );
  expect(hydrationMismatches).toEqual([]);
});

test("visual baseline: tenant workspace danger zone tab", async ({
  signedInPage: page,
  trustedSession,
}, testInfo) => {
  const hydrationMismatches = createHydrationMismatchTracker(page);
  await page.goto(`${trustedSession.baseURL}${tenantWorkspaceRoute}`);
  await waitForTenantWorkspaceReady(page, testInfo.project.name);
  const tenantWorkspaceTabs = page.getByRole("tablist", {
    name: "Tenant workspace sections",
  });
  await expect(tenantWorkspaceTabs).toBeVisible();
  await tenantWorkspaceTabs.getByRole("tab", { name: /Danger Zone/ }).click();
  await expect(
    page.locator("[data-testid='tenant-workspace-v2-danger-pane']"),
  ).toBeVisible();
  const mask = tenantWorkspaceDangerMaskSelectors.map((selector) =>
    page.locator(selector),
  );
  await expect(page).toHaveScreenshot(
    "desk_tenant_org_demo_scope_organization_danger_zone.png",
    {
      fullPage: true,
      mask,
    },
  );
  expect(hydrationMismatches).toEqual([]);
});

test("visual baseline: audit explorer correlated pivot", async ({
  signedInPage: page,
  trustedSession,
}, testInfo) => {
  const hydrationMismatches = createHydrationMismatchTracker(page);
  await page.goto(`${trustedSession.baseURL}/desk/audit`);
  await waitForShellStability(page, testInfo.project.name);
  await expect(
    page.locator("[data-testid='audit-log-v2-ready']"),
  ).toBeVisible();
  const auditPivotTabs = page.getByRole("tablist", {
    name: "Audit review pivots",
  });
  await expect(auditPivotTabs).toBeVisible();
  const correlatedTab = auditPivotTabs.getByRole("tab", {
    name: /Correlated/,
  });
  await correlatedTab.click();
  await expect(correlatedTab).toHaveAttribute("aria-selected", "true");
  const mask = auditExplorerMaskSelectors.map((selector) =>
    page.locator(selector),
  );
  await expect(page).toHaveScreenshot("desk_audit_correlated_pivot.png", {
    fullPage: true,
    mask,
  });
  expect(hydrationMismatches).toEqual([]);
});

test("visual baseline: billing posture populated target set", async ({
  signedInPage: page,
  trustedSession,
}, testInfo) => {
  const hydrationMismatches = createHydrationMismatchTracker(page);
  await page.goto(`${trustedSession.baseURL}${billingPopulatedRoute}`);
  await waitForShellStability(page, testInfo.project.name);
  await expect(
    page.locator("[data-testid='billing-list-ready']"),
  ).toBeVisible();
  await expect(
    page.locator("[data-testid='billing-list-table']"),
  ).toBeVisible();
  const mask = billingPopulatedMaskSelectors.map((selector) =>
    page.locator(selector),
  );
  await expect(page).toHaveScreenshot("desk_billing_populated.png", {
    fullPage: true,
    mask,
  });
  expect(hydrationMismatches).toEqual([]);
});

test("visual baseline: workflow runs focus grid", async ({
  signedInPage: page,
  trustedSession,
}, testInfo) => {
  const hydrationMismatches = createHydrationMismatchTracker(page);
  await page.goto(`${trustedSession.baseURL}/desk/runs`);
  await waitForShellStability(page, testInfo.project.name);
  await expect(
    page.locator("[data-testid='workflow-runs-list-ready']"),
  ).toBeVisible();
  await expect(
    page.locator("[data-testid='workflow-runs-list-focus-grid']"),
  ).toBeVisible();
  const mask = workflowRunsFocusMaskSelectors.map((selector) =>
    page.locator(selector),
  );
  await expect(
    page.locator("[data-testid='workflow-runs-list-focus-grid']"),
  ).toHaveScreenshot("desk_runs_focus_grid.png", {
    mask,
  });
  expect(hydrationMismatches).toEqual([]);
});

test("visual baseline: notification center focus grid", async ({
  signedInPage: page,
  trustedSession,
}, testInfo) => {
  const hydrationMismatches = createHydrationMismatchTracker(page);
  await page.goto(`${trustedSession.baseURL}/desk/notify`);
  await waitForShellStability(page, testInfo.project.name);
  await expect(page.locator("[data-testid='notify-list-ready']")).toBeVisible();
  await expect(
    page.locator("[data-testid='notify-list-focus-grid']"),
  ).toBeVisible();
  const mask = notifyFocusMaskSelectors.map((selector) =>
    page.locator(selector),
  );
  await expect(
    page.locator("[data-testid='notify-list-focus-grid']"),
  ).toHaveScreenshot("desk_notify_focus_grid.png", {
    mask,
  });
  expect(hydrationMismatches).toEqual([]);
});

test("visual baseline: admin operator tokens focus grid", async ({
  signedInPage: page,
  trustedSession,
}, testInfo) => {
  const hydrationMismatches = createHydrationMismatchTracker(page);
  await page.goto(`${trustedSession.baseURL}/admin/tokens`);
  await waitForShellStability(page, testInfo.project.name);
  await expect(
    page.locator("[data-testid='admin-tokens-ready']"),
  ).toBeVisible();
  await expect(
    page.locator("[data-testid='admin-tokens-focus-grid']"),
  ).toBeVisible();
  const mask = adminTokensFocusMaskSelectors.map((selector) =>
    page.locator(selector),
  );
  await expect(
    page.locator("[data-testid='admin-tokens-focus-grid']"),
  ).toHaveScreenshot("admin_tokens_focus_grid.png", {
    mask,
  });
  expect(hydrationMismatches).toEqual([]);
});
