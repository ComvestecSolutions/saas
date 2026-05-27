import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import type { AnyRouter } from "@tanstack/react-router";
import type { AdminBrowserFixtureState } from "./admin-browser-fixtures";
import {
  clearAdminBrowserFixtureState,
  registerAdminBrowserFixtureState,
} from "./admin-browser-mock-state";

type AdminBrowserHarnessGlobals = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
  __ADMIN_BROWSER_HARNESS__?: boolean;
};

const adminBrowserHarnessGlobals = globalThis as AdminBrowserHarnessGlobals;

const restoreAdminBrowserHarnessFlag = (
  previousHarnessFlag: boolean | undefined,
): void => {
  if (previousHarnessFlag === undefined) {
    delete adminBrowserHarnessGlobals.__ADMIN_BROWSER_HARNESS__;
    return;
  }

  adminBrowserHarnessGlobals.__ADMIN_BROWSER_HARNESS__ = previousHarnessFlag;
};

const restoreReactActEnvironment = (
  previousActEnvironment: boolean | undefined,
): void => {
  if (previousActEnvironment === undefined) {
    delete adminBrowserHarnessGlobals.IS_REACT_ACT_ENVIRONMENT;
    return;
  }

  adminBrowserHarnessGlobals.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
};

vi.mock("/src/lib/admin-shell-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/admin-shell-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminShellLoaderData: mockState.mockedLoaders.shell,
    };
  } catch (error) {
    console.error("admin-shell-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/operations-home-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/operations-home-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminOperationsHomeLoaderData: mockState.mockedLoaders.operationsHome,
    };
  } catch (error) {
    console.error("operations-home-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/capability-snapshot-v2-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/capability-snapshot-v2-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminCapabilitySnapshotV2LoaderData:
        mockState.mockedLoaders.capabilitySnapshotV2,
    };
  } catch (error) {
    console.error("capability-snapshot-v2-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/capability-snapshot-v2-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminCapabilitySnapshotV2Data: () =>
        mockState.mockedLoaders.capabilitySnapshotV2(),
    };
  } catch (error) {
    console.error("capability-snapshot-v2-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/tenants-directory-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/tenants-directory-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminTenantsDirectoryLoaderData:
        mockState.mockedLoaders.tenantsDirectory,
    };
  } catch (error) {
    console.error("tenants-directory-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/tenants-directory-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminTenantsDirectoryData: () =>
        mockState.mockedLoaders.tenantsDirectory(),
    };
  } catch (error) {
    console.error("tenants-directory-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/audit-log-v2-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/audit-log-v2-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminAuditLogV2LoaderData: (rawSearch: unknown) =>
        mockState.mockedLoaders.auditLogV2(rawSearch ?? {}),
    };
  } catch (error) {
    console.error("audit-log-v2-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/audit-log-v2-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminAuditLogV2Data: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.auditLogV2(input?.data ?? {}),
      getAdminAuditLogV2Export: () =>
        Promise.resolve({
          exportedAt: new Date(0).toISOString(),
          recordCount: 0,
          filter: {},
          events: [],
        }),
    };
  } catch (error) {
    console.error("audit-log-v2-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/governance-config-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/governance-config-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminGovernanceConfigV2LoaderData: (input: unknown) =>
        mockState.mockedLoaders.governanceConfigV2(
          (input ?? {}) as Parameters<
            typeof mockState.mockedLoaders.governanceConfigV2
          >[0],
        ),
    };
  } catch (error) {
    console.error("governance-config-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/governance-config-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminGovernanceConfigV2Data: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.governanceConfigV2(
          (input?.data ?? {}) as Parameters<
            typeof mockState.mockedLoaders.governanceConfigV2
          >[0],
        ),
    };
  } catch (error) {
    console.error("governance-config-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/governance-flag-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/governance-flag-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminGovernanceFlagV2LoaderData: (input: unknown) =>
        mockState.mockedLoaders.governanceFlagV2(
          (input ?? {}) as Parameters<
            typeof mockState.mockedLoaders.governanceFlagV2
          >[0],
        ),
    };
  } catch (error) {
    console.error("governance-flag-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/governance-flag-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminGovernanceFlagV2Data: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.governanceFlagV2(
          (input?.data ?? {}) as Parameters<
            typeof mockState.mockedLoaders.governanceFlagV2
          >[0],
        ),
    };
  } catch (error) {
    console.error("governance-flag-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/governance-access-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/governance-access-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminGovernanceAccessV2LoaderData: (input: unknown) =>
        mockState.mockedLoaders.governanceAccessV2(
          (input ?? {}) as Parameters<
            typeof mockState.mockedLoaders.governanceAccessV2
          >[0],
        ),
    };
  } catch (error) {
    console.error("governance-access-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/governance-access-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminGovernanceAccessV2Data: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.governanceAccessV2(
          (input?.data ?? {}) as Parameters<
            typeof mockState.mockedLoaders.governanceAccessV2
          >[0],
        ),
    };
  } catch (error) {
    console.error("governance-access-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/universal-search-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/universal-search-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminUniversalSearchLoaderData: (input: unknown) =>
        mockState.mockedLoaders.universalSearch(
          (input ?? { query: "" }) as Parameters<
            typeof mockState.mockedLoaders.universalSearch
          >[0],
        ),
    };
  } catch (error) {
    console.error("universal-search-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/universal-search-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminUniversalSearchData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.universalSearch(
          (input?.data ?? { query: "" }) as Parameters<
            typeof mockState.mockedLoaders.universalSearch
          >[0],
        ),
    };
  } catch (error) {
    console.error("universal-search-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/tenant-workspace-v2-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/tenant-workspace-v2-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminTenantWorkspaceV2LoaderData:
        mockState.mockedLoaders.tenantWorkspaceV2,
    };
  } catch (error) {
    console.error("tenant-workspace-v2-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/tenant-workspace-v2-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminTenantWorkspaceV2Data: (input: {
        readonly data: Parameters<
          typeof mockState.mockedLoaders.tenantWorkspaceV2
        >[0];
      }) => mockState.mockedLoaders.tenantWorkspaceV2(input.data),
    };
  } catch (error) {
    console.error("tenant-workspace-v2-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/tenant-repair-route-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/tenant-repair-route-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminTenantRepairLoaderData: mockState.mockedLoaders.repair,
    };
  } catch (error) {
    console.error("tenant-repair-route-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/operational-loaders", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/operational-loaders")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminSupportOperationsLoaderData: mockState.mockedLoaders.support,
      loadAdminBillingLoaderData: mockState.mockedLoaders.billing,
      loadAdminBrandingLoaderData: mockState.mockedLoaders.branding,
      loadAdminComplianceRetentionLoaderData:
        mockState.mockedLoaders.compliance,
      loadAdminWebhooksApiAccessLoaderData: mockState.mockedLoaders.webhooks,
    };
  } catch (error) {
    console.error("operational-loaders mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/governance-loaders", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/governance-loaders")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminRuntimeConfigLoaderData: mockState.mockedLoaders.runtimeConfig,
      loadAdminFeatureFlagsLoaderData: mockState.mockedLoaders.featureFlags,
      loadAdminAccessControlLoaderData: mockState.mockedLoaders.accessControl,
      loadAdminAuditLogLoaderData: mockState.mockedLoaders.auditLog,
    };
  } catch (error) {
    console.error("governance-loaders mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/tenant-workspace-index-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/tenant-workspace-index-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminTenantWorkspaceIndexLoaderData:
        mockState.mockedLoaders.tenantWorkspaceIndex,
    };
  } catch (error) {
    console.error("tenant-workspace-index-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/tenant-repair-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminTenantRepairData: (input?: {
        readonly data?: {
          readonly inspectionReason?: string;
        };
      }) => mockState.mockedLoaders.repair(input?.data ?? {}),
      replayAdminTenantRepairGap: mockState.mockedLoaders.replayRepairGap,
      cancelAdminTenantRepairGap: mockState.mockedLoaders.cancelRepairGap,
    };
  } catch (error) {
    console.error("tenant-repair-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/access-control-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      deleteAdminAccessControlTuple: mockState.mockedLoaders.deleteAccessTuple,
      provisionAdminAccessControlOperator:
        mockState.mockedLoaders.provisionAccessOperator,
    };
  } catch (error) {
    console.error("access-control-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/admin-shell-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminShellData: () =>
        mockState.mockedLoaders.shell({ pathname: "/", searchStr: "" }),
    };
  } catch (error) {
    console.error("admin-shell-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/governance-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminRuntimeConfigData: mockState.mockedLoaders.runtimeConfig,
      getAdminFeatureFlagsData: mockState.mockedLoaders.featureFlags,
      getAdminAccessControlData: (input?: {
        readonly data?: Record<string, string>;
      }) => mockState.mockedLoaders.accessControl(input?.data ?? {}),
      getAdminAuditLogData: (input?: {
        readonly data?: {
          readonly moduleId?: string;
        };
      }) => mockState.mockedLoaders.auditLog(input?.data?.moduleId),
    };
  } catch (error) {
    console.error("governance-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/operational-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminSupportOperationsData: mockState.mockedLoaders.support,
      getAdminBillingData: mockState.mockedLoaders.billing,
      getAdminBrandingData: (input: {
        readonly data: {
          readonly scope?: string;
          readonly scopeId?: string;
        };
      }) =>
        mockState.mockedLoaders.branding(input.data.scope, input.data.scopeId),
      getAdminComplianceRetentionData: (input: {
        readonly data: {
          readonly scope?: string;
          readonly scopeId?: string;
        };
      }) =>
        mockState.mockedLoaders.compliance(
          input.data.scope,
          input.data.scopeId,
        ),
      getAdminWebhooksApiAccessData: (input: {
        readonly data: {
          readonly scope?: string;
          readonly scopeId?: string;
        };
      }) =>
        mockState.mockedLoaders.webhooks(input.data.scope, input.data.scopeId),
    };
  } catch (error) {
    console.error("operational-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/tenant-workspace-index-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminTenantWorkspaceIndexData:
        mockState.mockedLoaders.tenantWorkspaceIndex,
    };
  } catch (error) {
    console.error("tenant-workspace-index-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/tenant-workspace-mutations-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      mutateAdminTenantMembership:
        mockState.mockedLoaders.mutateTenantMembership,
      issueAdminTenantInvitation: mockState.mockedLoaders.issueTenantInvitation,
      revokeAdminTenantInvitation:
        mockState.mockedLoaders.revokeTenantInvitation,
    };
  } catch (error) {
    console.error("tenant-workspace-mutations-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/workflow-run-detail-mutations-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      replayAdminWorkflowRun: mockState.mockedLoaders.replayWorkflowRun,
      cancelAdminWorkflowRun: mockState.mockedLoaders.cancelWorkflowRun,
    };
  } catch (error) {
    console.error("workflow-run-detail-mutations-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/incident-detail-mutations-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      releaseAdminBreakGlassGrant:
        mockState.mockedLoaders.releaseBreakGlassGrant,
    };
  } catch (error) {
    console.error("incident-detail-mutations-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/run-as-banner-mutations-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      releaseAdminRunAsGrant: mockState.mockedLoaders.releaseRunAsGrant,
    };
  } catch (error) {
    console.error("run-as-banner-mutations-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/legal-hold-detail-mutations-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      releaseAdminLegalHold: mockState.mockedLoaders.releaseLegalHold,
    };
  } catch (error) {
    console.error("legal-hold-detail-mutations-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/delivery-detail-mutations-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      retryAdminWebhookDelivery: mockState.mockedLoaders.retryWebhookDelivery,
    };
  } catch (error) {
    console.error("delivery-detail-mutations-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/api-key-detail-mutations-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      rotateAdminWebhookApiKey: mockState.mockedLoaders.rotateWebhookApiKey,
      revokeAdminWebhookApiKey: mockState.mockedLoaders.revokeWebhookApiKey,
    };
  } catch (error) {
    console.error("api-key-detail-mutations-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/domain-detail-mutations-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      verifyAdminCustomDomain: mockState.mockedLoaders.verifyCustomDomain,
    };
  } catch (error) {
    console.error("domain-detail-mutations-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/admin-members-mutations-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      inviteAdminMember: mockState.mockedLoaders.inviteAdminMember,
      removeAdminMember: mockState.mockedLoaders.removeAdminMember,
    };
  } catch (error) {
    console.error("admin-members-mutations-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/admin-workspaces-mutations-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      createAdminWorkspace: mockState.mockedLoaders.createAdminWorkspace,
      deleteAdminWorkspace: mockState.mockedLoaders.deleteAdminWorkspace,
    };
  } catch (error) {
    console.error("admin-workspaces-mutations-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/admin-tokens-mutations-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      issueAdminOperatorTestToken:
        mockState.mockedLoaders.issueAdminOperatorTestToken,
      revokeAdminOperatorTestToken:
        mockState.mockedLoaders.revokeAdminOperatorTestToken,
    };
  } catch (error) {
    console.error("admin-tokens-mutations-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/notify-detail-mutations-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      resendAdminNotification: mockState.mockedLoaders.resendNotification,
    };
  } catch (error) {
    console.error("notify-detail-mutations-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/governance-config-mutations-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      submitAdminRuntimeConfigOverrideProposal:
        mockState.mockedLoaders.submitRuntimeConfigProposal,
      reviewAdminRuntimeConfigProposal:
        mockState.mockedLoaders.reviewRuntimeConfigProposal,
    };
  } catch (error) {
    console.error("governance-config-mutations-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/governance-flag-mutations-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      submitAdminFeatureFlagProposal:
        mockState.mockedLoaders.submitFeatureFlagProposal,
      reviewAdminFeatureFlagProposal:
        mockState.mockedLoaders.reviewFeatureFlagProposal,
    };
  } catch (error) {
    console.error("governance-flag-mutations-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/governance-access-mutations-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      revokeAdminAuthorizationTuple:
        mockState.mockedLoaders.revokeAuthorizationTuple,
    };
  } catch (error) {
    console.error("governance-access-mutations-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/auth/start-route", () => ({
  handleAdminAuthStartRequest: () =>
    Promise.resolve(
      new Response(null, {
        status: 302,
        headers: { Location: "/sign-in" },
      }),
    ),
}));

vi.mock("/src/auth/callback-route", () => ({
  handleAdminAuthCallbackRequest: () =>
    Promise.resolve(
      new Response(null, {
        status: 302,
        headers: { Location: "/desk" },
      }),
    ),
}));

vi.mock("/src/auth/session-transport-route", () => ({
  handleAdminSessionTransportResetRequest: () =>
    Promise.resolve(
      new Response(null, {
        status: 302,
        headers: { Location: "/sign-in" },
      }),
    ),
  handleAdminLogoutRequest: () =>
    Promise.resolve(
      new Response(null, {
        status: 302,
        headers: { Location: "/sign-in" },
      }),
    ),
  handleAdminStaleSessionRecoveryRequest: () =>
    Promise.resolve(
      new Response(null, {
        status: 302,
        headers: { Location: "/sign-in" },
      }),
    ),
}));

vi.mock("/src/lib/billing-list-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/billing-list-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminBillingListLoaderData: (input: unknown) =>
        mockState.mockedLoaders.billingList(
          (input ?? { tenantTargets: [] }) as Parameters<
            typeof mockState.mockedLoaders.billingList
          >[0],
        ),
    };
  } catch (error) {
    console.error("billing-list-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/billing-list-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminBillingListData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.billingList(
          (input?.data ?? { tenantTargets: [] }) as Parameters<
            typeof mockState.mockedLoaders.billingList
          >[0],
        ),
    };
  } catch (error) {
    console.error("billing-list-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/invoice-detail-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/invoice-detail-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminInvoiceDetailLoaderData: (input: unknown) =>
        mockState.mockedLoaders.invoiceDetail(
          input as Parameters<typeof mockState.mockedLoaders.invoiceDetail>[0],
        ),
    };
  } catch (error) {
    console.error("invoice-detail-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/invoice-detail-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminInvoiceDetailData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.invoiceDetail(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.invoiceDetail
          >[0],
        ),
    };
  } catch (error) {
    console.error("invoice-detail-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/meter-detail-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/meter-detail-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminMeterDetailLoaderData: (input: unknown) =>
        mockState.mockedLoaders.meterDetail(
          input as Parameters<typeof mockState.mockedLoaders.meterDetail>[0],
        ),
    };
  } catch (error) {
    console.error("meter-detail-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/meter-detail-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminMeterDetailData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.meterDetail(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.meterDetail
          >[0],
        ),
    };
  } catch (error) {
    console.error("meter-detail-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/keycloak-user-detail-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/keycloak-user-detail-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminKeycloakUserDetailLoaderData: (input: unknown) =>
        mockState.mockedLoaders.keycloakUserDetail(
          input as Parameters<
            typeof mockState.mockedLoaders.keycloakUserDetail
          >[0],
        ),
    };
  } catch (error) {
    console.error("keycloak-user-detail-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/keycloak-user-detail-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminKeycloakUserDetailData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.keycloakUserDetail(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.keycloakUserDetail
          >[0],
        ),
    };
  } catch (error) {
    console.error("keycloak-user-detail-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/keycloak-role-detail-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/keycloak-role-detail-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminKeycloakRoleDetailLoaderData: (input: unknown) =>
        mockState.mockedLoaders.keycloakRoleDetail(
          input as Parameters<
            typeof mockState.mockedLoaders.keycloakRoleDetail
          >[0],
        ),
    };
  } catch (error) {
    console.error("keycloak-role-detail-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/keycloak-role-detail-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminKeycloakRoleDetailData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.keycloakRoleDetail(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.keycloakRoleDetail
          >[0],
        ),
    };
  } catch (error) {
    console.error("keycloak-role-detail-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/branding-list-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/branding-list-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminBrandingListLoaderData: (input: unknown) =>
        mockState.mockedLoaders.brandingList(
          input as Parameters<typeof mockState.mockedLoaders.brandingList>[0],
        ),
    };
  } catch (error) {
    console.error("branding-list-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/branding-list-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminBrandingListData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.brandingList(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.brandingList
          >[0],
        ),
    };
  } catch (error) {
    console.error("branding-list-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/domain-detail-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/domain-detail-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminDomainDetailLoaderData: (input: unknown) =>
        mockState.mockedLoaders.domainDetail(
          input as Parameters<typeof mockState.mockedLoaders.domainDetail>[0],
        ),
    };
  } catch (error) {
    console.error("domain-detail-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/domain-detail-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminDomainDetailData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.domainDetail(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.domainDetail
          >[0],
        ),
    };
  } catch (error) {
    console.error("domain-detail-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/support-cases-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/support-cases-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminSupportCasesLoaderData: (input: unknown) =>
        mockState.mockedLoaders.supportCases(
          (input ?? {}) as Parameters<
            typeof mockState.mockedLoaders.supportCases
          >[0],
        ),
    };
  } catch (error) {
    console.error("support-cases-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/support-cases-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminSupportCasesData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.supportCases(
          (input?.data ?? {}) as Parameters<
            typeof mockState.mockedLoaders.supportCases
          >[0],
        ),
    };
  } catch (error) {
    console.error("support-cases-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/incident-detail-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/incident-detail-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminIncidentDetailLoaderData: (input: unknown) =>
        mockState.mockedLoaders.incidentDetail(
          input as Parameters<typeof mockState.mockedLoaders.incidentDetail>[0],
        ),
    };
  } catch (error) {
    console.error("incident-detail-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/incident-detail-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminIncidentDetailData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.incidentDetail(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.incidentDetail
          >[0],
        ),
    };
  } catch (error) {
    console.error("incident-detail-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/retention-list-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/retention-list-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminRetentionListLoaderData: (input: unknown) =>
        mockState.mockedLoaders.retentionList(
          (input ?? {}) as Parameters<
            typeof mockState.mockedLoaders.retentionList
          >[0],
        ),
    };
  } catch (error) {
    console.error("retention-list-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/retention-list-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminRetentionListData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.retentionList(
          (input?.data ?? {}) as Parameters<
            typeof mockState.mockedLoaders.retentionList
          >[0],
        ),
    };
  } catch (error) {
    console.error("retention-list-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/legal-hold-detail-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/legal-hold-detail-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminLegalHoldDetailLoaderData: (input: unknown) =>
        mockState.mockedLoaders.legalHoldDetail(
          input as Parameters<
            typeof mockState.mockedLoaders.legalHoldDetail
          >[0],
        ),
    };
  } catch (error) {
    console.error("legal-hold-detail-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/legal-hold-detail-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminLegalHoldDetailData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.legalHoldDetail(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.legalHoldDetail
          >[0],
        ),
    };
  } catch (error) {
    console.error("legal-hold-detail-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/webhook-list-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/webhook-list-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminWebhookListLoaderData: (input: unknown) =>
        mockState.mockedLoaders.webhookList(
          input as Parameters<typeof mockState.mockedLoaders.webhookList>[0],
        ),
    };
  } catch (error) {
    console.error("webhook-list-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/webhook-list-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminWebhookListData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.webhookList(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.webhookList
          >[0],
        ),
    };
  } catch (error) {
    console.error("webhook-list-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/delivery-detail-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/delivery-detail-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminDeliveryDetailLoaderData: (input: unknown) =>
        mockState.mockedLoaders.deliveryDetail(
          input as Parameters<typeof mockState.mockedLoaders.deliveryDetail>[0],
        ),
    };
  } catch (error) {
    console.error("delivery-detail-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/delivery-detail-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminDeliveryDetailData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.deliveryDetail(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.deliveryDetail
          >[0],
        ),
    };
  } catch (error) {
    console.error("delivery-detail-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/api-key-detail-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/api-key-detail-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminApiKeyDetailLoaderData: (input: unknown) =>
        mockState.mockedLoaders.apiKeyDetail(
          input as Parameters<typeof mockState.mockedLoaders.apiKeyDetail>[0],
        ),
    };
  } catch (error) {
    console.error("api-key-detail-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/api-key-detail-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminApiKeyDetailData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.apiKeyDetail(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.apiKeyDetail
          >[0],
        ),
    };
  } catch (error) {
    console.error("api-key-detail-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/vendor-list-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/vendor-list-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminVendorListLoaderData: (input: unknown) =>
        mockState.mockedLoaders.vendorList(),
    };
  } catch (error) {
    console.error("vendor-list-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/vendor-list-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminVendorListData: () => mockState.mockedLoaders.vendorList(),
    };
  } catch (error) {
    console.error("vendor-list-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/vendor-detail-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/vendor-detail-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminVendorDetailLoaderData: (input: unknown) =>
        mockState.mockedLoaders.vendorDetail(
          input as Parameters<typeof mockState.mockedLoaders.vendorDetail>[0],
        ),
    };
  } catch (error) {
    console.error("vendor-detail-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/vendor-detail-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminVendorDetailData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.vendorDetail(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.vendorDetail
          >[0],
        ),
    };
  } catch (error) {
    console.error("vendor-detail-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/notify-list-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/notify-list-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminNotifyListLoaderData: (input: unknown) =>
        mockState.mockedLoaders.notifyList(
          input as Parameters<typeof mockState.mockedLoaders.notifyList>[0],
        ),
    };
  } catch (error) {
    console.error("notify-list-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/notify-list-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminNotifyListData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.notifyList(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.notifyList
          >[0],
        ),
    };
  } catch (error) {
    console.error("notify-list-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/notify-detail-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/notify-detail-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminNotifyDetailLoaderData: (input: unknown) =>
        mockState.mockedLoaders.notifyDetail(
          input as Parameters<typeof mockState.mockedLoaders.notifyDetail>[0],
        ),
    };
  } catch (error) {
    console.error("notify-detail-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/notify-detail-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminNotifyDetailData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.notifyDetail(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.notifyDetail
          >[0],
        ),
    };
  } catch (error) {
    console.error("notify-detail-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/admin-profile-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/admin-profile-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminProfileLoaderData: () => mockState.mockedLoaders.adminProfile(),
    };
  } catch (error) {
    console.error("admin-profile-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/admin-profile-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminProfileData: () => mockState.mockedLoaders.adminProfile(),
    };
  } catch (error) {
    console.error("admin-profile-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/admin-members-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/admin-members-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminMembersLoaderData: (input: unknown) =>
        mockState.mockedLoaders.adminMembers(
          input as Parameters<typeof mockState.mockedLoaders.adminMembers>[0],
        ),
    };
  } catch (error) {
    console.error("admin-members-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/admin-members-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminMembersData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.adminMembers(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.adminMembers
          >[0],
        ),
    };
  } catch (error) {
    console.error("admin-members-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/admin-member-detail-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/admin-member-detail-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminMemberDetailLoaderData: (input: unknown) =>
        mockState.mockedLoaders.adminMemberDetail(
          input as Parameters<
            typeof mockState.mockedLoaders.adminMemberDetail
          >[0],
        ),
    };
  } catch (error) {
    console.error("admin-member-detail-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/admin-member-detail-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminMemberDetailData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.adminMemberDetail(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.adminMemberDetail
          >[0],
        ),
    };
  } catch (error) {
    console.error("admin-member-detail-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/admin-workspaces-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/admin-workspaces-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminWorkspacesLoaderData: () =>
        mockState.mockedLoaders.adminWorkspaces(),
    };
  } catch (error) {
    console.error("admin-workspaces-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/admin-workspaces-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminWorkspacesData: () => mockState.mockedLoaders.adminWorkspaces(),
    };
  } catch (error) {
    console.error("admin-workspaces-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/admin-audit-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/admin-audit-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminAuditLoaderData: () => mockState.mockedLoaders.adminAudit(),
    };
  } catch (error) {
    console.error("admin-audit-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/admin-audit-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminAuditData: () => mockState.mockedLoaders.adminAudit(),
    };
  } catch (error) {
    console.error("admin-audit-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/admin-tokens-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/admin-tokens-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminTokensLoaderData: (input: unknown) =>
        mockState.mockedLoaders.adminTokens(
          input as Parameters<typeof mockState.mockedLoaders.adminTokens>[0],
        ),
    };
  } catch (error) {
    console.error("admin-tokens-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/admin-tokens-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminTokensData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.adminTokens(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.adminTokens
          >[0],
        ),
    };
  } catch (error) {
    console.error("admin-tokens-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/workflow-runs-list-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/workflow-runs-list-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminWorkflowRunsListLoaderData: (input: unknown) =>
        mockState.mockedLoaders.workflowRunsList(
          input as Parameters<
            typeof mockState.mockedLoaders.workflowRunsList
          >[0],
        ),
    };
  } catch (error) {
    console.error("workflow-runs-list-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/workflow-runs-list-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminWorkflowRunsListData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.workflowRunsList(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.workflowRunsList
          >[0],
        ),
    };
  } catch (error) {
    console.error("workflow-runs-list-route-server mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/workflow-run-detail-loader", async (importOriginal) => {
  try {
    const [actual, mockState] = await Promise.all([
      importOriginal<typeof import("../lib/workflow-run-detail-loader")>(),
      import("./admin-browser-mock-state"),
    ]);

    return {
      ...actual,
      loadAdminWorkflowRunDetailLoaderData: (input: unknown) =>
        mockState.mockedLoaders.workflowRunDetail(
          input as Parameters<
            typeof mockState.mockedLoaders.workflowRunDetail
          >[0],
        ),
    };
  } catch (error) {
    console.error("workflow-run-detail-loader mock failed", error);
    throw error;
  }
});

vi.mock("/src/lib/workflow-run-detail-route-server", async () => {
  try {
    const mockState = await import("./admin-browser-mock-state");

    return {
      getAdminWorkflowRunDetailData: (input?: { readonly data?: unknown }) =>
        mockState.mockedLoaders.workflowRunDetail(
          input?.data as Parameters<
            typeof mockState.mockedLoaders.workflowRunDetail
          >[0],
        ),
    };
  } catch (error) {
    console.error("workflow-run-detail-route-server mock failed", error);
    throw error;
  }
});

vi.mock("@tanstack/react-start", async (importOriginal) => {
  try {
    const actual =
      await importOriginal<typeof import("@tanstack/react-start")>();

    return {
      ...actual,
      useServerFn: (serverFn: unknown) => serverFn,
    };
  } catch (error) {
    console.error("@tanstack/react-start mock failed", error);
    throw error;
  }
});

vi.mock("@tanstack/react-router-devtools", () => ({
  TanStackRouterDevtools: () => null,
}));

export type RenderedAdminApp = {
  readonly container: HTMLDivElement;
  readonly root: Root;
  readonly router: AnyRouter;
  readonly cleanup: () => Promise<void>;
};

export const waitFor = async (
  predicate: () => boolean,
  errorMessage: string,
  attempts = 60,
): Promise<void> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  throw new Error(errorMessage);
};

