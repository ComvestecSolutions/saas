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
    path: adminRoutePath.supportOperations,
    reason:
      "Support operations require a trusted support or platform operator session.",
    apply: (fixture) => ({
      ...fixture,
      loadSupport: async () => ({
        kind: "denied",
        reason:
          "Support operations require a trusted support or platform operator session.",
      }),
    }),
  },
  {
    name: "billing",
    path: adminRoutePath.billing,
    reason:
      "Billing explanation and reconciliation workflows are currently platform-operator only.",
    apply: (fixture) => ({
      ...fixture,
      loadBilling: async () => ({
        kind: "denied",
        reason:
          "Billing explanation and reconciliation workflows are currently platform-operator only.",
      }),
    }),
  },
  {
    name: "compliance retention",
    path: adminRoutePath.complianceRetention,
    reason: "Compliance review requires a trusted operator session.",
    apply: (fixture) => ({
      ...fixture,
      loadCompliance: async () => ({
        kind: "denied",
        reason: "Compliance review requires a trusted operator session.",
      }),
    }),
  },
  {
    name: "webhooks API access",
    path: adminRoutePath.webhooksApiAccess,
    reason: "Integration inspection requires a trusted operator session.",
    apply: (fixture) => ({
      ...fixture,
      loadWebhooks: async () => ({
        kind: "denied",
        reason: "Integration inspection requires a trusted operator session.",
      }),
    }),
  },
  {
    name: "runtime configuration",
    path: "/governance/runtime-config" as const,
    reason:
      "Runtime config inspection requires a trusted operator session on the governance backend.",
    apply: (fixture) => ({
      ...fixture,
      loadRuntimeConfig: async () => ({
        kind: "denied",
        reason:
          "Runtime config inspection requires a trusted operator session on the governance backend.",
      }),
    }),
  },
  {
    name: "feature flags",
    path: "/governance/feature-flags" as const,
    reason:
      "Feature-flag inspection requires a trusted operator session on the governance backend.",
    apply: (fixture) => ({
      ...fixture,
      loadFeatureFlags: async () => ({
        kind: "denied",
        reason:
          "Feature-flag inspection requires a trusted operator session on the governance backend.",
      }),
    }),
  },
  {
    name: "access control",
    path: adminRoutePath.accessControl,
    reason:
      "Access-control inspection requires a trusted operator session on the governance backend.",
    apply: (fixture) => ({
      ...fixture,
      loadAccessControl: async () => ({
        kind: "denied",
        reason:
          "Access-control inspection requires a trusted operator session on the governance backend.",
      }),
    }),
  },
  {
    name: "audit log",
    path: adminRoutePath.auditLog,
    reason:
      "Audit-log review requires a trusted operator session on the governance backend.",
    apply: (fixture) => ({
      ...fixture,
      loadAuditLog: async () => ({
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
    path: adminRoutePath.supportOperations,
    expectedDescription: "Re-authenticate to access support operations.",
    apply: (fixture) => ({
      ...fixture,
      loadSupport: async () => ({ kind: "stale-session" }),
    }),
  },
  {
    name: "billing",
    path: adminRoutePath.billing,
    expectedDescription: "Re-authenticate to view billing data.",
    apply: (fixture) => ({
      ...fixture,
      loadBilling: async () => ({ kind: "stale-session" }),
    }),
  },
  {
    name: "compliance retention",
    path: adminRoutePath.complianceRetention,
    expectedDescription: "Re-authenticate to access compliance and retention.",
    apply: (fixture) => ({
      ...fixture,
      loadCompliance: async () => ({ kind: "stale-session" }),
    }),
  },
  {
    name: "webhooks API access",
    path: adminRoutePath.webhooksApiAccess,
    expectedDescription: "Re-authenticate to view integration data.",
    apply: (fixture) => ({
      ...fixture,
      loadWebhooks: async () => ({ kind: "stale-session" }),
    }),
  },
  {
    name: "runtime configuration",
    path: "/governance/runtime-config" as const,
    expectedDescription: "Re-authenticate to access runtime configuration.",
    apply: (fixture) => ({
      ...fixture,
      loadRuntimeConfig: async () => ({ kind: "stale-session" }),
    }),
  },
  {
    name: "feature flags",
    path: "/governance/feature-flags" as const,
    expectedDescription: "Re-authenticate to access feature flags.",
    apply: (fixture) => ({
      ...fixture,
      loadFeatureFlags: async () => ({ kind: "stale-session" }),
    }),
  },
  {
    name: "access control",
    path: adminRoutePath.accessControl,
    expectedDescription: "Re-authenticate to access authorization data.",
    apply: (fixture) => ({
      ...fixture,
      loadAccessControl: async () => ({ kind: "stale-session" }),
    }),
  },
  {
    name: "audit log",
    path: adminRoutePath.auditLog,
    expectedDescription: "Re-authenticate to access the audit log.",
    apply: (fixture) => ({
      ...fixture,
      loadAuditLog: async () => ({ kind: "stale-session" }),
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
    path: adminRoutePath.supportOperations,
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to access support operations.",
    apply: (fixture) => ({
      ...fixture,
      loadSupport: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "billing",
    path: adminRoutePath.billing,
    expectedDescription:
      "Sign in with a platform-operator session to view billing repair gaps.",
    apply: (fixture) => ({
      ...fixture,
      loadBilling: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "branding",
    path: buildOrganizationScopedPath(adminRoutePath.branding),
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to view tenant branding.",
    apply: (fixture) => ({
      ...fixture,
      loadBranding: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "compliance retention",
    path: buildOrganizationScopedPath(adminRoutePath.complianceRetention),
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to access compliance and retention.",
    apply: (fixture) => ({
      ...fixture,
      loadCompliance: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "webhooks API access",
    path: buildOrganizationScopedPath(adminRoutePath.webhooksApiAccess),
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to view webhooks and API access.",
    apply: (fixture) => ({
      ...fixture,
      loadWebhooks: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "runtime configuration",
    path: "/governance/runtime-config" as const,
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to access runtime configuration.",
    apply: (fixture) => ({
      ...fixture,
      loadRuntimeConfig: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "feature flags",
    path: "/governance/feature-flags" as const,
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to access feature flags.",
    apply: (fixture) => ({
      ...fixture,
      loadFeatureFlags: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "access control",
    path: adminRoutePath.accessControl,
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to access authorization data.",
    apply: (fixture) => ({
      ...fixture,
      loadAccessControl: async () => ({ kind: "shell" }),
    }),
  },
  {
    name: "audit log",
    path: adminRoutePath.auditLog,
    expectedDescription:
      "Sign in with a platform-operator or support-operator session to access the audit log.",
    apply: (fixture) => ({
      ...fixture,
      loadAuditLog: async () => ({ kind: "shell" }),
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
      `${adminRoutePath.branding}?scope=${platformScope.individual}&scopeId=ind_demo`,
    );

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected branding denied state to render for unsupported tenant targets.",
    );
    expect(rendered.container.textContent).toContain(
      "Branding view currently supports organization and enterprise tenant targets.",
    );
  });

  it("renders branding access denied when the control plane blocks support-safe branding access", async () => {
    const deniedReason =
      "Branding inspection requires a trusted operator session and support-safe projection policies.";

    rendered = await renderAdminApp(
      {
        ...createAdminBrowserFixtureState(),
        loadBranding: async () => ({
          kind: "denied",
          reason: deniedReason,
        }),
      },
      buildOrganizationScopedPath(adminRoutePath.branding),
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
      loadBranding: async () => ({ kind: "stale-session" }),
    };

    rendered = await renderAdminApp(
      staleFixture,
      buildOrganizationScopedPath(adminRoutePath.branding),
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Session refresh required") ??
        false,
      "Expected branding stale-session state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Re-authenticate to view tenant branding.",
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
