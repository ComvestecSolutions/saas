import { afterEach, describe, expect, it } from "vitest";
import { adminRoutePath, platformScope } from "@comvestec/contracts";
import { buildAdminTenantWorkspacePath } from "../lib/admin-tenant-target";
import {
  followLink,
  getLinkByText,
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "./admin-browser-harness";
import {
  createAdminBrowserFixtureState,
  knownAdminTargets,
  type AdminBrowserFixtureState,
} from "./admin-browser-fixtures";

type FixtureTransform = (
  fixture: AdminBrowserFixtureState,
) => AdminBrowserFixtureState;

const buildOrganizationScopedPath = (path: string): string =>
  `${path}?scope=${knownAdminTargets.organization.scope}&scopeId=${knownAdminTargets.organization.scopeId}`;

const legacyAdminRoutePath = {
  branding: "/branding",
  supportOperations: "/support-operations",
  billing: "/billing",
  complianceRetention: "/compliance-retention",
  webhooksApiAccess: "/integrations/webhooks-api-access",
  runtimeConfig: "/governance/runtime-config",
  featureFlags: "/governance/feature-flags",
  accessControl: "/governance/access-control",
  auditLog: "/governance/audit-log",
} as const;

const deniedRouteCases: ReadonlyArray<{
  readonly name: string;
  readonly path: string;
  readonly reason: string;
  readonly apply: FixtureTransform;
}> = [
  {
    name: "operations home",
    path: adminRoutePath.operationsHome,
    reason:
      "Operations Home requires a trusted operator session resolved by the backend control plane.",
    apply: (fixture) => ({
      ...fixture,
      loadOperationsHome: async () => ({
        kind: "denied",
        reason:
          "Operations Home requires a trusted operator session resolved by the backend control plane.",
      }),
    }),
  },
  {
    name: "tenant workspace discovery",
    path: adminRoutePath.tenantWorkspaceDiscovery,
    reason:
      "Tenant workspace composition currently depends on platform-operator tenant-management and billing surfaces.",
    apply: (fixture) => ({
      ...fixture,
      loadTenantsDirectory: async () => ({
        kind: "denied",
        reason:
          "Tenant workspace composition currently depends on platform-operator tenant-management and billing surfaces.",
      }),
    }),
  },
  {
    name: "tenant workspace detail",
    path: buildAdminTenantWorkspacePath(knownAdminTargets.organization),
    reason:
      "Tenant workspace composition currently depends on platform-operator tenant-management and billing surfaces.",
    apply: (fixture) => ({
      ...fixture,
      loadTenantWorkspaceV2: async () => ({
        kind: "denied",
        reason:
          "Tenant workspace composition currently depends on platform-operator tenant-management and billing surfaces.",
      }),
    }),
  },
  {
    name: "support operations",
    path: legacyAdminRoutePath.supportOperations,
    reason:
      "Support operations require a trusted support or platform operator session.",
    apply: (fixture) => ({
      ...fixture,
      loadSupportCases: async () => ({
        kind: "denied",
        reason:
          "Support operations require a trusted support or platform operator session.",
      }),
    }),
  },
  {
    name: "billing",
    path: legacyAdminRoutePath.billing,
    reason:
      "Billing explanation and reconciliation workflows are currently platform-operator only.",
    apply: (fixture) => ({
      ...fixture,
      loadBillingList: async () => ({
        kind: "denied",
        reason:
          "Billing explanation and reconciliation workflows are currently platform-operator only.",
      }),
    }),
  },
  {
    name: "compliance retention",
    path: legacyAdminRoutePath.complianceRetention,
    reason: "Compliance review requires a trusted operator session.",
    apply: (fixture) => ({
      ...fixture,
      loadRetentionList: async () => ({
        kind: "denied",
        reason: "Compliance review requires a trusted operator session.",
      }),
    }),
  },
  {
    name: "webhooks API access",
    path: legacyAdminRoutePath.webhooksApiAccess,
    reason: "Integration inspection requires a trusted operator session.",
    apply: (fixture) => ({
      ...fixture,
      loadWebhookList: async () => ({
        kind: "denied",
        reason: "Integration inspection requires a trusted operator session.",
      }),
    }),
  },
  {
    name: "runtime configuration",
    path: legacyAdminRoutePath.runtimeConfig,
    reason:
      "Runtime config inspection requires a trusted operator session on the governance backend.",
    apply: (fixture) => ({
      ...fixture,
      loadGovernanceConfigV2: async () => ({
        kind: "denied",
        reason:
          "Runtime config inspection requires a trusted operator session on the governance backend.",
      }),
    }),
  },
  {
    name: "feature flags",
    path: legacyAdminRoutePath.featureFlags,
    reason:
      "Feature-flag inspection requires a trusted operator session on the governance backend.",
    apply: (fixture) => ({
      ...fixture,
      loadGovernanceFlagV2: async () => ({
        kind: "denied",
        reason:
          "Feature-flag inspection requires a trusted operator session on the governance backend.",
      }),
    }),
  },
  {
    name: "access control",
    path: legacyAdminRoutePath.accessControl,
    reason:
      "Access-control inspection requires a trusted operator session on the governance backend.",
    apply: (fixture) => ({
      ...fixture,
      loadGovernanceAccessV2: async () => ({
        kind: "denied",
        reason:
          "Access-control inspection requires a trusted operator session on the governance backend.",
      }),
    }),
  },
  {
    name: "audit log",
    path: legacyAdminRoutePath.auditLog,
    reason:
      "Audit-log review requires a trusted operator session on the governance backend.",
    apply: (fixture) => ({
      ...fixture,
      loadAuditLogV2: async () => ({
        kind: "denied",
        reason:
          "Audit-log review requires a trusted operator session on the governance backend.",
      }),
    }),
  },
];

const staleRouteCases: ReadonlyArray<{
  readonly name: string;
  readonly path: string;
  readonly expectedDescription: string;
  readonly apply: FixtureTransform;
}> = [
  {
    name: "repair operations",
    path: adminRoutePath.repairOperations,
    expectedDescription: "Re-authenticate before accessing repair operations.",
    apply: (fixture) => ({
      ...fixture,
      loadRepair: async () => ({ kind: "stale-session" }),
    }),
  },
  {
    name: "operations home",
    path: adminRoutePath.operationsHome,
    expectedDescription:
      "The operator session could not be resolved. Please re-authenticate before continuing.",
    apply: (fixture) => ({
      ...fixture,
      loadOperationsHome: async () => ({ kind: "stale-session" }),
    }),
  },
  {
    name: "tenant workspace discovery",
    path: adminRoutePath.tenantWorkspaceDiscovery,
    expectedDescription:
      "The operator session could not be resolved. Please re-authenticate before continuing.",
    apply: (fixture) => ({
      ...fixture,
      loadTenantsDirectory: async () => ({ kind: "stale-session" }),
    }),
  },
  {
    name: "tenant workspace detail",
    path: buildAdminTenantWorkspacePath(knownAdminTargets.organization),
    expectedDescription: "Re-authenticate before accessing tenant workspace.",
    apply: (fixture) => ({
      ...fixture,
      loadTenantWorkspaceV2: async () => ({ kind: "stale-session" }),
    }),
  },
  {
    name: "support operations",
    path: legacyAdminRoutePath.supportOperations,
    expectedDescription: "Re-authenticate to access the support workspace.",
    apply: (fixture) => ({
      ...fixture,
      loadSupportCases: async () => ({ kind: "stale-session" }),
    }),
  },
  {
    name: "billing",
    path: legacyAdminRoutePath.billing,
    expectedDescription: "Re-authenticate to access billing posture.",
    apply: (fixture) => ({
      ...fixture,
      loadBillingList: async () => ({ kind: "stale-session" }),
    }),
  },
  {
    name: "compliance retention",
    path: legacyAdminRoutePath.complianceRetention,
    expectedDescription: "Re-authenticate to access retention posture.",
    apply: (fixture) => ({
      ...fixture,
      loadRetentionList: async () => ({ kind: "stale-session" }),
    }),
  },
  {
    name: "webhooks API access",
    path: legacyAdminRoutePath.webhooksApiAccess,
    expectedDescription: "Re-authenticate to access webhook posture.",
    apply: (fixture) => ({
      ...fixture,
      loadWebhookList: async () => ({ kind: "stale-session" }),
    }),
  },
  {
    name: "runtime configuration",
    path: legacyAdminRoutePath.runtimeConfig,
    expectedDescription: "Re-authenticate to access runtime configuration.",
    apply: (fixture) => ({
      ...fixture,
      loadGovernanceConfigV2: async () => ({ kind: "stale-session" }),
    }),
  },
  {
    name: "feature flags",
    path: legacyAdminRoutePath.featureFlags,
    expectedDescription: "Re-authenticate to access feature flags.",
    apply: (fixture) => ({
      ...fixture,
      loadGovernanceFlagV2: async () => ({ kind: "stale-session" }),
    }),
  },
  {
    name: "access control",
    path: legacyAdminRoutePath.accessControl,
    expectedDescription: "Re-authenticate to access authorization data.",
    apply: (fixture) => ({
      ...fixture,
      loadGovernanceAccessV2: async () => ({ kind: "stale-session" }),
    }),
  },
  {
    name: "audit log",
    path: legacyAdminRoutePath.auditLog,
    expectedDescription:
      "Re-authenticate to continue investigating audit activity.",
    apply: (fixture) => ({
      ...fixture,
      loadAuditLogV2: async () => ({ kind: "stale-session" }),
    }),
  },
];

const sessionRequiredRouteCases: ReadonlyArray<{
  readonly name: string;
  readonly path: string;
  readonly expectedDescription: string;
  readonly apply: FixtureTransform;
}> = [
  {
    name: "repair operations",
    path: adminRoutePath.repairOperations,
    expectedDescription:
      "Sign in with a platform-operator session to access repair operations.",
    apply: (fixture) => ({
      ...fixture,
      loadRepair: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "operations home",
    path: adminRoutePath.operationsHome,
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to access the admin operations workspace.",
    apply: (fixture) => ({
      ...fixture,
      loadOperationsHome: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "tenant workspace discovery",
    path: adminRoutePath.tenantWorkspaceDiscovery,
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to inspect the tenant directory.",
    apply: (fixture) => ({
      ...fixture,
      loadTenantsDirectory: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "tenant workspace detail",
    path: buildAdminTenantWorkspacePath(knownAdminTargets.organization),
    expectedDescription:
      "Sign in with a platform-operator session to access the tenant workspace.",
    apply: (fixture) => ({
      ...fixture,
      loadTenantWorkspaceV2: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "support operations",
    path: legacyAdminRoutePath.supportOperations,
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to access the support workspace.",
    apply: (fixture) => ({
      ...fixture,
      loadSupportCases: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "billing",
    path: legacyAdminRoutePath.billing,
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to view billing posture.",
    apply: (fixture) => ({
      ...fixture,
      loadBillingList: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "branding",
    path: buildOrganizationScopedPath(legacyAdminRoutePath.branding),
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to view branding posture.",
    apply: (fixture) => ({
      ...fixture,
      loadBrandingList: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "compliance retention",
    path: buildOrganizationScopedPath(legacyAdminRoutePath.complianceRetention),
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to view retention posture.",
    apply: (fixture) => ({
      ...fixture,
      loadRetentionList: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "webhooks API access",
    path: buildOrganizationScopedPath(legacyAdminRoutePath.webhooksApiAccess),
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to view webhook posture.",
    apply: (fixture) => ({
      ...fixture,
      loadWebhookList: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "runtime configuration",
    path: legacyAdminRoutePath.runtimeConfig,
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to access runtime configuration.",
    apply: (fixture) => ({
      ...fixture,
      loadGovernanceConfigV2: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "feature flags",
    path: legacyAdminRoutePath.featureFlags,
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to access feature flags.",
    apply: (fixture) => ({
      ...fixture,
      loadGovernanceFlagV2: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "access control",
    path: legacyAdminRoutePath.accessControl,
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to access authorization data.",
    apply: (fixture) => ({
      ...fixture,
      loadGovernanceAccessV2: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "audit log",
    path: legacyAdminRoutePath.auditLog,
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to inspect audit activity.",
    apply: (fixture) => ({
      ...fixture,
      loadAuditLogV2: async () => ({ kind: "shell" }),
    }),
  },
];

describe("admin route state browser flows", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders repair access denied state when the operator lacks repair permissions", async () => {
    const fixture = createAdminBrowserFixtureState();
    const deniedFixture: AdminBrowserFixtureState = {
      ...fixture,
      loadRepair: async () => ({
        kind: "denied",
        reason:
          "Billing repair workflow controls require a platform-operator session scoped to the platform tenant.",
      }),
    };

    rendered = await renderAdminApp(
      deniedFixture,
      adminRoutePath.repairOperations,
    );

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected repair operations denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Billing repair workflow controls require a platform-operator session scoped to the platform tenant.",
    );
  }, 30_000);

  it("renders branding access denied for unsupported individual tenant targets", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      `${legacyAdminRoutePath.branding}?scope=${platformScope.individual}&scopeId=ind_demo`,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='branding-list-ready']",
        ) !== null,
      "Expected legacy branding redirect to land on the canonical branding surface.",
    );
    expect(rendered.router.state.location.pathname).toBe(
      adminRoutePath.branding,
    );
    expect(rendered.container.textContent).toContain("unsupported scope");
    expect(rendered.container.textContent).toContain("ind_demo");
  });

  it("renders branding access denied when the control plane blocks support-safe branding access", async () => {
    const deniedReason =
      "Branding inspection requires a trusted operator session and support-safe projection policies.";

    rendered = await renderAdminApp(
      {
        ...createAdminBrowserFixtureState(),
        loadBrandingList: async () => ({
          kind: "denied",
          reason: deniedReason,
        }),
      },
      buildOrganizationScopedPath(legacyAdminRoutePath.branding),
    );

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected branding denied state to render for control-plane access denial.",
    );
    expect(rendered.container.textContent).toContain(deniedReason);
  });

  it("renders branding stale-session recovery state when re-authentication is required", async () => {
    const fixture = createAdminBrowserFixtureState();
    const staleFixture: AdminBrowserFixtureState = {
      ...fixture,
      loadBrandingList: async () => ({ kind: "stale-session" }),
    };

    rendered = await renderAdminApp(
      staleFixture,
      buildOrganizationScopedPath(legacyAdminRoutePath.branding),
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Session refresh required") ??
        false,
      "Expected branding stale-session state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Re-authenticate to access branding posture.",
    );
  });

  it.each(deniedRouteCases)(
    "renders %s denied state when the operator lacks access",
    async ({ apply, path, reason }) => {
      rendered = await renderAdminApp(
        apply(createAdminBrowserFixtureState()),
        path,
      );

      await waitFor(
        () =>
          rendered?.container.textContent?.includes("Access denied") ?? false,
        `Expected denied state to render for ${path}.`,
      );
      expect(rendered.container.textContent).toContain(reason);
    },
  );

  it.each(staleRouteCases)(
    "renders %s stale-session state when re-authentication is required",
    async ({ apply, path, expectedDescription }) => {
      rendered = await renderAdminApp(
        apply(createAdminBrowserFixtureState()),
        path,
      );

      await waitFor(
        () =>
          rendered?.container.textContent?.includes(
            "Session refresh required",
          ) ?? false,
        `Expected stale-session state to render for ${path}.`,
      );
      expect(rendered.container.textContent).toContain(expectedDescription);
    },
  );

  it.each(sessionRequiredRouteCases)(
    "renders %s session-required state when the operator session is missing",
    async ({ apply, path, expectedDescription }) => {
      rendered = await renderAdminApp(
        apply(createAdminBrowserFixtureState()),
        path,
      );

      await waitFor(
        () =>
          rendered?.container.textContent?.includes(
            "Operator session required",
          ) ?? false,
        `Expected session-required state to render for ${path}.`,
      );
      expect(rendered.container.textContent).toContain(expectedDescription);
    },
  );

  it("renders tenant workspace discovery errors when the loader fails", async () => {
    rendered = await renderAdminApp(
      {
        ...createAdminBrowserFixtureState(),
        loadTenantsDirectory: async () => ({
          kind: "error",
          title: "Tenant discovery unavailable",
          description: "Tenant discovery data could not be loaded.",
        }),
      },
      adminRoutePath.tenantWorkspaceDiscovery,
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Tenant discovery unavailable",
        ) ?? false,
      "Expected tenant workspace discovery error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Tenant discovery data could not be loaded.",
    );
  });

  it("renders tenant workspace errors and returns the operator to discovery", async () => {
    rendered = await renderAdminApp(
      {
        ...createAdminBrowserFixtureState(),
        loadTenantWorkspaceV2: async () => ({
          kind: "error",
          title: "Tenant workspace unavailable",
          description:
            "The selected tenant target does not exist in browser fixtures.",
        }),
      },
      buildAdminTenantWorkspacePath({
        scope: knownAdminTargets.organization.scope,
        scopeId: "missing-tenant",
      }),
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Tenant workspace unavailable",
        ) ?? false,
      "Expected tenant workspace error state to render for missing targets.",
    );
    expect(rendered.container.textContent).toContain(
      "The selected tenant target does not exist in browser fixtures.",
    );

    await followLink(
      rendered.router,
      getLinkByText(rendered.container, "Return to tenant discovery"),
    );
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenants-directory-ready']",
        ) !== null,
      "Expected workspace error action to return to the canonical tenant directory.",
    );
    expect(rendered.router.state.location.pathname).toBe("/r/tenants");
  });
});