export const renderAdminApp = async (
  fixtureState: AdminBrowserFixtureState,
  initialPath = "/",
): Promise<RenderedAdminApp> => {
  const container = document.createElement("div");
  const previousActEnvironment =
    adminBrowserHarnessGlobals.IS_REACT_ACT_ENVIRONMENT;
  const previousHarnessFlag =
    adminBrowserHarnessGlobals.__ADMIN_BROWSER_HARNESS__;

  if (previousHarnessFlag === true) {
    throw new Error(
      "Concurrent admin browser harness renders are not supported.",
    );
  }

  adminBrowserHarnessGlobals.IS_REACT_ACT_ENVIRONMENT = true;
  registerAdminBrowserFixtureState(fixtureState);
  adminBrowserHarnessGlobals.__ADMIN_BROWSER_HARNESS__ = true;
  document.body.appendChild(container);

  let root: Root | null = null;

  try {
    const [{ createRouter, RouterProvider }, routeModule] = await Promise.all([
      import("@tanstack/react-router"),
      import("../routeTree.gen"),
    ]);

    window.history.replaceState({}, "", initialPath);

    const router = createRouter({
      routeTree: routeModule.routeTree,
      defaultPreload: "intent",
      scrollRestoration: true,
    });

    const appRoot = createRoot(container);
    root = appRoot;

    await act(async () => {
      appRoot.render(<RouterProvider router={router} />);
      await Promise.resolve(router.load());
    });

    await waitFor(
      () => container.textContent !== null && container.textContent.length > 0,
      `Expected admin app to render at ${initialPath}.`,
    );

    return {
      container,
      root: appRoot,
      router,
      cleanup: async () => {
        try {
          await act(async () => {
            appRoot.unmount();
          });
        } finally {
          container.remove();
          clearAdminBrowserFixtureState(fixtureState);
          restoreReactActEnvironment(previousActEnvironment);
          restoreAdminBrowserHarnessFlag(previousHarnessFlag);
        }
      },
    };
  } catch (error) {
    try {
      const mountedRoot = root;

      if (mountedRoot !== null) {
        await act(async () => {
          mountedRoot.unmount();
        });
      }
    } finally {
      container.remove();
      clearAdminBrowserFixtureState(fixtureState);
      restoreReactActEnvironment(previousActEnvironment);
      restoreAdminBrowserHarnessFlag(previousHarnessFlag);
    }

    throw error;
  }
};

