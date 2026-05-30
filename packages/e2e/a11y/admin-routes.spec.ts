import { type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { adminTest as test, expect } from "../tests/fixtures/trusted-session";
import { a11yIgnored } from "./a11y-allowlist";

/**
 * Axe-core a11y audit per primary route (admin-app spec §11 Phase
 * 8d + §10 layer 6), including the tenant workspace detail route and
 * nested tab states that require explicit interaction coverage.
 *
 * Standards: WCAG 2.1 AA. Serious + critical violations fail the
 * CI gate. Waived rules per route live in `a11y-allowlist.ts` and
 * MUST carry an inline justification.
 *
 * The audit reuses the trusted-session fixture; absent env values
 * skip the suite rather than synthesize local credentials.
 */
const a11yRoutes = [
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
const billingPopulatedRoute = `/desk/billing?tenants=${encodeURIComponent(
  JSON.stringify([{ scope: "organization", scopeId: "org_demo" }]),
)}&selectedTenantId=org_demo` as const;

const SEVERE_IMPACTS = new Set<string>(["serious", "critical"]);

const waitForAdminShellInteractivity = async (page: Page): Promise<void> => {
  await expect(page.locator("html")).toHaveAttribute(
    "data-admin-shell-hydrated",
    "true",
    {
      timeout: 15_000,
    },
  );
};

const collectSevereViolations = async (page: Page, route: string) => {
  const waivedRuleIds = new Set(
    a11yIgnored
      .filter((entry) => entry.route === route)
      .map((entry) => entry.ruleId),
  );

  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  return audit.violations.filter(
    (violation) =>
      SEVERE_IMPACTS.has(violation.impact ?? "") &&
      !waivedRuleIds.has(violation.id),
  );
};

for (const route of a11yRoutes) {
  test(`axe a11y audit: ${route}`, async ({
    signedInPage: page,
    trustedSession,
  }) => {
    await page.goto(`${trustedSession.baseURL}${route}`);
    if (route === tenantWorkspaceRoute) {
      await waitForAdminShellInteractivity(page);
      await expect(
        page.locator("[data-testid='tenant-workspace-v2-ready']"),
      ).toBeVisible();
    } else if (route === "/desk/runs") {
      await waitForAdminShellInteractivity(page);
      await expect(
        page.locator("[data-testid='workflow-runs-list-ready']"),
      ).toBeVisible();
      await expect(
        page.locator("[data-testid='workflow-runs-list-entries-table']"),
      ).toBeVisible();
    } else if (route === "/desk/notify") {
      await waitForAdminShellInteractivity(page);
      await expect(
        page.locator("[data-testid='notify-list-ready']"),
      ).toBeVisible();
      await expect(
        page.locator("[data-testid='notify-list-roster']"),
      ).toBeVisible();
    } else if (route === "/admin/tokens") {
      await waitForAdminShellInteractivity(page);
      await expect(
        page.locator("[data-testid='admin-tokens-ready']"),
      ).toBeVisible();
      await expect(
        page.locator("[data-testid='admin-tokens-roster']"),
      ).toBeVisible();
    }
    const severe = await collectSevereViolations(page, route);

    expect(
      severe,
      `Unwaived serious/critical a11y violations on ${route}: ${severe
        .map((violation) => `${violation.id} (${violation.impact})`)
        .join(", ")}`,
    ).toEqual([]);
  });
}

test("axe a11y audit: billing posture populated target set", async ({
  signedInPage: page,
  trustedSession,
}) => {
  await page.goto(`${trustedSession.baseURL}${billingPopulatedRoute}`);
  await waitForAdminShellInteractivity(page);
  await expect(
    page.locator("[data-testid='billing-list-ready']"),
  ).toBeVisible();
  await expect(
    page.locator("[data-testid='billing-list-table']"),
  ).toBeVisible();
  const severe = await collectSevereViolations(page, "/desk/billing");

  expect(
    severe,
    `Unwaived serious/critical a11y violations on /desk/billing [populated]: ${severe
      .map((violation) => `${violation.id} (${violation.impact})`)
      .join(", ")}`,
  ).toEqual([]);
});

test("axe a11y audit: workflow runs focus grid", async ({
  signedInPage: page,
  trustedSession,
}) => {
  await page.goto(`${trustedSession.baseURL}/desk/runs`);
  await waitForAdminShellInteractivity(page);
  await expect(
    page.locator("[data-testid='workflow-runs-list-ready']"),
  ).toBeVisible();
  await expect(
    page.locator("[data-testid='workflow-runs-list-focus-grid']"),
  ).toBeVisible();
  await expect(
    page.locator("[data-testid='workflow-runs-list-entries-table']"),
  ).toBeVisible();
  const severe = await collectSevereViolations(page, "/desk/runs");

  expect(
    severe,
    `Unwaived serious/critical a11y violations on /desk/runs [focus-grid]: ${severe
      .map((violation) => `${violation.id} (${violation.impact})`)
      .join(", ")}`,
  ).toEqual([]);
});

test("axe a11y audit: notification center focus grid", async ({
  signedInPage: page,
  trustedSession,
}) => {
  await page.goto(`${trustedSession.baseURL}/desk/notify`);
  await waitForAdminShellInteractivity(page);
  await expect(page.locator("[data-testid='notify-list-ready']")).toBeVisible();
  await expect(
    page.locator("[data-testid='notify-list-focus-grid']"),
  ).toBeVisible();
  await expect(
    page.locator("[data-testid='notify-list-roster']"),
  ).toBeVisible();
  const severe = await collectSevereViolations(page, "/desk/notify");

  expect(
    severe,
    `Unwaived serious/critical a11y violations on /desk/notify [focus-grid]: ${severe
      .map((violation) => `${violation.id} (${violation.impact})`)
      .join(", ")}`,
  ).toEqual([]);
});

test("axe a11y audit: admin operator tokens focus grid", async ({
  signedInPage: page,
  trustedSession,
}) => {
  await page.goto(`${trustedSession.baseURL}/admin/tokens`);
  await waitForAdminShellInteractivity(page);
  await expect(
    page.locator("[data-testid='admin-tokens-ready']"),
  ).toBeVisible();
  await expect(
    page.locator("[data-testid='admin-tokens-focus-grid']"),
  ).toBeVisible();
  await expect(
    page.locator("[data-testid='admin-tokens-roster']"),
  ).toBeVisible();
  const severe = await collectSevereViolations(page, "/admin/tokens");

  expect(
    severe,
    `Unwaived serious/critical a11y violations on /admin/tokens [focus-grid]: ${severe
      .map((violation) => `${violation.id} (${violation.impact})`)
      .join(", ")}`,
  ).toEqual([]);
});

test("axe a11y audit: tenant workspace members tab", async ({
  signedInPage: page,
  trustedSession,
}) => {
  await page.goto(`${trustedSession.baseURL}${tenantWorkspaceRoute}`);
  await waitForAdminShellInteractivity(page);
  await expect(
    page.locator("[data-testid='tenant-workspace-v2-ready']"),
  ).toBeVisible();
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
  const severe = await collectSevereViolations(page, tenantWorkspaceRoute);

  expect(
    severe,
    `Unwaived serious/critical a11y violations on ${tenantWorkspaceRoute} [members]: ${severe
      .map((violation) => `${violation.id} (${violation.impact})`)
      .join(", ")}`,
  ).toEqual([]);
});

test("axe a11y audit: tenant workspace support tab", async ({
  signedInPage: page,
  trustedSession,
}) => {
  await page.goto(`${trustedSession.baseURL}${tenantWorkspaceRoute}`);
  await waitForAdminShellInteractivity(page);
  await expect(
    page.locator("[data-testid='tenant-workspace-v2-ready']"),
  ).toBeVisible();
  const tenantWorkspaceTabs = page.getByRole("tablist", {
    name: "Tenant workspace sections",
  });
  await expect(tenantWorkspaceTabs).toBeVisible();
  await tenantWorkspaceTabs.getByRole("tab", { name: /Support/ }).click();
  await expect(
    page.locator("[data-testid='tenant-workspace-v2-support-pane']"),
  ).toBeVisible();
  const severe = await collectSevereViolations(page, tenantWorkspaceRoute);

  expect(
    severe,
    `Unwaived serious/critical a11y violations on ${tenantWorkspaceRoute} [support]: ${severe
      .map((violation) => `${violation.id} (${violation.impact})`)
      .join(", ")}`,
  ).toEqual([]);
});