const queryElements = <T extends Element>(
  container: ParentNode,
  selector: string,
): T[] => [...container.querySelectorAll<T>(selector)];

const textMatches = (
  value: string | null | undefined,
  expected: string,
): boolean => value?.replace(/\s+/g, " ").trim().includes(expected) ?? false;

const exactTextMatches = (
  value: string | null | undefined,
  expected: string,
): boolean => value?.replace(/\s+/g, " ").trim() === expected;

export const getButtonByText = (
  container: ParentNode,
  text: string,
): HTMLButtonElement => {
  const match = queryElements<HTMLButtonElement>(container, "button").find(
    (button) => textMatches(button.textContent, text),
  );

  if (match === undefined) {
    throw new Error(`Unable to find button with text "${text}".`);
  }

  return match;
};

export const getButtonByExactText = (
  container: ParentNode,
  text: string,
): HTMLButtonElement => {
  const match = queryElements<HTMLButtonElement>(container, "button").find(
    (button) => exactTextMatches(button.textContent, text),
  );

  if (match === undefined) {
    throw new Error(`Unable to find button with exact text "${text}".`);
  }

  return match;
};

export const getLinkByText = (
  container: ParentNode,
  text: string,
): HTMLAnchorElement => {
  const match = queryElements<HTMLAnchorElement>(container, "a").find((link) =>
    textMatches(link.textContent, text),
  );

  if (match === undefined) {
    throw new Error(`Unable to find link with text "${text}".`);
  }

  return match;
};

export const getInputByPlaceholder = (
  container: ParentNode,
  placeholder: string,
): HTMLInputElement => {
  const input = queryElements<HTMLInputElement>(container, "input").find(
    (candidate) => candidate.placeholder === placeholder,
  );

  if (input === undefined) {
    throw new Error(`Unable to find input with placeholder "${placeholder}".`);
  }

  return input;
};

export const getTextareaByPlaceholder = (
  container: ParentNode,
  placeholder: string,
): HTMLTextAreaElement => {
  const textarea = queryElements<HTMLTextAreaElement>(
    container,
    "textarea",
  ).find((candidate) => candidate.placeholder === placeholder);

  if (textarea === undefined) {
    throw new Error(
      `Unable to find textarea with placeholder "${placeholder}".`,
    );
  }

  return textarea;
};

export const getFieldControlByLabel = <
  TControl extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
>(
  container: ParentNode,
  label: string,
  selector: string,
): TControl => {
  const fieldLabel = queryElements<HTMLLabelElement>(container, "label").find(
    (candidate) => textMatches(candidate.textContent, label),
  );

  const control =
    fieldLabel?.querySelector<TControl>(selector) ??
    (() => {
      if (fieldLabel === undefined) {
        return null;
      }

      const controlId = fieldLabel?.getAttribute("for");

      if (controlId === null || controlId === undefined) {
        return null;
      }

      const linkedControl = fieldLabel.ownerDocument?.getElementById(controlId);

      return linkedControl?.matches(selector)
        ? (linkedControl as TControl)
        : null;
    })();

  if (control === null || control === undefined) {
    throw new Error(`Unable to find ${selector} for label "${label}".`);
  }

  return control;
};

const setValue = (
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) => {
  const descriptor = Object.getOwnPropertyDescriptor(
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
    "value",
  );

  const setter = descriptor?.set;

  if (setter === undefined) {
    throw new Error("Unable to resolve a DOM value setter for the element.");
  }

  setter.call(element, value);
};

export const changeInputValue = async (
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): Promise<void> => {
  await act(async () => {
    setValue(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  });
};

export const changeSelectValue = async (
  element: HTMLSelectElement,
  value: string,
): Promise<void> => {
  await act(async () => {
    setValue(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

export const click = async (element: Element): Promise<void> => {
  await act(async () => {
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
};

export const pushPath = async (
  router: AnyRouter,
  path: string,
): Promise<void> => {
  await act(async () => {
    await Promise.resolve(router.navigate({ href: path }));
    await Promise.resolve(router.load());
  });

  const target = new URL(path, "https://admin.local");
  await waitFor(
    () =>
      router.state.location.pathname === target.pathname &&
      router.state.location.searchStr === target.search,
    `Expected router to navigate to ${path}.`,
  );
};

export const followLink = async (
  router: AnyRouter,
  link: HTMLAnchorElement,
): Promise<void> => {
  const href = link.getAttribute("href");

  if (href === null) {
    throw new Error("Expected link to expose an href.");
  }

  await act(async () => {
    link.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
    await Promise.resolve(router.load());
  });

  const target = new URL(href, "https://admin.local");
  await waitFor(
    () =>
      router.state.location.pathname === target.pathname &&
      router.state.location.searchStr === target.search,
    `Expected clicked link to navigate to ${href}.`,
  );
};

export const findCard = (container: ParentNode, title: string): HTMLElement => {
  const card = queryElements<HTMLElement>(container, ".ops-card").find(
    (candidate) =>
      textMatches(
        candidate.querySelector(".ops-card-head__title")?.textContent,
        title,
      ),
  );

  if (card === undefined) {
    throw new Error(`Unable to find ops card titled "${title}".`);
  }

  return card;
};

export const getColumnValues = (
  container: ParentNode,
  columnIndex: number,
): string[] =>
  queryElements<HTMLTableRowElement>(container, "tbody tr").map((row) => {
    const cell = row.querySelectorAll("td").item(columnIndex - 1);
    return cell?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  });

export const getFirstColumnValues = (container: ParentNode): string[] =>
  getColumnValues(container, 1);
